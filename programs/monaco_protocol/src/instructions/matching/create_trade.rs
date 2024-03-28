use anchor_lang::prelude::*;

use crate::state::trade_account::Trade;

pub fn create_trade(
    trade: &mut Trade,
    purchaser_pk: &Pubkey,
    market_pk: &Pubkey,
    order_pk: &Pubkey,
    outcome_index: u16,
    for_outcome: bool,
    stake: u64,
    price: f64,
    creation_timestamp: i64,
    payer: Pubkey,
) {
    trade.purchaser = *purchaser_pk;
    trade.market = *market_pk;
    trade.order = *order_pk;
    trade.for_outcome = for_outcome;
    trade.market_outcome_index = outcome_index;
    trade.stake = stake;
    trade.price = price;
    trade.creation_timestamp = creation_timestamp;
    trade.payer = payer;
}
