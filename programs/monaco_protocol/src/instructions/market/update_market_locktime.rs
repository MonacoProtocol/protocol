use anchor_lang::prelude::*;
use solana_program::msg;

use crate::context::UpdateMarket;
use crate::error::CoreError;
use crate::instructions::current_timestamp;
use crate::state::market_account::Market;

pub fn update_locktime(ctx: Context<UpdateMarket>, lock_time: i64) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(
        market.inplay_enabled || lock_time <= market.event_start_timestamp,
        CoreError::MarketLockTimeAfterEventStartTime
    );

    let now = current_timestamp();
    update_market_locktime(market, lock_time, now)
}

fn update_market_locktime(market: &mut Market, lock_time: i64, now: i64) -> Result<()> {
    if lock_time < now {
        msg!(
            "Update Market: lock time {} must not be in the past.",
            lock_time.to_string()
        );
        return Err(error!(CoreError::LockTimeInvalid));
    }

    if market.market_lock_timestamp != lock_time {
        market.market_lock_timestamp = lock_time;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::instructions::market::update_market_locktime::update_market_locktime;
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
            market_type_discriminator: None,
            market_type_value: None,
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
        let now = 1575975177;
        let time_in_future = 43041841910;

        let result = update_market_locktime(&mut market, time_in_future, now);
        assert!(result.is_ok());
    }

    #[test]
    fn test_market_update_failed_invalid_locktime() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(1),
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
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
        let now = 1575975177;
        let time_in_past = 1418209910;

        let result = update_market_locktime(&mut market, time_in_past, now);
        assert!(result.is_err());
    }
}
