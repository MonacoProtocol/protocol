use anchor_lang::prelude::*;

use crate::context::CancelOrder;
use crate::error::CoreError;
use crate::instructions::market::move_market_to_inplay;
use crate::instructions::{market_position, matching, transfer};
use crate::state::market_account::MarketStatus;
use crate::state::order_account::*;

pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
    let order = &mut ctx.accounts.order;

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

    let market = &mut ctx.accounts.market;
    let market_liquidities = &mut ctx.accounts.market_liquidities;

    // if market is inplay, but the inplay flag hasn't been flipped yet, do it now
    // and zero liquidities before cancelling the order if that's what the market is
    // configured for
    if market.is_inplay() && !market.inplay {
        move_market_to_inplay(market, market_liquidities)?;
    }

    ctx.accounts.order.void_stake_unmatched();

    let market_matching_queue = &ctx.accounts.market_matching_queue;
    let order = &ctx.accounts.order;

    // remove from matching pool
    let removed_from_queue = matching::matching_pool::update_on_cancel(
        market,
        market_matching_queue,
        &mut ctx.accounts.market_matching_pool,
        order,
    )?;

    // update liquidity if the order was still present in the matching pool
    if removed_from_queue {
        match order.for_outcome {
            true => market_liquidities
                .remove_liquidity_for(
                    order.market_outcome_index,
                    order.expected_price,
                    &[],
                    order.voided_stake,
                )
                .map_err(|_| CoreError::CancelOrderNotCancellable)?,
            false => market_liquidities
                .remove_liquidity_against(
                    order.market_outcome_index,
                    order.expected_price,
                    &[],
                    order.voided_stake,
                )
                .map_err(|_| CoreError::CancelOrderNotCancellable)?,
        }
    }

    // calculate refund
    let refund =
        market_position::update_on_order_cancellation(&mut ctx.accounts.market_position, order)?;
    transfer::order_cancelation_refund(
        &ctx.accounts.market_escrow,
        &ctx.accounts.purchaser_token_account,
        &ctx.accounts.token_program,
        market,
        refund,
    )?;

    // if never matched close
    if order.stake == order.voided_stake {
        market.decrement_account_counts()?;
        ctx.accounts
            .order
            .close(ctx.accounts.payer.to_account_info())?;
    }

    Ok(())
}
