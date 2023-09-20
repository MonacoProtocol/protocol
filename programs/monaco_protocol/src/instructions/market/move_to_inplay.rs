use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::instructions::current_timestamp;
use crate::state::market_account::Market;
use crate::state::market_account::MarketStatus::Open;

pub fn move_market_to_inplay(market: &mut Market) -> Result<()> {
    let now = current_timestamp();

    require!(
        Open.eq(&market.market_status),
        CoreError::MarketNotOpenForInplay
    );

    // market must have inplay enabled
    require!(market.inplay_enabled, CoreError::MarketInplayNotEnabled);

    // set it `true` only if it's `false`
    require!(!market.inplay, CoreError::MarketAlreadyInplay);

    // set it `true` only if now is after event start
    require!(
        market.event_start_timestamp <= now,
        CoreError::MarketEventNotStarted,
    );

    market.inplay = true;

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::instructions::current_timestamp;
    use crate::instructions::market::move_market_to_inplay;
    use crate::state::market_account::{Market, MarketOrderBehaviour, MarketStatus};

    fn market_setup() -> Market {
        let market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(1),
            market_type: Default::default(),
            market_type_discriminator: "".to_string(),
            market_type_value: "".to_string(),
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            market_status: MarketStatus::Open,
            escrow_account_bump: 0,
            published: false,
            suspended: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            market_lock_timestamp: current_timestamp() + 1000000001,
            event_start_timestamp: current_timestamp() - 1000000000,
            inplay_enabled: true,
            inplay: false,
            version: 0,
            unclosed_accounts_count: 0,
        };
        return market;
    }

    #[test]
    fn test_market_move_to_inplay_success() {
        let mut market: Market = market_setup();
        let result = move_market_to_inplay(&mut market);
        assert!(result.is_ok());
    }

    #[test]
    fn test_market_move_to_inplay_failure_not_inplay() {
        let mut market: Market = market_setup();
        market.inplay_enabled = false;
        let result = move_market_to_inplay(&mut market);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("market inplay not enabled"));
    }

    #[test]
    fn test_market_move_to_inplay_not_started() {
        let mut market: Market = market_setup();
        market.event_start_timestamp = current_timestamp() + 1000000000;
        let result = move_market_to_inplay(&mut market);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("market event not started"));
    }

    #[test]
    fn test_market_move_to_inplay_failure_already_inplay() {
        let mut market: Market = market_setup();
        market.inplay = true;
        let result = move_market_to_inplay(&mut market);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("market is already inplay"));
    }

    #[test]
    fn test_market_move_to_inplay_failure_market_not_open_initializing() {
        let mut market: Market = market_setup();
        market.market_status = MarketStatus::Initializing;
        let result = move_market_to_inplay(&mut market);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("market not open to allow transition to inplay"));
    }

    #[test]
    fn test_market_move_to_inplay_failure_market_not_open_settled() {
        let mut market: Market = market_setup();
        market.market_status = MarketStatus::Settled;
        let result = move_market_to_inplay(&mut market);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("market not open to allow transition to inplay"));
    }
}
