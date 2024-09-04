use anchor_lang::prelude::*;

use crate::context::MatchOrders;
use crate::error::CoreError;
use crate::events::trade::TradeEvent;
use crate::instructions::market_position::update_product_commission_contributions;
use crate::instructions::matching::create_trade::create_trade;
use crate::instructions::{
    calculate_risk_from_stake, current_timestamp, matching, order, transfer,
};
use crate::state::market_account::MarketStatus::Open;
use crate::state::market_position_account::MarketPosition;

pub fn match_orders(ctx: &mut Context<MatchOrders>) -> Result<()> {
    let order_for = &mut ctx.accounts.order_for;
    let order_against = &mut ctx.accounts.order_against;

    // validate market
    require!(
        Open.eq(&ctx.accounts.market.market_status),
        CoreError::MarketNotOpen,
    );

    require!(
        order_for.creation_timestamp <= ctx.accounts.market.market_lock_timestamp
            && order_against.creation_timestamp <= ctx.accounts.market.market_lock_timestamp,
        CoreError::MarketLocked
    );

    // validate orders market-outcome-price
    require!(
        order_for.market_outcome_index == order_against.market_outcome_index,
        CoreError::MatchingMarketOutcomeMismatch
    );

    require!(
        order_for.expected_price <= order_against.expected_price,
        CoreError::MatchingMarketPriceMismatch
    );

    // validate that status is open or matched (for partial matches)
    require!(!order_for.is_completed(), CoreError::StatusClosed);
    require!(!order_against.is_completed(), CoreError::StatusClosed);

    let selected_price = if order_for.creation_timestamp < order_against.creation_timestamp {
        order_for.expected_price
    } else {
        order_against.expected_price
    };

    // determine the matchable stake
    let stake_matched = order_for.stake_unmatched.min(order_against.stake_unmatched);

    let market_position_against = &mut ctx.accounts.market_position_against;
    let market_position_for = &mut ctx.accounts.market_position_for;
    // for orders from the same purchaser market-position passed is the same account
    let market_position_identical = market_position_against.key() == market_position_for.key();

    let change_in_exposure_refund_against;
    let change_in_exposure_refund_for;

    if order_against.creation_timestamp <= order_for.creation_timestamp {
        // 1. match against
        // -----------------------------
        change_in_exposure_refund_against = order::match_order(
            order_against,
            market_position_against,
            stake_matched,
            selected_price,
        )?;
        if market_position_identical {
            copy_market_position(market_position_against, market_position_for);
        }

        // 2. match for
        // -----------------------------
        change_in_exposure_refund_for = order::match_order(
            order_for,
            market_position_for,
            stake_matched,
            selected_price,
        )?;
        if market_position_identical {
            copy_market_position(market_position_for, market_position_against);
        }
    } else {
        // 1. match for
        // -----------------------------
        change_in_exposure_refund_for = order::match_order(
            order_for,
            market_position_for,
            stake_matched,
            selected_price,
        )?;
        if market_position_identical {
            copy_market_position(market_position_for, market_position_against);
        }
        // 2. match against
        // -----------------------------
        change_in_exposure_refund_against = order::match_order(
            order_against,
            market_position_against,
            stake_matched,
            selected_price,
        )?;
        if market_position_identical {
            copy_market_position(market_position_against, market_position_for);
        }
    };

    // update product commission tracking for matched risk
    update_product_commission_contributions(market_position_for, order_for, stake_matched)?;
    if market_position_identical {
        copy_product_commission_contributions(market_position_for, market_position_against);
    }
    update_product_commission_contributions(
        market_position_against,
        order_against,
        calculate_risk_from_stake(stake_matched, selected_price),
    )?;
    if market_position_identical {
        copy_product_commission_contributions(market_position_against, market_position_for);
    }

    // 3. market update
    // -----------------------------
    matching::update_on_match(
        &mut ctx.accounts.market_matching_pool_against,
        &mut ctx.accounts.market_matching_pool_for,
        stake_matched,
        order_for,
        order_against,
    )?;
    ctx.accounts
        .market_liquidities
        .update_match_totals(stake_matched, selected_price)?;

    // 4. if any refunds are due to change in exposure, transfer them
    if change_in_exposure_refund_against > 0_u64 {
        transfer::order_against_matching_refund(ctx, change_in_exposure_refund_against)?;
    }
    if change_in_exposure_refund_for > 0_u64 {
        transfer::order_for_matching_refund(ctx, change_in_exposure_refund_for)?;
    }

    // 5. Initialize the trade accounts
    let now = current_timestamp();
    create_trade(
        &mut ctx.accounts.trade_against,
        &ctx.accounts.order_against.purchaser,
        &ctx.accounts.order_against.market,
        &ctx.accounts.order_against.key(),
        ctx.accounts.order_against.market_outcome_index,
        ctx.accounts.order_against.for_outcome,
        stake_matched,
        selected_price,
        now,
        ctx.accounts.crank_operator.key(),
    );
    ctx.accounts.market.increment_unclosed_accounts_count()?;
    create_trade(
        &mut ctx.accounts.trade_for,
        &ctx.accounts.order_for.purchaser,
        &ctx.accounts.order_for.market,
        &ctx.accounts.order_for.key(),
        ctx.accounts.order_for.market_outcome_index,
        ctx.accounts.order_for.for_outcome,
        stake_matched,
        selected_price,
        now,
        ctx.accounts.crank_operator.key(),
    );
    ctx.accounts.market.increment_unclosed_accounts_count()?;

    emit!(TradeEvent {
        amount: stake_matched,
        price: selected_price,
        market: ctx.accounts.market.key(),
    });

    Ok(())
}

fn copy_market_position(from: &MarketPosition, to: &mut MarketPosition) {
    for index in 0..from.market_outcome_sums.len() {
        to.market_outcome_sums[index] = from.market_outcome_sums[index];
        to.unmatched_exposures[index] = from.unmatched_exposures[index];
    }
}

fn copy_product_commission_contributions(from: &MarketPosition, to: &mut MarketPosition) {
    to.matched_risk = from.matched_risk;
    to.matched_risk_per_product = from.matched_risk_per_product.clone();
}
