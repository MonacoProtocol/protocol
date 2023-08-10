use anchor_lang::prelude::*;

use crate::state::market_account::*;
use crate::state::market_position_account::*;

pub fn create_market_position(
    purchaser: &Signer,
    market: &mut Account<Market>,
    market_position: &mut Account<MarketPosition>,
) -> Result<()> {
    let market_outcomes_len = usize::from(market.market_outcomes_count);

    // if market position is being initialized, increment market account counts
    if market_position.purchaser == Pubkey::default() {
        market.increment_account_counts()?;
    }

    market_position.purchaser = purchaser.key();
    market_position.payer = purchaser.key();
    market_position.market = market.key();
    market_position
        .market_outcome_sums
        .resize(market_outcomes_len, 0_i128);
    market_position
        .unmatched_exposures
        .resize(market_outcomes_len, 0_u64);
    market_position.paid = false;

    if market_position.matched_risk == 0 {
        market_position.matched_risk_per_product =
            Vec::with_capacity(ProductMatchedRiskAndRate::MAX_LENGTH);
    }

    Ok(())
}
