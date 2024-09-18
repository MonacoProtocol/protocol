use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::instructions::market::move_market_to_inplay;
use crate::instructions::{market_position, matching};
use crate::state::market_account::{Market, MarketStatus};
use crate::state::market_liquidities::{LiquiditySource, MarketLiquidities};
use crate::state::market_matching_pool_account::MarketMatchingPool;
use crate::state::market_matching_queue_account::MarketMatchingQueue;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::*;

pub fn cancel_order(
    market: &mut Market,
    order_pk: &Pubkey,
    order: &mut Order,
    market_position: &mut MarketPosition,
    market_liquidities: &mut MarketLiquidities,
    market_matching_queue: &MarketMatchingQueue,
    market_matching_pool: &mut MarketMatchingPool,
) -> Result<u64> {
    // market is open + should be locked and cancellation is the intended behaviour
    require!(
        [MarketStatus::Open].contains(&market.market_status),
        CoreError::CancelationMarketStatusInvalid
    );
    // order is (open or matched) + there is remaining stake to be refunded
    require!(
        [OrderStatus::Open, OrderStatus::Matched].contains(&order.order_status),
        CoreError::CancelationOrderStatusInvalid
    );
    require!(
        order.stake_unmatched > 0_u64,
        CoreError::CancelOrderNotCancellable
    );

    // if market is inplay, but the inplay flag hasn't been flipped yet, do it now
    // and zero liquidities before cancelling the order if that's what the market is
    // configured for
    if market.is_inplay() && !market.inplay {
        move_market_to_inplay(market, market_liquidities)?;
    }

    order.void_stake_unmatched(); // TODO replace

    // remove from matching pool
    let removed_from_queue = matching::matching_pool::update_on_cancel(
        market,
        market_matching_queue,
        market_matching_pool,
        order_pk,
        order,
    )?;

    // update liquidity if the order was still present in the matching pool
    let update_derived_liquidity = false; // flag indicating removal of cross liquidity
    if removed_from_queue {
        match order.for_outcome {
            true => remove_liquidity_for(market_liquidities, order, update_derived_liquidity)?,
            false => remove_liquidity_against(market_liquidities, order, update_derived_liquidity)?,
        }
    }

    // calculate refund
    let refund = market_position::update_on_order_cancellation(market_position, order)?;

    Ok(refund)
}

fn remove_liquidity_for(
    market_liquidities: &mut MarketLiquidities,
    order: &Order,
    update_derived_liquidity: bool,
) -> Result<()> {
    market_liquidities
        .remove_liquidity_for(
            order.market_outcome_index,
            order.expected_price,
            order.voided_stake,
        )
        .map_err(|_| CoreError::CancelOrderNotCancellable)?;

    // disabled in production, but left in for further testing
    // compute cost of this operation grows linear with the number of liquidity points
    if update_derived_liquidity {
        let liquidity_source =
            LiquiditySource::new(order.market_outcome_index, order.expected_price);
        market_liquidities.update_all_cross_liquidity_against(&liquidity_source);
    }

    Ok(())
}

fn remove_liquidity_against(
    market_liquidities: &mut MarketLiquidities,
    order: &Order,
    update_derived_liquidity: bool,
) -> Result<()> {
    market_liquidities
        .remove_liquidity_against(
            order.market_outcome_index,
            order.expected_price,
            order.voided_stake,
        )
        .map_err(|_| CoreError::CancelOrderNotCancellable)?;

    // disabled in production, but left in for further testing
    // compute cost of this operation grows linear with the number of liquidity points
    if update_derived_liquidity {
        let liquidity_source =
            LiquiditySource::new(order.market_outcome_index, order.expected_price);
        market_liquidities.update_all_cross_liquidity_for(&liquidity_source);
    }

    Ok(())
}
