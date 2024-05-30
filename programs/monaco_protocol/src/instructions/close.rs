use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::state::market_account::MarketStatus::ReadyToClose;
use crate::state::market_account::{Market, MarketStatus};
use crate::state::market_liquidities::MarketLiquidities;
use crate::state::market_matching_queue_account::MatchingQueue;
use crate::state::market_order_request_queue::OrderRequestQueue;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::Order;
use crate::state::payments_queue::PaymentQueue;

pub fn close_market_child_account(market: &mut Market) -> Result<()> {
    require!(
        ReadyToClose.eq(&market.market_status),
        CoreError::MarketNotReadyToClose
    );
    market.decrement_unclosed_accounts_count()
}

pub fn close_order(market: &mut Market, order: &Order) -> Result<()> {
    require!(
        order.is_completed(),
        CoreError::CloseAccountOrderNotComplete
    );
    close_market_child_account(market)
}

pub fn close_market_position(market: &mut Market, market_position: &MarketPosition) -> Result<()> {
    require!(
        market_position.paid,
        CoreError::CloseAccountMarketPositionNotPaid
    );
    close_market_child_account(market)
}

pub fn close_market_queues(
    market: &mut Market,
    // nothing really to check or do for now for this account
    _liquidities: &MarketLiquidities,
    payment_queue: &PaymentQueue,
    matching_queue: &MatchingQueue,
    order_requests: &OrderRequestQueue,
) -> Result<()> {
    require!(
        ReadyToClose.eq(&market.market_status),
        CoreError::MarketNotReadyToClose
    );
    require!(
        payment_queue.is_empty(),
        CoreError::CloseAccountMarketPaymentQueueNotEmpty
    );
    require!(
        matching_queue.is_empty(),
        CoreError::CloseAccountMarketMatchingQueueNotEmpty
    );
    require!(
        order_requests.is_empty(),
        CoreError::CloseAccountOrderRequestQueueNotEmpty
    );

    market.decrement_unclosed_accounts_count()?; // liquidities
    market.decrement_unclosed_accounts_count()?; // payment_queue
    market.decrement_unclosed_accounts_count()?; // matching_queue
    market.decrement_unclosed_accounts_count() // order_request_queue
}

pub fn close_market(market_status: &MarketStatus, unclosed_accounts_count: u32) -> Result<()> {
    require!(
        ReadyToClose.eq(market_status),
        CoreError::MarketNotReadyToClose
    );
    require!(
        unclosed_accounts_count == 0,
        CoreError::MarketUnclosedAccountsCountNonZero
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::market_account::MarketOrderBehaviour;
    use crate::state::market_account::MarketStatus::Open;
    use crate::state::market_liquidities::mock_market_liquidities;
    use crate::state::market_matching_queue_account::OrderMatch;
    use crate::state::order_account::{mock_order_default, OrderStatus};
    use crate::state::payments_queue::PaymentInfo;

    // generic close account validation

    #[test]
    fn test_validate_close_account() {
        let market = &mut test_market();
        market.market_status = ReadyToClose;
        market.unclosed_accounts_count = 1;

        assert!(close_market_child_account(market).is_ok());
        assert_eq!(market.unclosed_accounts_count, 0);
    }

    #[test]
    fn test_validate_close_account_incorrect_status() {
        let market = &mut test_market();
        market.market_status = Open;

        let result = close_market_child_account(market);
        assert!(result.is_err());
        assert_eq!(Err(error!(CoreError::MarketNotReadyToClose)), result);
    }

    // close queues validation

    #[test]
    fn test_close_market_queues() {
        let market = &mut test_market();
        market.market_status = ReadyToClose;
        market.unclosed_accounts_count = 4;

        let liquidities = mock_market_liquidities(Pubkey::default());
        let payment_queue = PaymentQueue::new(1);
        let matching_queue = MatchingQueue::new(1);
        let request_queue = OrderRequestQueue::new(1);

        let result = close_market_queues(
            market,
            &liquidities,
            &payment_queue,
            &matching_queue,
            &request_queue,
        );
        assert!(result.is_ok());
        assert_eq!(market.unclosed_accounts_count, 0);
    }

    #[test]
    fn test_close_market_queues_incorrect_status() {
        let market = &mut test_market();
        market.unclosed_accounts_count = 3;

        let liquidities = mock_market_liquidities(Pubkey::default());
        let payment_queue = PaymentQueue::new(1);
        let matching_queue = MatchingQueue::new(1);
        let request_queue = OrderRequestQueue::new(1);

        let result = close_market_queues(
            market,
            &liquidities,
            &payment_queue,
            &matching_queue,
            &request_queue,
        );
        assert!(result.is_err());
        assert_eq!(Err(error!(CoreError::MarketNotReadyToClose)), result);
    }

    #[test]
    fn test_close_market_queues_not_empty() {
        let market = &mut test_market();
        market.market_status = ReadyToClose;
        market.unclosed_accounts_count = 4;

        let liquidities = mock_market_liquidities(Pubkey::default());

        let payment_queue = &mut PaymentQueue::new(1);
        payment_queue.enqueue(PaymentInfo {
            to: Pubkey::new_unique(),
            from: Pubkey::new_unique(),
            amount: 0,
        });

        let matching_queue = &mut MatchingQueue::new(1);
        matching_queue.enqueue(OrderMatch::maker(false, 0, 0.0, 0));
        let request_queue = OrderRequestQueue::new(1);

        let result = close_market_queues(
            market,
            &liquidities,
            &payment_queue,
            &matching_queue,
            &request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            Err(error!(CoreError::CloseAccountMarketPaymentQueueNotEmpty)),
            result
        );

        payment_queue.dequeue();

        let result = close_market_queues(
            market,
            &liquidities,
            &payment_queue,
            &matching_queue,
            &request_queue,
        );
        assert!(result.is_err());
        assert_eq!(
            Err(error!(CoreError::CloseAccountMarketMatchingQueueNotEmpty)),
            result
        );

        matching_queue.dequeue();

        let result = close_market_queues(
            market,
            &liquidities,
            &payment_queue,
            &matching_queue,
            &request_queue,
        );
        assert!(result.is_ok());
        assert_eq!(market.unclosed_accounts_count, 0);
    }

    // close order validation

    #[test]
    fn test_close_order() {
        let market = &mut test_market();
        market.market_status = ReadyToClose;
        market.unclosed_accounts_count = 1;

        let order = &mut mock_order_default();
        order.order_status = OrderStatus::SettledWin;

        assert!(close_order(market, order).is_ok());
        assert_eq!(market.unclosed_accounts_count, 0);
    }

    #[test]
    fn test_close_order_not_completed() {
        let market = &mut test_market();
        market.market_status = ReadyToClose;
        market.unclosed_accounts_count = 1;

        let order = &mut mock_order_default();
        order.order_status = OrderStatus::Open;

        let result = close_order(market, order);
        assert!(result.is_err());
        assert_eq!(Err(error!(CoreError::CloseAccountOrderNotComplete)), result);
    }

    // close market_position validation

    #[test]
    fn test_close_market_position() {
        let market = &mut test_market();
        market.market_status = ReadyToClose;
        market.unclosed_accounts_count = 1;

        let market_position = &mut test_market_position();
        market_position.paid = true;

        assert!(close_market_position(market, market_position).is_ok());
        assert_eq!(market.unclosed_accounts_count, 0);
    }

    #[test]
    fn test_close_market_position_not_paid() {
        let market = &mut test_market();
        market.market_status = ReadyToClose;
        market.unclosed_accounts_count = 1;

        let market_position = &mut test_market_position();
        market_position.paid = false;

        let result = close_market_position(market, market_position);
        assert!(result.is_err());
        assert_eq!(
            Err(error!(CoreError::CloseAccountMarketPositionNotPaid)),
            result
        );
        assert_eq!(market.unclosed_accounts_count, 1);
    }

    // close market validation

    #[test]
    fn test_close_market() {
        assert!(close_market(&ReadyToClose, 0).is_ok());
    }

    #[test]
    fn test_close_market_incorrect_status() {
        let result = close_market(&Open, 0);
        assert!(result.is_err());
        assert_eq!(Err(error!(CoreError::MarketNotReadyToClose)), result);
    }

    #[test]
    fn test_close_market_unclosed_accounts() {
        let result = close_market(&ReadyToClose, 1);
        assert!(result.is_err());
        assert_eq!(
            Err(error!(CoreError::MarketUnclosedAccountsCountNonZero)),
            result
        );
    }

    fn test_market() -> Market {
        Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Initializing,
            inplay_enabled: false,
            inplay: false,
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
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            inplay_order_delay: 0,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            funding_account_bump: 0,
            event_start_timestamp: 0,
        }
    }

    fn test_market_position() -> MarketPosition {
        MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            unmatched_exposures: vec![],
            payer: Default::default(),
            matched_risk: 0,
            matched_risk_per_product: vec![],
        }
    }
}
