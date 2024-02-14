use crate::state::type_size::*;
use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Trade {
    pub purchaser: Pubkey,
    pub market: Pubkey,
    pub order: Pubkey,
    pub market_outcome_index: u16,
    pub for_outcome: bool,
    pub stake: u64,
    pub price: f64,
    pub creation_timestamp: i64,

    pub payer: Pubkey,
}

impl Trade {
    pub const SIZE: usize = DISCRIMINATOR_SIZE
        + (PUB_KEY_SIZE * 3) // purchaser, market, order
        + U16_SIZE // market_outcome_index
        + BOOL_SIZE // for outcome
        + U64_SIZE // stake
        + F64_SIZE // price
        + I64_SIZE // creation_timestamp
        + PUB_KEY_SIZE; // payer
}
