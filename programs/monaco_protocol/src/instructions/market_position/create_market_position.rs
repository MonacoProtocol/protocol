use anchor_lang::prelude::*;

use crate::state::market_account::*;
use crate::state::market_position_account::*;

pub fn create_market_position(
    purchaser: &Signer,
    market: &Account<Market>,
    market_position: &mut Account<MarketPosition>,
) -> Result<()> {
    let market_outcomes_len = usize::from(market.market_outcomes_count);

    market_position.purchaser = purchaser.key();
    market_position.payer = purchaser.key();
    market_position.market = market.key();
    market_position
        .market_outcome_sums
        .resize(market_outcomes_len, 0_i128);
    market_position
        .outcome_max_exposure
        .resize(market_outcomes_len, 0_u64);
    market_position.paid = false;

    Ok(())
}
