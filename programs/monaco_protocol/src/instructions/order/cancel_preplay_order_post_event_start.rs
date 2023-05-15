use anchor_lang::prelude::*;

use crate::context::CancelPreplayOrderPostEventStart;
use crate::error::CoreError;
use crate::instructions::{calculate_risk_from_stake, transfer};
use crate::state::market_account::{MarketOrderBehaviour, MarketStatus};
use crate::state::order_account::OrderStatus::{Matched, Open};

pub fn cancel_preplay_order_post_event_start(
    ctx: Context<CancelPreplayOrderPostEventStart>,
) -> Result<()> {
    let order = &ctx.accounts.order;
    let market = &ctx.accounts.market;

    // market is open + in inplay mode + and cancellation is the intended behaviour
    require!(
        [MarketStatus::Open].contains(&market.market_status),
        CoreError::CancelationMarketStatusInvalid
    );
    require!(market.inplay, CoreError::CancelationMarketNotInplay);
    require!(
        MarketOrderBehaviour::CancelUnmatched.eq(&market.event_start_order_behaviour),
        CoreError::CancelationMarketOrderBehaviourInvalid
    );

    // order is (open or matched) + created before market event start
    require!(
        [Open, Matched].contains(&order.order_status),
        CoreError::CancelationOrderStatusInvalid
    );
    require!(
        order.creation_timestamp < market.event_start_timestamp,
        CoreError::CancelationOrderCreatedAfterMarketEventStarted
    );

    ctx.accounts.order.void_stake_unmatched();

    let order = &ctx.accounts.order;

    // calculate refund
    let expected_refund = match order.for_outcome {
        true => order.voided_stake,
        false => calculate_risk_from_stake(order.voided_stake, order.expected_price),
    };
    let refund = ctx.accounts.market_position.update_on_cancelation(
        order.market_outcome_index as usize,
        order.for_outcome,
        expected_refund,
    )?;
    transfer::order_cancelation_post_event_start_refund(&ctx, refund)?;

    Ok(())
}
