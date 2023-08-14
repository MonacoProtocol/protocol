use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::state::market_account::{Market, MarketStatus};
use crate::state::order_account::*;

pub fn void_order(order: &mut Account<Order>, market: &mut Account<Market>) -> Result<()> {
    require!(
        market.market_status.eq(&MarketStatus::ReadyToVoid),
        CoreError::VoidMarketNotReadyForVoid
    );
    require!(
        !order.order_status.eq(&OrderStatus::Voided),
        CoreError::VoidOrderIsVoided
    );

    order.order_status = OrderStatus::Voided;
    order.voided_stake = order.stake;
    order.stake_unmatched = 0_u64;

    market.decrement_unsettled_accounts_count()?;

    Ok(())
}
