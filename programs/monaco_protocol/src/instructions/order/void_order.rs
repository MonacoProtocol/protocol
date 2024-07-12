use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::state::market_account::{Market, MarketStatus};
use crate::state::order_account::*;

pub fn void_order(order: &mut Order, market: &mut Market) -> Result<()> {
    require!(
        market.market_status.eq(&MarketStatus::ReadyToVoid),
        CoreError::VoidMarketNotReadyForVoid
    );
    require!(
        !order.order_status.eq(&OrderStatus::Voided),
        CoreError::VoidOrderIsVoided
    );

    if !OrderStatus::Cancelled.eq(&order.order_status) {
        order.voided_stake = order.stake;
        order.stake_unmatched = 0_u64;
        market.decrement_unsettled_accounts_count()?;
    }

    order.order_status = OrderStatus::Voided;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::market_account::MarketOrderBehaviour;

    #[test]
    fn test_void_open_order() {
        let mut order = mock_order_default();
        let mut market = mock_market();

        let result = void_order(&mut order, &mut market);
        assert!(result.is_ok());
        assert_eq!(order.order_status, OrderStatus::Voided);
        assert_eq!(order.voided_stake, order.stake);
        assert_eq!(order.stake_unmatched, 0);
        assert_eq!(market.unsettled_accounts_count, 0);
    }

    #[test]
    fn test_void_matched_order() {
        let mut order = mock_order_default();
        order.order_status = OrderStatus::Matched;
        order.stake_unmatched = 5;
        let mut market = mock_market();

        let result = void_order(&mut order, &mut market);
        assert!(result.is_ok());
        assert_eq!(order.order_status, OrderStatus::Voided);
        assert_eq!(order.voided_stake, order.stake);
        assert_eq!(order.stake_unmatched, 0);
        assert_eq!(market.unsettled_accounts_count, 0);
    }

    #[test]
    fn test_void_cancelled_order() {
        let mut order = mock_order_default();
        order.order_status = OrderStatus::Cancelled;
        order.voided_stake = order.stake;
        order.stake_unmatched = 0;
        let mut market = mock_market();
        market.unsettled_accounts_count = 0;

        let result = void_order(&mut order, &mut market);
        assert!(result.is_ok());
        assert_eq!(order.order_status, OrderStatus::Voided);
        assert_eq!(order.voided_stake, order.stake);
        assert_eq!(order.stake_unmatched, 0);
        assert_eq!(market.unsettled_accounts_count, 0);
    }

    #[test]
    fn test_void_voided_order() {
        let mut order = mock_order_default();
        order.order_status = OrderStatus::Voided;
        order.voided_stake = order.stake;
        let mut market = mock_market();
        market.unsettled_accounts_count = 0;

        let result = void_order(&mut order, &mut market);
        assert!(result.is_err());
        assert_eq!(result.err().unwrap(), error!(CoreError::VoidOrderIsVoided));
    }

    #[test]
    fn test_void_market_already_voided() {
        let mut order = mock_order_default();
        order.order_status = OrderStatus::Voided;
        let mut market = mock_market();
        market.market_status = MarketStatus::Voided;

        let result = void_order(&mut order, &mut market);
        assert!(result.is_err());
        assert_eq!(
            result.err().unwrap(),
            error!(CoreError::VoidMarketNotReadyForVoid)
        );
    }

    #[test]
    fn test_void_market_already_settled() {
        let mut order = mock_order_default();
        order.order_status = OrderStatus::SettledWin;
        let mut market = mock_market();
        market.market_status = MarketStatus::Settled;

        let result = void_order(&mut order, &mut market);
        assert!(result.is_err());
        assert_eq!(
            result.err().unwrap(),
            error!(CoreError::VoidMarketNotReadyForVoid)
        );
    }

    fn mock_market() -> Market {
        Market {
            unsettled_accounts_count: 1,
            market_status: MarketStatus::ReadyToVoid,

            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
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
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            funding_account_bump: 0,
            event_start_timestamp: 0,
        }
    }
}
