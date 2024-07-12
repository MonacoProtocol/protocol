use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::instructions::market::move_market_to_inplay;
use crate::instructions::market_position;
use crate::state::market_account::{Market, MarketOrderBehaviour, MarketStatus};
use crate::state::market_liquidities::MarketLiquidities;
use crate::state::market_matching_pool_account::MarketMatchingPool;
use crate::state::market_matching_queue_account::MarketMatchingQueue;
use crate::state::market_order_request_queue::MarketOrderRequestQueue;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::Order;
use crate::state::order_account::OrderStatus;

pub fn cancel_preplay_order_post_event_start(
    market: &mut Market,
    market_liquidities: &mut MarketLiquidities,
    market_matching_pool: &mut MarketMatchingPool,
    order: &mut Order,
    market_position: &mut MarketPosition,
    matching_queue: &MarketMatchingQueue,
    order_request_queue: &MarketOrderRequestQueue,
) -> Result<u64> {
    // market is open + in inplay mode + and cancellation is the intended behaviour
    require!(
        [MarketStatus::Open].contains(&market.market_status),
        CoreError::CancelationMarketStatusInvalid
    );
    require!(market.is_inplay(), CoreError::CancelationMarketNotInplay);
    require!(
        MarketOrderBehaviour::CancelUnmatched.eq(&market.event_start_order_behaviour),
        CoreError::CancelationMarketOrderBehaviourInvalid
    );

    // order is (open or matched) + created before market event start
    require!(
        [OrderStatus::Open, OrderStatus::Matched].contains(&order.order_status),
        CoreError::CancelationOrderStatusInvalid
    );
    require!(
        order.stake_unmatched > 0_u64,
        CoreError::CancelOrderNotCancellable
    );
    require!(
        order.creation_timestamp < market.event_start_timestamp,
        CoreError::CancelationOrderCreatedAfterMarketEventStarted
    );

    if let Some(order_request) = order_request_queue.order_requests.peek_front() {
        require!(
            market.event_start_timestamp <= order_request.creation_timestamp,
            CoreError::CancelationPreplayOrderRequestsExist
        );
    }

    // if market is inplay, but the inplay flag hasn't been flipped yet, do it now
    // and zero liquidities before cancelling the order if that's what the market is
    // configured for
    if market.is_inplay() && !market.inplay {
        move_market_to_inplay(market, market_liquidities)?;
    }
    if !market_matching_pool.inplay {
        require!(
            matching_queue.matches.is_empty(),
            CoreError::InplayTransitionMarketMatchingQueueIsNotEmpty
        );
        market_matching_pool.move_to_inplay(&market.event_start_order_behaviour);
    }

    order.void_stake_unmatched(); // <-- void needs to happen before refund calculation
    let refund = market_position::update_on_order_cancellation(market_position, order)?;

    // if never matched
    if order.stake == order.voided_stake {
        // no more settlement needed
        market.decrement_unsettled_accounts_count()?;
    }

    Ok(refund)
}

#[cfg(test)]
mod test {
    use crate::state::market_account::MarketStatus;
    use crate::state::market_liquidities::mock_market_liquidities;
    use crate::state::market_matching_pool_account::Cirque;
    use crate::state::market_matching_queue_account::{mock_market_matching_queue, OrderMatch};
    use crate::state::market_order_request_queue::{mock_order_request, mock_order_request_queue};
    use crate::state::order_account::OrderStatus;

    use super::*;

    #[test]
    fn error_order_status_invalid() {
        let market_outcome_index = 1;
        let matched_price = 2.2_f64;
        let payer_pk = Pubkey::new_unique();

        let market_pk = Pubkey::new_unique();
        let mut market = mock_market();

        let mut market_liquidities = mock_market_liquidities(market_pk);

        let order_request = mock_order_request(
            Pubkey::new_unique(),
            false,
            market_outcome_index,
            100_u64,
            2.4_f64,
        );

        let mut order = Order {
            purchaser: Pubkey::new_unique(),
            market: market_pk,
            market_outcome_index,
            for_outcome: false,
            order_status: OrderStatus::SettledWin,
            product: None,
            product_commission_rate: 0.0,
            expected_price: 2.4_f64,
            stake: 100_u64,
            stake_unmatched: 0_u64,
            voided_stake: 0_u64,
            payout: 0_u64,
            creation_timestamp: 0,
            payer: payer_pk,
        };
        let matching_queue = &mock_market_matching_queue(market_pk);
        let order_request_queue = &mock_order_request_queue(market_pk);

        let mut market_matching_pool =
            mock_market_matching_pool(market_pk, market_outcome_index, matched_price);

        let mut market_position = MarketPosition::default();
        market_position.market_outcome_sums.resize(3, 0_i128);
        market_position.unmatched_exposures.resize(3, 0_u64);
        let update_on_order_creation = market_position::update_on_order_request_creation(
            &mut market_position,
            order_request.market_outcome_index,
            order_request.for_outcome,
            order_request.stake,
            order_request.expected_price,
        );
        assert!(update_on_order_creation.is_ok());
        assert_eq!(vec!(0, 140, 0), market_position.unmatched_exposures);

        // when
        let result = cancel_preplay_order_post_event_start(
            &mut market,
            &mut market_liquidities,
            &mut market_matching_pool,
            &mut order,
            &mut market_position,
            &matching_queue,
            &order_request_queue,
        );

        // then
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::CancelationOrderStatusInvalid)
        );
    }

    #[test]
    fn ok_cancel_remaining_unmatched_stake() {
        let market_outcome_index = 1;
        let matched_price = 2.2_f64;
        let payer_pk = Pubkey::new_unique();

        let market_pk = Pubkey::new_unique();
        let mut market = mock_market();
        let mut market_liquidities = mock_market_liquidities(market_pk);
        let mut market_position = mock_market_position(3);

        let order_request = mock_order_request(
            Pubkey::new_unique(),
            false,
            market_outcome_index,
            100_u64,
            2.4_f64,
        );

        let mut order = Order {
            purchaser: Pubkey::new_unique(),
            market: market_pk,
            market_outcome_index,
            for_outcome: false,
            order_status: OrderStatus::Matched,
            product: None,
            product_commission_rate: 0.0,
            expected_price: 2.4_f64,
            stake: 100_u64,
            stake_unmatched: 10_u64,
            voided_stake: 0_u64,
            payout: 216_u64,
            creation_timestamp: 0,
            payer: payer_pk,
        };

        let matching_queue = &mock_market_matching_queue(market_pk);
        let order_request_queue = &mock_order_request_queue(market_pk);

        let mut market_matching_pool =
            mock_market_matching_pool(market_pk, market_outcome_index, matched_price);

        market_position::update_on_order_request_creation(
            &mut market_position,
            order_request.market_outcome_index,
            order_request.for_outcome,
            order_request.stake,
            order_request.expected_price,
        )
        .unwrap();
        market_position::update_on_order_match(
            &mut market_position,
            &order,
            order.stake - order.stake_unmatched,
            order.expected_price,
        )
        .unwrap();
        assert_eq!(vec!(0, 14, 0), market_position.unmatched_exposures);

        // when 1
        let result1 = cancel_preplay_order_post_event_start(
            &mut market,
            &mut market_liquidities,
            &mut market_matching_pool,
            &mut order,
            &mut market_position,
            &matching_queue,
            &order_request_queue,
        );

        // then 1
        assert!(result1.is_ok());
        assert_eq!(14, result1.unwrap());
        assert_eq!(10, order.voided_stake);

        // when 2
        let result2 = cancel_preplay_order_post_event_start(
            &mut market,
            &mut market_liquidities,
            &mut market_matching_pool,
            &mut order,
            &mut market_position,
            &matching_queue,
            &order_request_queue,
        );

        // then 2
        assert!(result2.is_err());
        assert_eq!(
            result2.unwrap_err(),
            error!(CoreError::CancelOrderNotCancellable)
        );
    }

    #[test]
    fn ok_inplay_order_requests_exist() {
        let market_outcome_index = 1;
        let matched_price = 2.2_f64;
        let payer_pk = Pubkey::new_unique();

        let market_pk = Pubkey::new_unique();
        let mut market = mock_market();
        let mut market_liquidities = mock_market_liquidities(market_pk);

        let mut order_request = mock_order_request(
            Pubkey::new_unique(),
            false,
            market_outcome_index,
            100_u64,
            2.4_f64,
        );
        order_request.creation_timestamp = market.event_start_timestamp + 1;

        let mut order = Order {
            purchaser: Pubkey::new_unique(),
            market: market_pk,
            market_outcome_index,
            for_outcome: false,
            order_status: OrderStatus::Matched,
            product: None,
            product_commission_rate: 0.0,
            expected_price: 2.4_f64,
            stake: 100_u64,
            stake_unmatched: 10_u64,
            voided_stake: 0_u64,
            payout: 0_u64,
            creation_timestamp: 0,
            payer: payer_pk,
        };

        let matching_queue = &mock_market_matching_queue(market_pk);
        let order_request_queue = &mut mock_order_request_queue(market_pk);
        order_request_queue.order_requests.enqueue(order_request);

        let mut market_position = MarketPosition::default();
        market_position.market_outcome_sums.resize(3, 0_i128);
        market_position.unmatched_exposures.resize(3, 0_u64);
        let update_on_order_creation = market_position::update_on_order_request_creation(
            &mut market_position,
            order_request.market_outcome_index,
            order_request.for_outcome,
            order_request.stake,
            order_request.expected_price,
        );
        assert!(update_on_order_creation.is_ok());
        assert_eq!(vec!(0, 140, 0), market_position.unmatched_exposures);

        let mut market_matching_pool =
            mock_market_matching_pool(market_pk, market_outcome_index, matched_price);

        let result = cancel_preplay_order_post_event_start(
            &mut market,
            &mut market_liquidities,
            &mut market_matching_pool,
            &mut order,
            &mut market_position,
            &matching_queue,
            &order_request_queue,
        );

        assert!(result.is_ok());
        assert_eq!(14, result.unwrap());
        assert_eq!(10, order.voided_stake);
    }

    #[test]
    fn error_unprocessed_preplay_order_requests() {
        let market_outcome_index = 1;
        let matched_price = 2.2_f64;
        let payer_pk = Pubkey::new_unique();

        let market_pk = Pubkey::new_unique();
        let mut market = mock_market();
        let mut market_liquidities = mock_market_liquidities(market_pk);

        let order_request = mock_order_request(
            Pubkey::new_unique(),
            false,
            market_outcome_index,
            100_u64,
            2.4_f64,
        );

        let mut order = Order {
            purchaser: Pubkey::new_unique(),
            market: market_pk,
            market_outcome_index,
            for_outcome: false,
            order_status: OrderStatus::Matched,
            product: None,
            product_commission_rate: 0.0,
            expected_price: 2.4_f64,
            stake: 100_u64,
            stake_unmatched: 10_u64,
            voided_stake: 0_u64,
            payout: 0_u64,
            creation_timestamp: 0,
            payer: payer_pk,
        };
        let matching_queue = &mock_market_matching_queue(market_pk);
        let order_request_queue = &mut mock_order_request_queue(market_pk);
        order_request_queue.order_requests.enqueue(order_request);

        let mut market_position = MarketPosition::default();
        market_position.market_outcome_sums.resize(3, 0_i128);
        market_position.unmatched_exposures.resize(3, 0_u64);
        let update_on_order_creation = market_position::update_on_order_request_creation(
            &mut market_position,
            order_request.market_outcome_index,
            order_request.for_outcome,
            order_request.stake,
            order_request.expected_price,
        );
        assert!(update_on_order_creation.is_ok());
        assert_eq!(vec!(0, 140, 0), market_position.unmatched_exposures);

        let mut market_matching_pool =
            mock_market_matching_pool(market_pk, market_outcome_index, matched_price);

        // when
        let result = cancel_preplay_order_post_event_start(
            &mut market,
            &mut market_liquidities,
            &mut market_matching_pool,
            &mut order,
            &mut market_position,
            &matching_queue,
            &order_request_queue,
        );

        // then
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::CancelationPreplayOrderRequestsExist)
        );
    }

    #[test]
    fn error_matching_queue_not_empty() {
        let market_outcome_index = 1;
        let matched_price = 2.2_f64;
        let payer_pk = Pubkey::new_unique();

        let market_pk = Pubkey::new_unique();
        let mut market = mock_market();
        let mut market_liquidities = mock_market_liquidities(market_pk);

        let order_request = mock_order_request(
            Pubkey::new_unique(),
            false,
            market_outcome_index,
            100_u64,
            2.4_f64,
        );

        let mut order = Order {
            purchaser: Pubkey::new_unique(),
            market: market_pk,
            market_outcome_index,
            for_outcome: false,
            order_status: OrderStatus::Matched,
            product: None,
            product_commission_rate: 0.0,
            expected_price: 2.4_f64,
            stake: 100_u64,
            stake_unmatched: 10_u64,
            voided_stake: 0_u64,
            payout: 0_u64,
            creation_timestamp: 0,
            payer: payer_pk,
        };
        let matching_queue = &mut mock_market_matching_queue(market_pk);
        matching_queue
            .matches
            .enqueue(OrderMatch::maker(false, 0, 0.0, 0));
        let order_request_queue = &mock_order_request_queue(market_pk);

        let mut market_position = MarketPosition::default();
        market_position.market_outcome_sums.resize(3, 0_i128);
        market_position.unmatched_exposures.resize(3, 0_u64);
        let update_on_order_creation = market_position::update_on_order_request_creation(
            &mut market_position,
            order_request.market_outcome_index,
            order_request.for_outcome,
            order_request.stake,
            order_request.expected_price,
        );
        assert!(update_on_order_creation.is_ok());
        assert_eq!(vec!(0, 140, 0), market_position.unmatched_exposures);

        let mut market_matching_pool =
            mock_market_matching_pool(market_pk, market_outcome_index, matched_price);

        // when
        let result = cancel_preplay_order_post_event_start(
            &mut market,
            &mut market_liquidities,
            &mut market_matching_pool,
            &mut order,
            &mut market_position,
            &matching_queue,
            &order_request_queue,
        );

        // then
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::InplayTransitionMarketMatchingQueueIsNotEmpty)
        );
    }

    fn mock_market() -> Market {
        Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Open,
            inplay_enabled: true,
            inplay: true,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 0,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            event_start_order_behaviour: MarketOrderBehaviour::CancelUnmatched,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            inplay_order_delay: 0,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            funding_account_bump: 0,
            event_start_timestamp: 100,
        }
    }

    fn mock_market_position(outcomes: usize) -> MarketPosition {
        let mut market_position = MarketPosition::default();
        market_position.market_outcome_sums.resize(outcomes, 0_i128);
        market_position.unmatched_exposures.resize(outcomes, 0_u64);
        return market_position;
    }

    fn mock_market_matching_pool(
        market_pk: Pubkey,
        market_outcome_index: u16,
        price: f64,
    ) -> MarketMatchingPool {
        MarketMatchingPool {
            market: market_pk,
            market_outcome_index,
            for_outcome: false,
            price,
            liquidity_amount: 0_u64,
            matched_amount: 0_u64,
            inplay: false,
            orders: Cirque::new(1),
            payer: Pubkey::new_unique(),
        }
    }
}
