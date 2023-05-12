use anchor_lang::prelude::*;

use crate::context::CancelOrder;
use crate::error::CoreError;
use crate::instructions::{account, calculate_risk_from_stake, matching, transfer};
use crate::state::market_account::MarketStatus;
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

    update_order(&mut ctx.accounts.order)?;

    let order = &ctx.accounts.order;

    matching::matching_pool::update_on_cancel(order, &mut ctx.accounts.market_matching_pool)?;

    // expected refund based on voided stake
    let expected_refund = match order.for_outcome {
        true => order.voided_stake,
        false => calculate_risk_from_stake(order.voided_stake, order.expected_price),
    };

    // calculate refund
    let refund = ctx.accounts.market_position.update_on_cancelation(
        order.market_outcome_index as usize,
        order.for_outcome,
        expected_refund,
    )?;
    transfer::order_cancelation_refund(&ctx, refund)?;

    // close account if order was fully unmatched
    if order.stake == order.voided_stake {
        account::close_account(
            &mut ctx.accounts.order.to_account_info(),
            &mut ctx.accounts.purchaser.to_account_info(),
        )?;
    }

    Ok(())
}

fn update_order(order: &mut Account<Order>) -> Result<()> {
    order.voided_stake = order.stake_unmatched;
    order.stake_unmatched = 0_u64;

    Ok(())
}
