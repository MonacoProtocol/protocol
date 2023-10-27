use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::state::market_account::MarketStatus::ReadyToClose;
use crate::state::market_account::{Market, MarketStatus};
use crate::state::order_account::Order;

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

pub fn close_market(
    market_status: &MarketStatus,
    payment_queue_len: u32,
    unclosed_accounts_count: u32,
) -> Result<()> {
    require!(
        ReadyToClose.eq(market_status),
        CoreError::MarketNotReadyToClose
    );
    require!(
        payment_queue_len == 0,
        CoreError::CloseAccountMarketPaymentQueueNotEmpty
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
    use crate::state::order_account::OrderStatus;

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

    // close order validation

    #[test]
    fn test_close_order() {
        let market = &mut test_market();
        market.market_status = ReadyToClose;
        market.unclosed_accounts_count = 1;

        let order = &mut test_order();
        order.order_status = OrderStatus::SettledWin;

        assert!(close_order(market, order).is_ok());
        assert_eq!(market.unclosed_accounts_count, 0);
    }

    #[test]
    fn test_close_order_not_completed() {
        let market = &mut test_market();
        market.market_status = ReadyToClose;
        market.unclosed_accounts_count = 1;

        let order = &mut test_order();
        order.order_status = OrderStatus::Open;

        let result = close_order(market, order);
        assert!(result.is_err());
        assert_eq!(Err(error!(CoreError::CloseAccountOrderNotComplete)), result);
    }

    // close market validation

    #[test]
    fn test_close_market() {
        assert!(close_market(&ReadyToClose, 0, 0).is_ok());
    }

    #[test]
    fn test_close_market_incorrect_status() {
        let result = close_market(&Open, 0, 0);
        assert!(result.is_err());
        assert_eq!(Err(error!(CoreError::MarketNotReadyToClose)), result);
    }

    #[test]
    fn test_close_market_payment_queue_not_empty() {
        let result = close_market(&ReadyToClose, 1, 0);
        assert!(result.is_err());
        assert_eq!(
            Err(error!(CoreError::CloseAccountMarketPaymentQueueNotEmpty)),
            result
        );
    }

    #[test]
    fn test_close_market_unclosed_accounts() {
        let result = close_market(&ReadyToClose, 0, 1);
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
            event_start_timestamp: 0,
        }
    }

    fn test_order() -> Order {
        Order {
            purchaser: Default::default(),
            market: Default::default(),
            market_outcome_index: 0,
            for_outcome: false,
            order_status: OrderStatus::Open,
            product: None,
            stake: 0,
            voided_stake: 0,
            expected_price: 0.0,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 0,
            payout: 0,
            payer: Default::default(),
            product_commission_rate: 0.0,
        }
    }
}
