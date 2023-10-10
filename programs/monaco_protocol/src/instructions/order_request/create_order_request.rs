use anchor_lang::prelude::*;
use protocol_product::state::product::Product;
use solana_program::clock::UnixTimestamp;

use crate::error::CoreError;
use crate::error::CoreError::RequestCreationQueueFull;
use crate::instructions::order::validate_market_for_order;
use crate::instructions::{current_timestamp, market_position, stake_precision_is_within_range};
use crate::state::market_account::Market;
use crate::state::market_order_request_queue::{
    MarketOrderRequestQueue, OrderRequest, OrderRequestData,
};
use crate::state::market_outcome_account::MarketOutcome;
use crate::state::market_position_account::MarketPosition;
use crate::state::price_ladder::{PriceLadder, DEFAULT_PRICES};

pub fn create_order_request(
    market_pk: Pubkey,
    market: &mut Market,
    purchaser: &Signer,
    product: &Option<Account<Product>>,
    market_position: &mut MarketPosition,
    market_outcome: &MarketOutcome,
    price_ladder: &Option<Account<PriceLadder>>,
    order_request_queue: &mut MarketOrderRequestQueue,
    data: OrderRequestData,
) -> Result<u64> {
    let now: UnixTimestamp = current_timestamp();
    validate_order_request(market, market_outcome, price_ladder, &data, now)?;

    // initialize market position if needed
    if market_position.purchaser == Pubkey::default() {
        market_position::create_market_position(purchaser, market_pk, market, market_position)?;
        market.increment_account_counts()?;
    }

    // initialize and enqueue order request on to order_request_queue
    let order_request = initialize_order_request(market, purchaser, product, data, now)?;
    order_request_queue
        .order_requests
        .enqueue(order_request)
        .ok_or(RequestCreationQueueFull)?;

    market_position::update_on_order_request_creation(market_position, &order_request)
}

fn initialize_order_request(
    market: &Market,
    purchaser: &Signer,
    product: &Option<Account<Product>>,
    data: OrderRequestData,
    now: UnixTimestamp,
) -> Result<OrderRequest> {
    let order_request = &mut OrderRequest::default();

    order_request.market_outcome_index = data.market_outcome_index;
    order_request.for_outcome = data.for_outcome;
    order_request.purchaser = purchaser.key();
    order_request.stake = data.stake;
    order_request.expected_price = data.price;
    order_request.delay_expiration_timestamp = match market.is_inplay() {
        true => now
            .checked_add(market.inplay_order_delay as i64)
            .ok_or(CoreError::ArithmeticError),
        false => Ok(0),
    }?;

    match product {
        Some(product_account) => {
            order_request.product = Some(product_account.key());
            order_request.product_commission_rate = product_account.commission_rate;
        }
        None => {
            order_request.product = None;
            order_request.product_commission_rate = 0_f64;
        }
    };

    Ok(*order_request)
}

fn validate_order_request(
    market: &Market,
    market_outcome: &MarketOutcome,
    price_ladder: &Option<Account<PriceLadder>>,
    data: &OrderRequestData,
    now: UnixTimestamp,
) -> Result<()> {
    validate_market_for_order(market, now)?;

    require!(data.stake > 0_u64, CoreError::CreationStakeZeroOrLess);
    require!(data.price > 1_f64, CoreError::CreationPriceOneOrLess);
    let stake_precision_check_result =
        stake_precision_is_within_range(data.stake, market.decimal_limit)?;
    require!(
        stake_precision_check_result,
        CoreError::CreationStakePrecisionIsTooHigh
    );

    // TODO only check against price ladder account once backwards compat. is removed
    if market_outcome.price_ladder.is_empty() {
        // No prices included on the outcome, use a PriceLadder or default prices
        match price_ladder {
            Some(price_ladder_account) => require!(
                price_ladder_account.prices.is_empty()
                    || price_ladder_account.prices.contains(&data.price),
                CoreError::CreationInvalidPrice
            ),
            None => require!(
                DEFAULT_PRICES.contains(&data.price),
                CoreError::CreationInvalidPrice
            ),
        }
    } else {
        // Prices are included on the outcome, use those
        require!(
            market_outcome.price_ladder.contains(&data.price),
            CoreError::CreationInvalidPrice
        );
    }
    Ok(())
}
