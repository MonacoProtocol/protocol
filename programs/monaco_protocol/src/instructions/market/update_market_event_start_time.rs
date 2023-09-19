use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::instructions::current_timestamp;
use crate::state::market_account::Market;

pub fn update_market_event_start_time(market: &mut Market, event_start_time: i64) -> Result<()> {
    let now = current_timestamp();
    update_market_event_start_time_internal(market, event_start_time, now)
}

pub fn update_market_event_start_time_to_now(market: &mut Market) -> Result<()> {
    let now = current_timestamp();
    update_market_event_start_time_internal(market, now, now)
}

fn update_market_event_start_time_internal(
    market: &mut Market,
    event_start_time: i64,
    now: i64,
) -> Result<()> {
    // market event start time cannot be change after market moves to inplay
    require!(!market.is_inplay(), CoreError::MarketAlreadyInplay);

    if event_start_time < now {
        msg!(
            "Update Market: event start time {} must not be in the past.",
            event_start_time.to_string()
        );
        return Err(error!(CoreError::MarketEventStartTimeNotInTheFuture));
    }

    market.event_start_timestamp = event_start_time;

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::instructions::market::update_market_event_start_time::update_market_event_start_time_internal;
    use crate::state::market_account::{Market, MarketOrderBehaviour, MarketStatus};

    #[test]
    fn test_market_update_success() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(1),
            market_type: Default::default(),
            market_type_discriminator: "".to_string(),
            market_type_value: "".to_string(),
            version: 0,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            market_status: MarketStatus::ReadyForSettlement,
            escrow_account_bump: 0,
            published: false,
            suspended: false,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            unclosed_accounts_count: 0,
        };
        let time_in_future = 100;
        let now = 99;

        let result = update_market_event_start_time_internal(&mut market, time_in_future, now);
        assert!(result.is_ok());
    }

    #[test]
    fn test_market_update_failure_time_before_now() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(1),
            market_type: Default::default(),
            market_type_discriminator: "".to_string(),
            market_type_value: "".to_string(),
            version: 0,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            market_status: MarketStatus::ReadyForSettlement,
            escrow_account_bump: 0,
            published: false,
            suspended: false,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            unclosed_accounts_count: 0,
        };
        let time_in_future = 100;
        let now = 101;

        let result = update_market_event_start_time_internal(&mut market, time_in_future, now);
        assert!(result.is_err());
    }

    #[test]
    fn test_market_update_failure_inplay() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(1),
            market_type: Default::default(),
            market_type_discriminator: "".to_string(),
            market_type_value: "".to_string(),
            version: 0,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            market_status: MarketStatus::ReadyForSettlement,
            escrow_account_bump: 0,
            published: false,
            suspended: false,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: true,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            unclosed_accounts_count: 0,
        };
        let time_in_future = 100;
        let now = 99;

        let result = update_market_event_start_time_internal(&mut market, time_in_future, now);
        assert!(result.is_err());
    }
}
