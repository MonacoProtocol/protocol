use anchor_lang::prelude::*;
use solana_program::clock::UnixTimestamp;

use crate::error::CoreError;
use crate::instructions::order::initialize_order;
use crate::instructions::{current_timestamp, market, matching};
use crate::state::market_account::*;
use crate::state::market_matching_pool_account::MarketMatchingPool;
use crate::state::market_order_request_queue::MarketOrderRequestQueue;
use crate::state::order_account::*;

pub fn process_order_request(
    order: &mut Account<Order>,
    market: &mut Account<Market>,
    fee_payer: Pubkey,
    matching_pool: &mut Account<MarketMatchingPool>,
    order_request_queue: &mut Account<MarketOrderRequestQueue>,
) -> Result<()> {
    let order_request = order_request_queue
        .order_requests
        .dequeue()
        .ok_or(CoreError::RequestQueueEmpty)?;

    // if market is inplay, and order is delayed, check if delay has expired
    if market.is_inplay() && order_request.delay_expiration_timestamp > 0 {
        let now: UnixTimestamp = current_timestamp();
        require!(
            order_request.delay_expiration_timestamp <= now,
            CoreError::InplayDelay
        );
    }

    initialize_order(order, market, fee_payer, *order_request)?;

    // pools are always initialized with default items, so if this pool is new, initialize it
    if matching_pool.orders.size() == 0 {
        market::initialize_market_matching_pool(matching_pool, market, order)?;
        market.increment_unclosed_accounts_count()?;
    }

    matching::update_matching_pool_with_new_order(market, matching_pool, order)?;

    market.increment_account_counts()?;

    Ok(())
}
