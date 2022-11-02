use anchor_lang::prelude::*;

use crate::state::order_account::Order;
use crate::state::trade_account::Trade;

pub fn initialize_trade(
    trade: &mut Account<Trade>,
    order: &Account<Order>,
    opposite_trade: &Account<Trade>,
    stake: u64,
    price: f64,
    creation_timestamp: i64,
    payer: Pubkey,
) {
    trade.purchaser = order.purchaser.key();
    trade.market = order.market.key();
    trade.order = order.key();
    trade.opposite_trade = opposite_trade.key();
    trade.for_outcome = order.for_outcome;
    trade.market_outcome_index = order.market_outcome_index;
    trade.stake = stake;
    trade.price = price;
    trade.creation_timestamp = creation_timestamp;
    trade.payer = payer;
}
