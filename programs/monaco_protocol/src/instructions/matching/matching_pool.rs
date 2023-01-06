use anchor_lang::prelude::*;

use crate::state::market_account::Cirque;
use crate::{CoreError, MarketMatchingPool, MarketOutcome, Order};

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

    // Update the queues
    update_matching_queue_with_matched_order(
        market_matching_pool_for,
        stake_matched,
        for_order.key(),
        for_fully_matched,
    )?;
    update_matching_queue_with_matched_order(
        market_matching_pool_against,
        stake_matched,
        against_order.key(),
        against_fully_matched,
    )?;

    Ok(())
}

pub fn update_matching_queue_with_new_order(
    market_matching_pool: &mut Account<MarketMatchingPool>,
    order_account: &Account<Order>,
) -> Result<()> {
    market_matching_pool.liquidity_amount = market_matching_pool
        .liquidity_amount
        .checked_add(order_account.stake)
        .ok_or(CoreError::MatchingLiquidityAmountUpdateError)?;

    market_matching_pool
        .orders
        .enqueue(order_account.key())
        .ok_or(CoreError::MatchingQueueIsFull)?;

    Ok(())
}

fn update_matching_queue_with_matched_order(
    matching_pool: &mut MarketMatchingPool,
    amount_matched: u64,
    matched_order: Pubkey,
    fully_matched: bool,
) -> Result<()> {
    matching_pool.liquidity_amount = matching_pool
        .liquidity_amount
        .checked_sub(amount_matched)
        .ok_or(CoreError::MatchingLiquidityAmountUpdateError)?;
    matching_pool.matched_amount = matching_pool
        .matched_amount
        .checked_add(amount_matched)
        .ok_or(CoreError::MatchingMatchedAmountUpdateError)?;

    if fully_matched {
        remove_order_from_matching_queue(&mut matching_pool.orders, matched_order)?;
    }

    Ok(())
}

pub fn remove_order_from_matching_queue(order_queue: &mut Cirque, order: Pubkey) -> Result<()> {
    let removed_item = order_queue.dequeue();
    require!(removed_item.is_some(), CoreError::MatchingQueueIsEmpty);
    require!(
        order == removed_item.unwrap(),
        CoreError::IncorrectOrderDequeueAttempt
    );
    Ok(())
}

pub fn update_on_cancel(
    order: &Account<Order>,
    matching_pool: &mut MarketMatchingPool,
) -> Result<()> {
    // TODO update market_outcome stake sums for partially matched orders
    matching_pool.liquidity_amount = matching_pool
        .liquidity_amount
        .checked_sub(order.voided_stake)
        .ok_or(CoreError::MatchingLiquidityAmountUpdateError)?;
    matching_pool.orders.remove_item(&order.key());

    Ok(())
}
