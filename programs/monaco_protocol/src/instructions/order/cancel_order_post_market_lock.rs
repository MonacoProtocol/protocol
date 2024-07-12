use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::instructions::clock::current_timestamp;
use crate::instructions::market_position;
use crate::state::market_account::{Market, MarketOrderBehaviour, MarketStatus};
use crate::state::market_matching_queue_account::MarketMatchingQueue;
use crate::state::market_order_request_queue::MarketOrderRequestQueue;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::Order;
use crate::state::order_account::OrderStatus;

pub fn cancel_order_post_market_lock(
    market: &mut Market,
    order: &mut Order,
    market_position: &mut MarketPosition,
    matching_queue: &MarketMatchingQueue,
    order_request_queue: &MarketOrderRequestQueue,
) -> Result<u64> {
    // market is open + should be locked and cancellation is the intended behaviour
    require!(
        [MarketStatus::Open].contains(&market.market_status),
        CoreError::CancelationMarketStatusInvalid
    );
    require!(
        market.market_lock_timestamp <= current_timestamp(),
        CoreError::CancelationMarketNotLocked
    );
    require!(
        MarketOrderBehaviour::CancelUnmatched.eq(&market.market_lock_order_behaviour),
        CoreError::CancelationMarketOrderBehaviourInvalid
    );
    require!(
        matching_queue.matches.is_empty(),
        CoreError::MatchingQueueIsNotEmpty
    );
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

    order.void_stake_unmatched(); // <-- void needs to happen before refund calculation
    if order.order_status == OrderStatus::Cancelled {
        market.decrement_unsettled_accounts_count()?;
    }

    let refund = market_position::update_on_order_cancellation(market_position, order)?;

    Ok(refund)
}

#[cfg(test)]
mod test {
    use crate::state::market_account::MarketStatus;
    use crate::state::market_matching_queue_account::{mock_market_matching_queue, OrderMatch};
    use crate::state::market_order_request_queue::{mock_order_request, mock_order_request_queue};
    use crate::state::order_account::OrderStatus;

    use super::*;

    #[test]
    fn error_market_queues_not_empty() {
        let mut market = mock_market();
        let order_request = mock_order_request(Pubkey::new_unique(), false, 1, 100_u64, 2.4_f64);
        let mut order = Order {
            purchaser: Pubkey::new_unique(),
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
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
            payer: Pubkey::new_unique(),
        };
        let matching_queue = &mut mock_market_matching_queue(order.market);
        matching_queue
            .matches
            .enqueue(OrderMatch::maker(false, 0, 0.0, 0));

        let request_queue = &mut mock_order_request_queue(order.market);
        request_queue.order_requests.enqueue(order_request);

        let mut market_position = MarketPosition::default();
        market_position.market_outcome_sums.resize(3, 0_i128);
        market_position.unmatched_exposures.resize(3, 0_u64);
        let _ = market_position::update_on_order_request_creation(
            &mut market_position,
            order_request.market_outcome_index,
            order_request.for_outcome,
            order_request.stake,
            order_request.expected_price,
        );

        let result = cancel_order_post_market_lock(
            &mut market,
            &mut order,
            &mut market_position,
            &matching_queue,
            &request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::MatchingQueueIsNotEmpty)
        );

        matching_queue.matches.dequeue();

        let result = cancel_order_post_market_lock(
            &mut market,
            &mut order,
            &mut market_position,
            &matching_queue,
            &request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::OrderRequestQueueIsNotEmpty)
        );

        request_queue.order_requests.dequeue();

        let result = cancel_order_post_market_lock(
            &mut market,
            &mut order,
            &mut market_position,
            &matching_queue,
            &request_queue,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn error_market_status_invalid() {
        let mut market = mock_market();
        let order_request = mock_order_request(Pubkey::new_unique(), false, 1, 100_u64, 2.4_f64);
        let mut order = Order {
            purchaser: Pubkey::new_unique(),
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
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
            payer: Pubkey::new_unique(),
        };
        let matching_queue = mock_market_matching_queue(order.market);
        let request_queue = mock_order_request_queue(order.market);

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

        market.market_status = MarketStatus::Settled;

        let result = cancel_order_post_market_lock(
            &mut market,
            &mut order,
            &mut market_position,
            &matching_queue,
            &request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::CancelationMarketStatusInvalid)
        );
    }

    #[test]
    fn error_market_not_locked() {
        let mut market = mock_market();
        let order_request = mock_order_request(Pubkey::new_unique(), false, 1, 100_u64, 2.4_f64);
        let mut order = Order {
            purchaser: Pubkey::new_unique(),
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
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
            payer: Pubkey::new_unique(),
        };
        let matching_queue = mock_market_matching_queue(order.market);
        let request_queue = mock_order_request_queue(order.market);

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

        market.market_lock_timestamp = current_timestamp() + 1000;

        let result = cancel_order_post_market_lock(
            &mut market,
            &mut order,
            &mut market_position,
            &matching_queue,
            &request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::CancelationMarketNotLocked)
        );
    }

    #[test]
    fn error_market_not_configured_to_cancel() {
        let mut market = mock_market();
        let order_request = mock_order_request(Pubkey::new_unique(), false, 1, 100_u64, 2.4_f64);
        let mut order = Order {
            purchaser: Pubkey::new_unique(),
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
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
            payer: Pubkey::new_unique(),
        };
        let matching_queue = mock_market_matching_queue(order.market);
        let request_queue = mock_order_request_queue(order.market);

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

        market.market_lock_order_behaviour = MarketOrderBehaviour::None;

        let result = cancel_order_post_market_lock(
            &mut market,
            &mut order,
            &mut market_position,
            &matching_queue,
            &request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            error!(CoreError::CancelationMarketOrderBehaviourInvalid)
        );
    }

    #[test]
    fn error_order_status_invalid() {
        let mut market = mock_market();
        let order_request = mock_order_request(Pubkey::new_unique(), false, 1, 100_u64, 2.4_f64);
        let mut order = Order {
            purchaser: Pubkey::new_unique(),
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
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
            payer: Pubkey::new_unique(),
        };
        let matching_queue = mock_market_matching_queue(order.market);
        let request_queue = mock_order_request_queue(order.market);

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
        let result = cancel_order_post_market_lock(
            &mut market,
            &mut order,
            &mut market_position,
            &matching_queue,
            &request_queue,
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
        let mut market = mock_market();
        market.unsettled_accounts_count = 1;
        let order_request = mock_order_request(Pubkey::new_unique(), false, 1, 100_u64, 2.4_f64);
        let mut order = Order {
            purchaser: Pubkey::new_unique(),
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
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
            payer: Pubkey::new_unique(),
        };
        let matching_queue = mock_market_matching_queue(order.market);
        let request_queue = mock_order_request_queue(order.market);

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

        // when 1
        let result1 = cancel_order_post_market_lock(
            &mut market,
            &mut order,
            &mut market_position,
            &matching_queue,
            &request_queue,
        );

        // then 1
        assert!(result1.is_ok());
        assert_eq!(14, result1.unwrap());
        assert_eq!(10, order.voided_stake);
        assert_eq!(OrderStatus::Matched, order.order_status);
        assert_eq!(1, market.unsettled_accounts_count);

        // when 2
        let result2 = cancel_order_post_market_lock(
            &mut market,
            &mut order,
            &mut market_position,
            &matching_queue,
            &request_queue,
        );

        // then 2
        assert!(result2.is_err());
        assert_eq!(
            result2.unwrap_err(),
            error!(CoreError::CancelOrderNotCancellable)
        );
    }

    #[test]
    fn ok_cancel_all_stake() {
        let mut market = mock_market();
        market.unsettled_accounts_count = 1;
        let order_request = mock_order_request(Pubkey::new_unique(), false, 1, 100_u64, 2.4_f64);
        let mut order = Order {
            purchaser: Pubkey::new_unique(),
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
            for_outcome: false,
            order_status: OrderStatus::Open,
            product: None,
            product_commission_rate: 0.0,
            expected_price: 2.4_f64,
            stake: 100_u64,
            stake_unmatched: 100_u64,
            voided_stake: 0_u64,
            payout: 0_u64,
            creation_timestamp: 0,
            payer: Pubkey::new_unique(),
        };
        let matching_queue = mock_market_matching_queue(order.market);
        let request_queue = mock_order_request_queue(order.market);

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

        // when 1
        let result1 = cancel_order_post_market_lock(
            &mut market,
            &mut order,
            &mut market_position,
            &matching_queue,
            &request_queue,
        );

        // then 1
        assert!(result1.is_ok());
        assert_eq!(140, result1.unwrap());
        assert_eq!(100, order.voided_stake);
        assert_eq!(OrderStatus::Cancelled, order.order_status);
        assert_eq!(0, market.unsettled_accounts_count); // <-- decremented

        // when 2
        let result2 = cancel_order_post_market_lock(
            &mut market,
            &mut order,
            &mut market_position,
            &matching_queue,
            &request_queue,
        );

        // then 2
        assert!(result2.is_err());
        assert_eq!(
            result2.unwrap_err(),
            error!(CoreError::CancelationOrderStatusInvalid)
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
            market_settle_timestamp: None,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::CancelUnmatched,
            inplay_order_delay: 0,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            funding_account_bump: 0,
            event_start_timestamp: 0,
            market_lock_timestamp: 100,
        }
    }
}
