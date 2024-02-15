use anchor_lang::prelude::*;
use solana_program::clock::UnixTimestamp;

use crate::error::CoreError;
use crate::instructions::market::move_market_to_inplay;
use crate::instructions::market_position::update_product_commission_contributions;
use crate::instructions::order::initialize_order;
use crate::instructions::{
    calculate_risk_from_stake, current_timestamp, market, market_position, matching,
};
use crate::state::market_account::*;
use crate::state::market_liquidities::MarketLiquidities;
use crate::state::market_matching_pool_account::MarketMatchingPool;
use crate::state::market_matching_queue_account::MarketMatchingQueue;
use crate::state::market_order_request_queue::MarketOrderRequestQueue;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::*;

pub fn process_order_request(
    order: &mut Account<Order>,
    market_position: &mut MarketPosition,
    market: &mut Account<Market>,
    market_liquidities: &mut MarketLiquidities,
    market_matching_queue: &mut MarketMatchingQueue,
    fee_payer: Pubkey,
    matching_pool: &mut Account<MarketMatchingPool>,
    order_request_queue: &mut Account<MarketOrderRequestQueue>,
) -> Result<u64> {
    let order_request = order_request_queue
        .order_requests
        .dequeue()
        .ok_or(CoreError::OrderRequestQueueIsEmpty)?;

    if market.is_inplay() {
        // if market is inplay, but the inplay flag hasn't been flipped yet, do it now
        // and zero liquidities before processing the order request if that's
        // what the market is configured for
        if !market.inplay {
            move_market_to_inplay(market, market_liquidities)?;
        }

        // if market is inplay, and order is delayed, processing requires that the delay has expired
        if order_request.delay_expiration_timestamp > 0 {
            let now: UnixTimestamp = current_timestamp();
            require!(
                order_request.delay_expiration_timestamp <= now,
                CoreError::InplayDelay
            );
        }
    }

    initialize_order(order, market, fee_payer, *order_request)?;
    market.increment_account_counts()?;

    // if this pool is new, initialize it
    if matching_pool.orders.capacity() == 0 {
        market::initialize_market_matching_pool(matching_pool, market, order)?;
        market.increment_unclosed_accounts_count()?;
    }
    if market.is_inplay() && !matching_pool.inplay {
        require!(
            market_matching_queue.matches.is_empty(),
            CoreError::InplayTransitionMarketMatchingQueueIsNotEmpty
        );
        matching_pool.move_to_inplay(&market.event_start_order_behaviour);
    }

    let order_matches = matching::on_order_creation(
        market_liquidities,
        market_matching_queue,
        &order.key(),
        order,
    )?;
    matching::update_matching_pool_with_new_order(matching_pool, order)?;

    // calculate payment
    let mut total_refund = 0_u64;
    for order_match in &order_matches {
        let refund = market_position::update_on_order_match(
            market_position,
            order,
            order_match.stake,
            order_match.price,
        )?;
        total_refund = total_refund
            .checked_add(refund)
            .ok_or(CoreError::CreationTransferAmountError)?;

        // update product commission tracking for matched risk
        update_product_commission_contributions(
            market_position,
            order,
            match order.for_outcome {
                true => order_match.stake,
                false => calculate_risk_from_stake(order_match.stake, order_match.price),
            },
        )?;
    }

    Ok(total_refund)
}
