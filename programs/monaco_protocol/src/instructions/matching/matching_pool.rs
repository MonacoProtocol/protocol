use anchor_lang::prelude::*;
use solana_program::clock::UnixTimestamp;

use crate::instructions::current_timestamp;
use crate::state::market_account::{Market, MarketStatus};
use crate::state::market_matching_pool_account::{MarketMatchingPool, QueueItem};
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
    if market.is_inplay() {
        update_matching_pool_with_new_inplay_order(
            market,
            market_matching_pool,
            order_account,
            order_account.key(),
        )
    } else {
        update_matching_pool_with_new_preplay_order(
            market_matching_pool,
            order_account,
            order_account.key(),
        )
    }
}

fn update_matching_pool_with_new_preplay_order(
    market_matching_pool: &mut MarketMatchingPool,
    order_account: &Order,
    order_pubkey: Pubkey,
) -> Result<()> {
    require!(
        !market_matching_pool.inplay,
        CoreError::CreationMarketAlreadyInplay
    );

    market_matching_pool.liquidity_amount = market_matching_pool
        .liquidity_amount
        .checked_add(order_account.stake)
        .ok_or(CoreError::MatchingLiquidityAmountUpdateError)?;

    market_matching_pool
        .orders
        .enqueue_pubkey(order_pubkey)
        .ok_or(CoreError::MatchingQueueIsFull)?;

    Ok(())
}

fn update_matching_pool_with_new_inplay_order(
    market: &Market,
    market_matching_pool: &mut MarketMatchingPool,
    order_account: &Order,
    order_pubkey: Pubkey,
) -> Result<()> {
    if !market_matching_pool.inplay {
        market_matching_pool.move_to_inplay(&market.event_start_order_behaviour);
    }

    market_matching_pool
        .orders
        .enqueue(QueueItem::new_inplay(
            order_pubkey,
            order_account.delay_expiration_timestamp,
            order_account.stake,
        ))
        .ok_or(CoreError::MatchingQueueIsFull)?;

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

pub fn updated_liquidity_with_delay_expired_orders(
    market: &Market,
    market_matching_pool: &mut MarketMatchingPool,
) -> Result<()> {
    require!(
        market.market_status == MarketStatus::Open,
        CoreError::MatchingMarketInvalidStatus
    );
    require!(
        market.is_inplay() && market_matching_pool.inplay,
        CoreError::MatchingMarketNotYetInplay
    );

    let now: UnixTimestamp = current_timestamp();
    for i in 0..market_matching_pool.orders.len() {
        if let Some(order) = market_matching_pool.orders.peek(i) {
            if order.delay_expiration_timestamp > now {
                break;
            } else if order.liquidity_to_add > 0 {
                market_matching_pool.liquidity_amount = market_matching_pool
                    .liquidity_amount
                    .checked_add(order.liquidity_to_add)
                    .ok_or(CoreError::MatchingLiquidityAmountUpdateError)?;
                order.liquidity_to_add = 0;
            }
        }
    }
    Ok(())
}

fn update_matching_pool_with_matched_order(
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
                matched_order == pool_item.order,
                CoreError::OrderNotAtFrontOfQueue
            );
            if pool_item.liquidity_to_add > 0 {
                let now: UnixTimestamp = current_timestamp();
                if pool_item.delay_expiration_timestamp <= now {
                    matching_pool.liquidity_amount = matching_pool
                        .liquidity_amount
                        .checked_add(pool_item.liquidity_to_add)
                        .ok_or(CoreError::MatchingLiquidityAmountUpdateError)?;
                    pool_item.liquidity_to_add = 0;
                }
            }
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
) -> Result<()> {
    if let Some(removed_item) = matching_pool.orders.remove_pubkey(&order.key()) {
        if removed_item.liquidity_to_add == 0 {
            // TODO update market_outcome stake sums for partially matched orders
            matching_pool.liquidity_amount = matching_pool
                .liquidity_amount
                .checked_sub(order.voided_stake)
                .ok_or(CoreError::MatchingLiquidityAmountUpdateError)?;
        }
    }
    Ok(())
}
