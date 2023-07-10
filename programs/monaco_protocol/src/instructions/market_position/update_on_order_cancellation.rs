use crate::error::CoreError;
use crate::instructions::calculate_risk_from_stake;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::*;
use anchor_lang::prelude::*;

pub fn update_on_order_cancellation(
    market_position: &mut MarketPosition,
    order: &Order,
) -> Result<u64> {
    let outcome_index = order.market_outcome_index as usize;
    let for_outcome = order.for_outcome;
    let order_exposure = match for_outcome {
        true => order.voided_stake,
        false => calculate_risk_from_stake(order.voided_stake, order.expected_price),
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
                    .checked_sub(order_exposure)
                    .ok_or(CoreError::ArithmeticError)?;
            }
        }
        false => {
            market_position.unmatched_exposures[outcome_index] = market_position
                .unmatched_exposures[outcome_index]
                .checked_sub(order_exposure)
                .ok_or(CoreError::ArithmeticError)?;
        }
    }

    // total_exposure_change change
    let total_exposure_change = total_exposure_before
        .checked_sub(market_position.total_exposure())
        .ok_or(CoreError::ArithmeticError)?;

    Ok(total_exposure_change)
}
