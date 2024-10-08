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
    // market is open
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
    // and zero liquidities and the matching pool
    if market.is_inplay() {
        if !market.inplay {
            move_market_to_inplay(market, market_liquidities)?;
        }
        if !market_matching_pool.inplay {
            require!(
                market_matching_queue.matches.is_empty(),
                CoreError::InplayTransitionMarketMatchingQueueIsNotEmpty
            );
            market_matching_pool.move_to_inplay(&market.event_start_order_behaviour);
        }
    }

    // check how much liquidity is left and void it
    let stake_to_void = match order.for_outcome {
        true => market_liquidities
            .remove_liquidity_for(
                order.market_outcome_index,
                order.expected_price,
                order.stake_unmatched,
            )
            .map_err(|_| CoreError::CancelationLowLiquidity)?,
        false => market_liquidities
            .remove_liquidity_against(
                order.market_outcome_index,
                order.expected_price,
                order.stake_unmatched,
            )
            .map_err(|_| CoreError::CancelationLowLiquidity)?,
    };
    order.void_stake_unmatched_by(stake_to_void)?;

    // remove liquidity from the matching pool and order if needed
    matching::matching_pool::update_on_cancel(
        market_matching_pool,
        stake_to_void,
        order_pk,
        order.stake_unmatched == 0_u64,
    )?;

    // compute cost of this operation grows linear with the number of liquidity points,
    // so it is disabled in production but left in for further testing
    let update_derived_liquidity = false; // flag indicating removal of cross liquidity
    if update_derived_liquidity {
        let liquidity_source =
            LiquiditySource::new(order.market_outcome_index, order.expected_price);
        match order.for_outcome {
            true => market_liquidities.update_all_cross_liquidity_against(&liquidity_source),
            false => market_liquidities.update_all_cross_liquidity_for(&liquidity_source),
        }
    }

    // calculate refund
    // TODO need to pass the voided stake value as this might be second (or third, etc) void
    let refund = market_position::update_on_order_cancellation(market_position, order)?;

    Ok(refund)
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::state::market_account::{mock_market, MarketStatus};
    use crate::state::market_liquidities::{mock_market_liquidities, MarketOutcomePriceLiquidity};
    use crate::state::market_matching_pool_account::mock_market_matching_pool;
    use crate::state::market_matching_queue_account::mock_market_matching_queue;
    use crate::state::market_position_account::mock_market_position;

    #[test]
    fn full_cancellation() {
        let market_outcome_index = 1;
        let for_outcome = true;
        let price = 3.0_f64;
        let stake = 10_u64;
        let payer_pk = Pubkey::new_unique();

        let market_pk = Pubkey::new_unique();
        let mut market = mock_market(MarketStatus::Open);
        let mut market_liquidities = mock_market_liquidities(market_pk);
        let mut market_matching_queue = mock_market_matching_queue(market_pk);

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(
            market_pk,
            market_outcome_index,
            for_outcome,
            price,
            stake,
            payer_pk,
        );

        let mut market_position = mock_market_position(3);
        let mut market_matching_pool =
            mock_market_matching_pool(market_pk, market_outcome_index, for_outcome, price);

        // add order to market position
        market_position::update_on_order_request_creation(
            &mut market_position,
            market_outcome_index,
            for_outcome,
            stake,
            price,
        )
        .expect("");
        assert_eq!(vec!(10, 0, 10), market_position.unmatched_exposures);

        // add order to market matching pool
        market_matching_pool.orders.enqueue(order_pk);
        market_matching_pool.liquidity_amount = stake;

        // add order to market liquidity
        market_liquidities
            .add_liquidity_for(market_outcome_index, price, stake)
            .expect("");
        assert_eq!(
            vec!((1, 3.0, 10)),
            liquidities(&market_liquidities.liquidities_for)
        );

        // when
        let result = cancel_order(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_queue,
            &mut market_matching_pool,
        );

        // then
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 10);
        assert_eq!(vec!(0, 0, 0), market_position.unmatched_exposures);
        assert_eq!(0, market_liquidities.liquidities_for.len());
        assert_eq!(0, market_matching_pool.orders.len());
    }

    #[test]
    fn partial_cancellation() {
        let market_outcome_index = 1;
        let for_outcome = true;
        let price = 3.0_f64;
        let stake = 10_u64;
        let payer_pk = Pubkey::new_unique();

        let market_pk = Pubkey::new_unique();
        let mut market = mock_market(MarketStatus::Open);
        let mut market_liquidities = mock_market_liquidities(market_pk);
        let mut market_matching_queue = mock_market_matching_queue(market_pk);

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(
            market_pk,
            market_outcome_index,
            for_outcome,
            price,
            stake,
            payer_pk,
        );

        let mut market_position = mock_market_position(3);
        let mut market_matching_pool =
            mock_market_matching_pool(market_pk, market_outcome_index, for_outcome, price);

        // add order to market position
        market_position::update_on_order_request_creation(
            &mut market_position,
            market_outcome_index,
            for_outcome,
            stake,
            price,
        )
        .expect("");
        assert_eq!(vec!(10, 0, 10), market_position.unmatched_exposures);

        // add order to market matching pool
        market_matching_pool.orders.enqueue(order_pk);
        market_matching_pool.liquidity_amount = stake;

        // add order to market position
        market_liquidities
            .add_liquidity_for(market_outcome_index, price, stake - 1) // less than unmatched stake
            .expect("");
        assert_eq!(
            vec!((1, 3.0, 9)),
            liquidities(&market_liquidities.liquidities_for)
        );

        // when
        let result = cancel_order(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_queue,
            &mut market_matching_pool,
        );

        // then
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 9);
        assert_eq!(vec!(1, 0, 1), market_position.unmatched_exposures);
        assert_eq!(0, market_liquidities.liquidities_for.len());
        assert_eq!(1, market_matching_pool.orders.len());
    }

    #[test]
    fn no_cancellation() {
        let market_outcome_index = 1;
        let for_outcome = true;
        let price = 3.0_f64;
        let stake = 10_u64;
        let payer_pk = Pubkey::new_unique();

        let market_pk = Pubkey::new_unique();
        let mut market = mock_market(MarketStatus::Open);
        let mut market_liquidities = mock_market_liquidities(market_pk);
        let mut market_matching_queue = mock_market_matching_queue(market_pk);

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(
            market_pk,
            market_outcome_index,
            for_outcome,
            price,
            stake,
            payer_pk,
        );

        let mut market_position = mock_market_position(3);
        let mut market_matching_pool =
            mock_market_matching_pool(market_pk, market_outcome_index, for_outcome, price);

        // add order to market position
        market_position::update_on_order_request_creation(
            &mut market_position,
            market_outcome_index,
            for_outcome,
            stake,
            price,
        )
        .expect("");
        assert_eq!(vec!(10, 0, 10), market_position.unmatched_exposures);

        // add order to market matching pool
        market_matching_pool.orders.enqueue(order_pk);
        market_matching_pool.liquidity_amount = stake;

        // add order to market position
        assert!(liquidities(&market_liquidities.liquidities_for).is_empty());

        // when
        let result = cancel_order(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_queue,
            &mut market_matching_pool,
        );

        // then
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::CancelationLowLiquidity)
        );
        assert_eq!(vec!(10, 0, 10), market_position.unmatched_exposures);
        assert_eq!(0, market_liquidities.liquidities_for.len());
        assert_eq!(1, market_matching_pool.orders.len());
    }

    fn liquidities(liquidities: &Vec<MarketOutcomePriceLiquidity>) -> Vec<(u16, f64, u64)> {
        liquidities
            .iter()
            .map(|v| (v.outcome, v.price, v.liquidity))
            .collect::<Vec<(u16, f64, u64)>>()
    }
}
