use crate::instructions::current_timestamp;
use crate::instructions::order_request::validate_market_for_order_request;
use anchor_lang::prelude::*;
use solana_program::clock::UnixTimestamp;

use crate::state::market_account::*;
use crate::state::market_position_account::*;

pub fn create_market_position(
    purchaser: &Pubkey,
    payer: &Pubkey,
    market_pk: Pubkey,
    market: &Market,
    market_position: &mut MarketPosition,
) -> Result<()> {
    let now: UnixTimestamp = current_timestamp();
    validate_market_for_order_request(market, now)?;

    let market_outcomes_len = usize::from(market.market_outcomes_count);

    market_position.purchaser = *purchaser;
    market_position.payer = *payer;
    market_position.market = market_pk;
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
