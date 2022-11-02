use crate::error::CoreError;
use anchor_lang::prelude::*;

pub const EVENT_RESULT_FULL_TIME: &str = "EventResultFullTime";
pub const EVENT_RESULT_HALF_TIME: &str = "EventResultHalfTime";
pub const EVENT_RESULT_BOTH_SIDES_SCORE: &str = "EventResultBothSidesScore";
pub const EVENT_RESULT_WINNER: &str = "EventResultWinner";

pub fn verify_market_type(market_type: &str) -> Result<()> {
    match market_type {
        EVENT_RESULT_FULL_TIME => Ok(()),
        EVENT_RESULT_HALF_TIME => Ok(()),
        EVENT_RESULT_BOTH_SIDES_SCORE => Ok(()),
        EVENT_RESULT_WINNER => Ok(()),
        _ => Err(error!(CoreError::MarketTypeInvalid)),
    }
}
