use anchor_lang::prelude::*;

#[event]
pub struct TradeEvent {
    pub amount: u64,
    pub price: f64,
    pub market: Pubkey,
}
