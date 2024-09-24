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
    if market.is_inplay() && !market_matching_pool.inplay {
        require!(
            market_matching_queue.matches.is_empty(),
            CoreError::InplayTransitionMarketMatchingQueueIsNotEmpty
        );
        market_matching_pool.move_to_inplay(&market.event_start_order_behaviour);
    }

    // check how much liquidity is left
    let liquidity = match order.for_outcome {
        true => market_liquidities
            .get_liquidity_for(order.market_outcome_index, order.expected_price)
            .map(|v| v.liquidity)
            .unwrap_or(0),
        false => market_liquidities
            .get_liquidity_against(order.market_outcome_index, order.expected_price)
            .map(|v| v.liquidity)
            .unwrap_or(0),
    };
    require!(liquidity > 0_u64, CoreError::CancelationLowLiquidity);

    // void only up to available liquidity
    let stake_to_void = order.void_stake_unmatched_up_to(liquidity)?;

    // remove from matching pool
    matching::matching_pool::update_on_cancel(
        market_matching_pool,
        stake_to_void,
        order_pk,
        order.stake_unmatched == 0_u64,
    )?;

    // update liquidity if the order was still present in the matching pool
    let update_derived_liquidity = false; // flag indicating removal of cross liquidity
    match order.for_outcome {
        true => remove_liquidity_for(
            market_liquidities,
            order.market_outcome_index,
            order.expected_price,
            stake_to_void,
            update_derived_liquidity,
        )?,
        false => remove_liquidity_against(
            market_liquidities,
            order.market_outcome_index,
            order.expected_price,
            stake_to_void,
            update_derived_liquidity,
        )?,
    }

    // calculate refund
    // TODO need to pass the voided stake value as this might be second (or third, etc) void
    let refund = market_position::update_on_order_cancellation(market_position, order)?;

    Ok(refund)
}

fn remove_liquidity_for(
    market_liquidities: &mut MarketLiquidities,
    outcome: u16,
    price: f64,
    liquidity: u64,
    update_derived_liquidity: bool,
) -> Result<()> {
    market_liquidities
        .remove_liquidity_for(outcome, price, liquidity)
        .map_err(|_| CoreError::CancelationLowLiquidity)?;

    // disabled in production, but left in for further testing
    // compute cost of this operation grows linear with the number of liquidity points
    if update_derived_liquidity {
        let liquidity_source = LiquiditySource::new(outcome, price);
        market_liquidities.update_all_cross_liquidity_against(&liquidity_source);
    }

    Ok(())
}

fn remove_liquidity_against(
    market_liquidities: &mut MarketLiquidities,
    outcome: u16,
    price: f64,
    liquidity: u64,
    update_derived_liquidity: bool,
) -> Result<()> {
    market_liquidities
        .remove_liquidity_against(outcome, price, liquidity)
        .map_err(|_| CoreError::CancelationLowLiquidity)?;

    // disabled in production, but left in for further testing
    // compute cost of this operation grows linear with the number of liquidity points
    if update_derived_liquidity {
        let liquidity_source = LiquiditySource::new(outcome, price);
        market_liquidities.update_all_cross_liquidity_for(&liquidity_source);
    }

    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::state::market_account::{mock_market, MarketStatus};
    use crate::state::market_liquidities::{mock_market_liquidities, MarketOutcomePriceLiquidity};
    use crate::state::market_matching_pool_account::mock_market_matching_pool;
    use crate::state::market_matching_queue_account::mock_market_matching_queue;

    #[test]
    fn success() {
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

        let mut market_position = MarketPosition::default();
        let mut market_matching_pool =
            mock_market_matching_pool(market_pk, market_outcome_index, for_outcome, price);

        // add order to market position
        market_position.market_outcome_sums.resize(3, 0_i128);
        market_position.unmatched_exposures.resize(3, 0_u64);
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
    }

    #[test]
    fn low_liquidity() {
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

        let mut market_position = MarketPosition::default();
        let mut market_matching_pool =
            mock_market_matching_pool(market_pk, market_outcome_index, for_outcome, price);

        // add order to market position
        market_position.market_outcome_sums.resize(3, 0_i128);
        market_position.unmatched_exposures.resize(3, 0_u64);
        market_position::update_on_order_request_creation(
            &mut market_position,
            market_outcome_index,
            for_outcome,
            stake,
            price,
        )
        .expect("");
        assert_eq!(vec!(0, 0, 0), market_position.market_outcome_sums);
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
        assert_eq!(vec!(1, 0, 1), market_position.unmatched_exposures);
        assert_eq!(
            Vec::<(u16, f64, u64)>::new(),
            liquidities(&market_liquidities.liquidities_for)
        );
    }

    fn liquidities(liquidities: &Vec<MarketOutcomePriceLiquidity>) -> Vec<(u16, f64, u64)> {
        liquidities
            .iter()
            .map(|v| (v.outcome, v.price, v.liquidity))
            .collect::<Vec<(u16, f64, u64)>>()
    }
}
