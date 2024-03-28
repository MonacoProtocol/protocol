use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::instructions::calculate_risk_from_stake;
use crate::state::market_position_account::MarketPosition;

pub fn update_on_order_request_creation(
    market_position: &mut MarketPosition,
    market_outcome_index: u16,
    for_outcome: bool,
    stake: u64,
    expected_price: f64,
) -> Result<u64> {
    let outcome_index = market_outcome_index as usize;
    let order_exposure = match for_outcome {
        true => stake,
        false => calculate_risk_from_stake(stake, expected_price),
    };

    let total_exposure_before = market_position.total_exposure();

    // update unmatched_exposures
    match for_outcome {
        true => {
            let market_outcomes_len = market_position.unmatched_exposures.len();
            for index in 0..market_outcomes_len {
                if outcome_index == index {
                    continue;
                }
                market_position.unmatched_exposures[index] = market_position.unmatched_exposures
                    [index]
                    .checked_add(order_exposure)
                    .ok_or(CoreError::ArithmeticError)?;
            }
        }
        false => {
            market_position.unmatched_exposures[outcome_index] = market_position
                .unmatched_exposures[outcome_index]
                .checked_add(order_exposure)
                .ok_or(CoreError::ArithmeticError)?;
        }
    }

    // total_exposure_change change
    let total_exposure_change = market_position
        .total_exposure()
        .checked_sub(total_exposure_before)
        .ok_or(CoreError::ArithmeticError)?;

    Ok(total_exposure_change)
}
