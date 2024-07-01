use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::instructions::market_position;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::{Order, OrderStatus};

pub fn match_order(
    order: &mut Account<Order>,
    market_position: &mut MarketPosition,
    stake_matched: u64,
    price_matched: f64,
) -> Result<u64> {
    // validate that status is open or matched (for partial matches)
    if order.order_status != OrderStatus::Open && order.order_status != OrderStatus::Matched {
        msg!("Order Matching: status closed");
        return Err(error!(CoreError::MatchingStatusClosed));
    }

    // validate that there is enough stake to match (for partial matches)
    if order.stake_unmatched < stake_matched {
        msg!("Order Matching: remaining stake too small");
        return Err(error!(CoreError::MatchingRemainingStakeTooSmall));
    }

    order.match_stake_unmatched(stake_matched, price_matched)?;

    let refund = market_position::update_on_order_match(
        market_position,
        order,
        stake_matched,
        price_matched,
    )?;

    Ok(refund)
}
