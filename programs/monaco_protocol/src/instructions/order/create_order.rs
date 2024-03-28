use anchor_lang::prelude::*;
use solana_program::clock::UnixTimestamp;

use crate::instructions::current_timestamp;
use crate::state::market_account::*;
use crate::state::market_order_request_queue::OrderRequest;
use crate::state::order_account::*;

pub fn initialize_order(
    order: &mut Account<Order>,
    market: &Account<Market>,
    fee_payer: Pubkey,
    order_request: OrderRequest,
) -> Result<()> {
    let now: UnixTimestamp = current_timestamp();

    order.market = market.key();
    order.market_outcome_index = order_request.market_outcome_index;
    order.for_outcome = order_request.for_outcome;

    order.purchaser = order_request.purchaser;
    order.payer = fee_payer;

    order.order_status = OrderStatus::Open;
    order.stake = order_request.stake;
    order.expected_price = order_request.expected_price;
    order.creation_timestamp = now;
    order.stake_unmatched = order_request.stake;
    order.payout = 0_u64;

    order.product = order_request.product;
    order.product_commission_rate = order_request.product_commission_rate;

    Ok(())
}
