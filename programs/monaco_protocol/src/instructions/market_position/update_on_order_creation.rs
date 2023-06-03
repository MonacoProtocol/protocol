use crate::error::CoreError;
use crate::instructions::calculate_risk_from_stake;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::*;
use anchor_lang::prelude::*;

pub fn update_on_order_creation(
    market_position: &mut MarketPosition,
    order: &Order,
) -> Result<u64> {
    let outcome_index = order.market_outcome_index as usize;
    let for_outcome = order.for_outcome;
    let order_exposure = match order.for_outcome {
        true => order.stake,
        false => calculate_risk_from_stake(order.stake, order.expected_price),
    };

    let prematch_exposure = market_position.prematch_exposure();

    match for_outcome {
        true => {
            let market_outcomes_len = market_position.prematch_exposures.len();
            for index in 0..market_outcomes_len {
                if outcome_index == index {
                    continue;
                }
                market_position.prematch_exposures[index] = market_position.prematch_exposures
                    [index]
                    .checked_add(order_exposure)
                    .ok_or(CoreError::ArithmeticError)?;
            }
        }
        false => {
            market_position.prematch_exposures[outcome_index] = market_position.prematch_exposures
                [outcome_index]
                .checked_add(order_exposure)
                .ok_or(CoreError::ArithmeticError)?;
        }
    }

    // prematch_exposure change
    let prematch_exposure_change = market_position
        .prematch_exposure()
        .checked_sub(prematch_exposure)
        .ok_or(CoreError::ArithmeticError)?;

    // payment change
    market_position.payment = market_position
        .payment
        .checked_add(prematch_exposure_change)
        .ok_or(CoreError::ArithmeticError)?;

    Ok(prematch_exposure_change)
}
