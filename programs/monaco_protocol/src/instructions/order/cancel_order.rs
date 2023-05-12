use anchor_lang::prelude::*;

use crate::context::CancelOrder;
use crate::error::CoreError;
use crate::instructions::{account, calculate_risk_from_stake, matching, transfer};
use crate::state::market_account::{Market, MarketStatus};
use crate::state::order_account::*;

pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
    let order = &ctx.accounts.order;
    require!(
        [OrderStatus::Open, OrderStatus::Matched].contains(&order.order_status),
        CoreError::CancelOrderNotCancellable
    );

    require!(
        [MarketStatus::Open].contains(&ctx.accounts.market.market_status),
        CoreError::CancelOrderNotCancellable
    );

    require!(
        order.stake_unmatched > 0_u64,
        CoreError::CancelOrderNotCancellable
    );

    ctx.accounts.order.void_stake_unmatched();

    let order = &ctx.accounts.order;

    // remove from matching queue
    matching::matching_pool::update_on_cancel(order, &mut ctx.accounts.market_matching_pool)?;

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
    transfer::order_cancelation_refund(&ctx, refund)?;

    // if never matched close
    if order.stake == order.voided_stake {
        account::close_account(
            &mut ctx.accounts.order.to_account_info(),
            &mut ctx.accounts.purchaser.to_account_info(),
        )?;
    }

    Ok(())
}

pub fn void_order(order: &mut Account<Order>, market: &Account<Market>) -> Result<()> {
    require!(
        market.market_status.eq(&MarketStatus::ReadyToVoid),
        CoreError::VoidMarketNotReadyForVoid
    );
    require!(
        !order.order_status.eq(&OrderStatus::Cancelled),
        CoreError::VoidOrderIsVoided
    );

    order.order_status = OrderStatus::Cancelled;
    order.void_stake_unmatched();

    Ok(())
}
