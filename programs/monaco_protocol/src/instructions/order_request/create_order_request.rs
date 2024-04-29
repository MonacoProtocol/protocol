use anchor_lang::prelude::*;
use protocol_product::state::product::Product;
use solana_program::clock::UnixTimestamp;

use crate::error::CoreError;
use crate::instructions::{
    current_timestamp, market_position, price_precision_is_within_range,
    stake_precision_is_within_range,
};
use crate::state::market_account::{Market, MarketStatus};
use crate::state::market_order_request_queue::{
    MarketOrderRequestQueue, OrderRequest, OrderRequestData,
};
use crate::state::market_outcome_account::MarketOutcome;
use crate::state::market_position_account::MarketPosition;
use crate::state::price_ladder::{PriceLadder, DEFAULT_PRICES};
use std::ops::Deref;

pub fn create_order_request(
    market_pk: Pubkey,
    market: &mut Market,
    payer: &Signer,
    purchaser: &Signer,
    product: &Option<Account<Product>>,
    market_position: &mut MarketPosition,
    market_outcome: &MarketOutcome,
    price_ladder: &Option<Account<PriceLadder>>,
    order_request_queue: &mut MarketOrderRequestQueue,
    data: OrderRequestData,
) -> Result<u64> {
    let now: UnixTimestamp = current_timestamp();
    // unpack account optionals (works only for non-mut)
    let price_ladder_account = price_ladder.as_ref().map(|v| v.deref());
    validate_order_request(market, market_outcome, &price_ladder_account, &data, now)?;

    // initialize market position if needed
    if market_position.payer == Pubkey::default() {
        market_position::create_market_position(
            purchaser.key,
            payer.key,
            market_pk,
            market,
            market_position,
        )?;
        market.increment_account_counts()?;
    }

    // initialize and enqueue order request on to order_request_queue
    let order_request = initialize_order_request(market, purchaser.key, product, data, now)?;
    require!(
        !order_request_queue.order_requests.contains(&order_request),
        CoreError::OrderRequestCreationDuplicateRequest
    );

    order_request_queue
        .order_requests
        .enqueue(order_request)
        .ok_or(CoreError::OrderRequestCreationQueueFull)?;

    market_position::update_on_order_request_creation(
        market_position,
        order_request.market_outcome_index,
        order_request.for_outcome,
        order_request.stake,
        order_request.expected_price,
    )
}

fn initialize_order_request(
    market: &Market,
    purchaser: &Pubkey,
    product: &Option<Account<Product>>,
    data: OrderRequestData,
    now: UnixTimestamp,
) -> Result<OrderRequest> {
    let order_request = &mut OrderRequest::default();

    order_request.market_outcome_index = data.market_outcome_index;
    order_request.for_outcome = data.for_outcome;
    order_request.purchaser = *purchaser;
    order_request.stake = data.stake;
    order_request.expected_price = data.price;
    order_request.delay_expiration_timestamp = match market.is_inplay() {
        true => now
            .checked_add(market.inplay_order_delay as i64)
            .ok_or(CoreError::ArithmeticError),
        false => Ok(0),
    }?;
    order_request.distinct_seed = data.distinct_seed;
    order_request.creation_timestamp = now;

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
    price_ladder: &Option<&PriceLadder>,
    data: &OrderRequestData,
    now: UnixTimestamp,
) -> Result<()> {
    validate_market_for_order_request(market, now)?;

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
            Some(price_ladder_account) => {
                if price_ladder_account.prices.is_empty() {
                    price_precision_is_within_range(data.price)?
                } else {
                    require!(
                        price_ladder_account.prices.contains(&data.price),
                        CoreError::CreationInvalidPrice
                    )
                }
            }
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

pub fn validate_market_for_order_request(market: &Market, now: UnixTimestamp) -> Result<()> {
    let market_lock_timestamp = &market.market_lock_timestamp;
    let status = &market.market_status;

    require!(
        status == &MarketStatus::Open,
        CoreError::CreationMarketNotOpen
    );

    require!(
        market.market_winning_outcome_index.is_none(),
        CoreError::CreationMarketHasWinningOutcome
    );

    require!(!market.suspended, CoreError::CreationMarketSuspended);

    require!(
        *market_lock_timestamp > now,
        CoreError::CreationMarketLocked
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::market_account::{MarketOrderBehaviour, MarketStatus};

    #[test]
    fn test_market_valid_() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, false, MarketStatus::Open, None);
        let market_outcome = MarketOutcome {
            market: Pubkey::new_unique(),
            index: 0,
            title: "title".to_string(),
            latest_matched_price: 2.1_f64,
            matched_total: 0_u64,
            prices: Some(Pubkey::new_unique()),
            price_ladder: vec![],
        };

        let price_ladder = PriceLadder {
            authority: Pubkey::new_unique(),
            max_number_of_prices: 0,
            prices: vec![],
        };

        let data = OrderRequestData {
            market_outcome_index: 0,
            for_outcome: true,
            stake: 100000_u64,
            price: 2.1111_f64,
            distinct_seed: [0_u8; 16],
        };

        let result =
            validate_order_request(&market, &market_outcome, &Some(&price_ladder), &data, now);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::PricePrecisionTooLarge)
        );
    }

    #[test]
    fn test_market_valid() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, false, MarketStatus::Open, None);

        let result = validate_market_for_order_request(&market, now);
        assert!(result.is_ok());
    }

    #[test]
    fn market_lock_time_in_past() {
        let time_in_past: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_past, false, MarketStatus::Open, None);

        let result = validate_market_for_order_request(&market, time_in_future);

        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("CreationMarketLocked"));
    }

    #[test]
    fn market_not_open() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, false, MarketStatus::Settled, None);

        let result = validate_market_for_order_request(&market, now);

        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("CreationMarketNotOpen"));
    }

    #[test]
    fn market_suspended() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, true, MarketStatus::Open, None);

        let result = validate_market_for_order_request(&market, now);

        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("CreationMarketSuspended"));
    }

    #[test]
    fn winning_outcome_set() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, false, MarketStatus::Open, Some(1));

        let result = validate_market_for_order_request(&market, now);

        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("CreationMarketHasWinningOutcome"));
    }

    fn create_test_market(
        market_lock_timestamp: UnixTimestamp,
        suspended: bool,
        market_status: MarketStatus,
        market_winning_outcome_index: Option<u16>,
    ) -> Market {
        Market {
            authority: Pubkey::new_unique(),
            event_account: Pubkey::new_unique(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            market_lock_timestamp,
            market_settle_timestamp: None,
            title: String::from("META"),
            market_status,
            escrow_account_bump: 0,
            published: true,
            suspended,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            unclosed_accounts_count: 0,
            unsettled_accounts_count: 0,
            funding_account_bump: 0,
        }
    }
}
