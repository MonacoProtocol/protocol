use anchor_lang::prelude::*;

use crate::state::market_account::{Market, MarketStatus};
use crate::state::market_matching_pool_account::MarketMatchingPool;
use crate::state::market_outcome_account::MarketOutcome;
use crate::{CoreError, Order};

pub fn update_on_match(
    market_outcome: &mut Account<MarketOutcome>,
    market_matching_pool_against: &mut Account<MarketMatchingPool>,
    market_matching_pool_for: &mut Account<MarketMatchingPool>,
    market_account: &Pubkey,
    stake_matched: u64,
    for_order: &Account<Order>,
    against_order: &Account<Order>,
) -> Result<()> {
    let for_fully_matched = for_order.stake_unmatched == 0_u64;
    let against_fully_matched = against_order.stake_unmatched == 0_u64;
    require!(
        market_outcome.market.eq(market_account),
        CoreError::MarketDoesNotMatch
    );

    // market-outcome stats
    msg!("market: calculating market-outcome stats");
    if stake_matched > 0_u64 {
        market_outcome.latest_matched_price =
            if for_order.creation_timestamp < against_order.creation_timestamp {
                for_order.expected_price
            } else {
                against_order.expected_price
            };

        market_outcome.matched_total = market_outcome
            .matched_total
            .checked_add(stake_matched)
            .ok_or(CoreError::MatchingMatchedAmountUpdateError)?;
    }

    // Update the pools
    update_matching_pool_with_matched_order(
        market_matching_pool_for,
        stake_matched,
        for_order.key(),
        for_fully_matched,
    )?;
    update_matching_pool_with_matched_order(
        market_matching_pool_against,
        stake_matched,
        against_order.key(),
        against_fully_matched,
    )?;

    Ok(())
}

pub fn update_matching_pool_with_new_order(
    market: &Market,
    market_matching_pool: &mut MarketMatchingPool,
    order_account: &Account<Order>,
) -> Result<()> {
    if market.is_inplay() && !market_matching_pool.inplay {
        market_matching_pool.move_to_inplay(&market.event_start_order_behaviour);
    }

    market_matching_pool.liquidity_amount = market_matching_pool
        .liquidity_amount
        .checked_add(order_account.stake_unmatched)
        .ok_or(CoreError::MatchingLiquidityAmountUpdateError)?;

    market_matching_pool.matched_amount = market_matching_pool
        .matched_amount
        .checked_add(
            order_account
                .stake
                .checked_sub(order_account.stake_unmatched)
                .ok_or(CoreError::MatchingMatchedAmountUpdateError)?,
        )
        .ok_or(CoreError::MatchingMatchedAmountUpdateError)?;

    if order_account.stake_unmatched > 0 {
        market_matching_pool
            .orders
            .enqueue(order_account.key())
            .ok_or(CoreError::MatchingQueueIsFull)?;
    }

    Ok(())
}

pub fn move_market_matching_pool_to_inplay(
    market: &Market,
    market_matching_pool: &mut MarketMatchingPool,
) -> Result<()> {
    require!(
        market.market_status == MarketStatus::Open,
        CoreError::MatchingMarketInvalidStatus
    );
    require!(
        market.inplay_enabled,
        CoreError::MatchingMarketInplayNotEnabled
    );
    require!(market.is_inplay(), CoreError::MatchingMarketNotYetInplay);
    require!(
        !market_matching_pool.inplay,
        CoreError::MatchingMarketMatchingPoolAlreadyInplay
    );

    market_matching_pool.move_to_inplay(&market.event_start_order_behaviour);

    Ok(())
}

pub fn update_matching_pool_with_matched_order(
    matching_pool: &mut MarketMatchingPool,
    amount_matched: u64,
    matched_order: Pubkey,
    fully_matched: bool,
) -> Result<()> {
    let front_of_pool = match fully_matched {
        true => matching_pool.orders.dequeue(),
        false => matching_pool.orders.peek(0),
    };

    match front_of_pool {
        Some(pool_item) => {
            require!(
                &matched_order == pool_item,
                CoreError::OrderNotAtFrontOfQueue
            );
        }
        None => return Err(anchor_lang::error!(CoreError::MatchingQueueIsEmpty)),
    }

    matching_pool.liquidity_amount = matching_pool
        .liquidity_amount
        .checked_sub(amount_matched)
        .ok_or(CoreError::MatchingLiquidityAmountUpdateError)?;
    matching_pool.matched_amount = matching_pool
        .matched_amount
        .checked_add(amount_matched)
        .ok_or(CoreError::MatchingMatchedAmountUpdateError)?;

    Ok(())
}

pub fn update_on_cancel(
    order: &Account<Order>,
    matching_pool: &mut MarketMatchingPool,
) -> Result<bool> {
    if matching_pool.orders.remove(&order.key()).is_some() {
        matching_pool.liquidity_amount = matching_pool
            .liquidity_amount
            .checked_sub(order.voided_stake)
            .ok_or(CoreError::MatchingLiquidityAmountUpdateError)?;
        Ok(true)
    } else {
        Ok(false)
    }
}
