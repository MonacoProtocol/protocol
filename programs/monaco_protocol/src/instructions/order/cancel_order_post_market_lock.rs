use crate::error::CoreError;
use crate::instructions::clock::current_timestamp;
use crate::instructions::order::cancel_order_common;
use crate::state::market_account::{Market, MarketOrderBehaviour, MarketStatus};
use crate::state::market_liquidities::MarketLiquidities;
use crate::state::market_matching_pool_account::MarketMatchingPool;
use crate::state::market_order_request_queue::MarketOrderRequestQueue;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::{Order, OrderStatus};
use anchor_lang::prelude::*;

pub fn cancel_order_post_market_lock(
    market: &mut Market,
    order_pk: &Pubkey,
    order: &mut Order,
    market_position: &mut MarketPosition,
    market_liquidities: &mut MarketLiquidities,
    market_matching_pool: &mut MarketMatchingPool,
    order_request_queue: &MarketOrderRequestQueue,
) -> Result<u64> {
    // market is open
    require!(
        [MarketStatus::Open].contains(&market.market_status),
        CoreError::CancelationMarketStatusInvalid
    );
    // market should be locked and cancellation is the intended behaviour
    require!(
        market.market_lock_timestamp <= current_timestamp(),
        CoreError::CancelationMarketNotLocked
    );
    require!(
        MarketOrderBehaviour::CancelUnmatched.eq(&market.market_lock_order_behaviour),
        CoreError::CancelationMarketOrderBehaviourInvalid
    );
    // make sure that all orders had a chance to match
    require!(
        order_request_queue.order_requests.is_empty(),
        CoreError::OrderRequestQueueIsNotEmpty
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

    cancel_order_common(
        market_liquidities,
        market_matching_pool,
        order_pk,
        order,
        market_position,
    )
}

#[cfg(test)]
mod test {
    use crate::instructions::market_position;
    use crate::state::market_account::{mock_market, MarketStatus};
    use crate::state::market_liquidities::mock_market_liquidities;
    use crate::state::market_matching_pool_account::mock_market_matching_pool;
    use crate::state::market_order_request_queue::{mock_order_request, mock_order_request_queue};
    use crate::state::market_position_account::mock_market_position;
    use crate::state::order_account::{mock_order, OrderStatus};

    use super::*;

    #[test]
    fn error_market_order_request_queue_not_empty() {
        let (
            market_outcome_index,
            for_outcome,
            price,
            mut market,
            order_pk,
            mut order,
            mut market_position,
            mut market_matching_pool,
            mut market_liquidities,
            mut market_order_request_queue,
        ) = setup_for_cancellation(100, 10);
        market_order_request_queue
            .order_requests
            .enqueue(mock_order_request(
                order.purchaser,
                for_outcome,
                market_outcome_index,
                order.stake,
                price,
            ));

        let result = cancel_order_post_market_lock(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_pool,
            &market_order_request_queue,
        );

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::OrderRequestQueueIsNotEmpty)
        );

        market_order_request_queue.order_requests.dequeue();

        let result = cancel_order_post_market_lock(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_pool,
            &market_order_request_queue,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn error_market_status_invalid() {
        let (
            _market_outcome_index,
            _for_outcome,
            _price,
            mut market,
            order_pk,
            mut order,
            mut market_position,
            mut market_matching_pool,
            mut market_liquidities,
            market_order_request_queue,
        ) = setup_for_cancellation(100, 10);
        market.market_status = MarketStatus::Settled;

        let result = cancel_order_post_market_lock(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_pool,
            &market_order_request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::CancelationMarketStatusInvalid)
        );
    }

    #[test]
    fn error_market_not_locked() {
        let (
            _market_outcome_index,
            _for_outcome,
            _price,
            mut market,
            order_pk,
            mut order,
            mut market_position,
            mut market_matching_pool,
            mut market_liquidities,
            market_order_request_queue,
        ) = setup_for_cancellation(100, 10);
        market.market_lock_timestamp = current_timestamp() + 1000;

        let result = cancel_order_post_market_lock(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_pool,
            &market_order_request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::CancelationMarketNotLocked)
        );
    }

    #[test]
    fn error_market_not_configured_to_cancel() {
        let (
            _market_outcome_index,
            _for_outcome,
            _price,
            mut market,
            order_pk,
            mut order,
            mut market_position,
            mut market_matching_pool,
            mut market_liquidities,
            market_order_request_queue,
        ) = setup_for_cancellation(100, 10);
        market.market_lock_order_behaviour = MarketOrderBehaviour::None;

        let result = cancel_order_post_market_lock(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_pool,
            &market_order_request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::CancelationMarketOrderBehaviourInvalid)
        );
    }

    #[test]
    fn error_order_status_invalid() {
        let (
            _market_outcome_index,
            _for_outcome,
            _price,
            mut market,
            order_pk,
            mut order,
            mut market_position,
            mut market_matching_pool,
            mut market_liquidities,
            market_order_request_queue,
        ) = setup_for_cancellation(100, 10);
        order.order_status = OrderStatus::SettledWin;

        let result = cancel_order_post_market_lock(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_pool,
            &market_order_request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::CancelationOrderStatusInvalid)
        );
    }

    #[test]
    fn ok_cancel_remaining_unmatched_stake() {
        let (
            _market_outcome_index,
            _for_outcome,
            _price,
            mut market,
            order_pk,
            mut order,
            mut market_position,
            mut market_matching_pool,
            mut market_liquidities,
            market_order_request_queue,
        ) = setup_for_cancellation(100, 10);
        market.unsettled_accounts_count = 1;

        let result = cancel_order_post_market_lock(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_pool,
            &market_order_request_queue,
        );
        assert!(result.is_ok());
        assert_eq!(14, result.unwrap());
        assert_eq!(10, order.voided_stake);
        assert_eq!(0, order.stake_unmatched);
        assert_eq!(OrderStatus::Matched, order.order_status);
        assert_eq!(1, market.unsettled_accounts_count);

        let result = cancel_order_post_market_lock(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_pool,
            &market_order_request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::CancelOrderNotCancellable)
        );
    }

    #[test]
    fn ok_cancel_all_stake() {
        let (
            _market_outcome_index,
            _for_outcome,
            _price,
            mut market,
            order_pk,
            mut order,
            mut market_position,
            mut market_matching_pool,
            mut market_liquidities,
            market_order_request_queue,
        ) = setup_for_cancellation(100, 100);
        market.unsettled_accounts_count = 1;

        let result = cancel_order_post_market_lock(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_pool,
            &market_order_request_queue,
        );
        assert!(result.is_ok());
        assert_eq!(140, result.unwrap());
        assert_eq!(100, order.voided_stake);
        assert_eq!(0, order.stake_unmatched);
        assert_eq!(OrderStatus::Cancelled, order.order_status);

        let result = cancel_order_post_market_lock(
            &mut market,
            &order_pk,
            &mut order,
            &mut market_position,
            &mut market_liquidities,
            &mut market_matching_pool,
            &market_order_request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::CancelationOrderStatusInvalid)
        );
    }

    fn setup_for_cancellation<'test>(
        stake: u64,
        stake_unmatched: u64,
    ) -> (
        u16,
        bool,
        f64,
        Market,
        Pubkey,
        Order,
        MarketPosition,
        MarketMatchingPool,
        MarketLiquidities,
        MarketOrderRequestQueue,
    ) {
        let market_outcome_index = 1;
        let for_outcome = false;
        let price = 2.4_f64;

        let market_pk = Pubkey::new_unique();
        let mut market = mock_market(MarketStatus::Open);
        market.market_lock_order_behaviour = MarketOrderBehaviour::CancelUnmatched;

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(
            market_pk,
            market_outcome_index,
            for_outcome,
            price,
            stake,
            Pubkey::new_unique(),
        );
        order.stake_unmatched = stake_unmatched;
        if stake_unmatched < stake {
            order.order_status = OrderStatus::Matched;
        }

        let mut market_position = mock_market_position(3);
        let _ = market_position::update_on_order_request_creation(
            &mut market_position,
            market_outcome_index,
            for_outcome,
            stake,
            price,
        );

        let mut market_matching_pool =
            mock_market_matching_pool(market_pk, market_outcome_index, for_outcome, price);
        market_matching_pool.orders.enqueue(order_pk);
        market_matching_pool.liquidity_amount = order.stake_unmatched;

        let mut market_liquidities = mock_market_liquidities(market_pk);
        _ = market_liquidities.add_liquidity_against(
            market_outcome_index,
            price,
            order.stake_unmatched,
        );

        let market_order_request_queue = mock_order_request_queue(market_pk);

        (
            market_outcome_index,
            for_outcome,
            price,
            market,
            order_pk,
            order,
            market_position,
            market_matching_pool,
            market_liquidities,
            market_order_request_queue,
        )
    }
}
