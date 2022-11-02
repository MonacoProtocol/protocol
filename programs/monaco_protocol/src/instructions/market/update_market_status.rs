use crate::context::UpdateMarket;
use crate::CompleteMarketSettlement;
use anchor_lang::prelude::*;
use solana_program::clock::UnixTimestamp;

use crate::error::CoreError;
use crate::state::market_account::MarketStatus::*;
use crate::state::market_account::{Market, MarketStatus};

pub fn open(market: &mut Market) -> Result<()> {
    require!(
        Initializing.eq(&market.market_status),
        CoreError::OpenMarketNotInitializing
    );
    market.market_status = MarketStatus::Open;
    Ok(())
}

pub fn settle(
    market: &mut Market,
    winning_outcome_index: u16,
    settle_time: UnixTimestamp,
) -> Result<()> {
    require!(
        Open.eq(&market.market_status),
        CoreError::SettlementMarketNotOpen
    );
    require!(
        winning_outcome_index < market.market_outcomes_count,
        CoreError::SettlementInvalidMarketOutcomeIndex
    );

    market.market_winning_outcome_index = Some(winning_outcome_index);
    market.market_settle_timestamp = Option::from(settle_time);
    market.market_status = ReadyForSettlement;
    Ok(())
}

pub fn complete_settlement(ctx: Context<CompleteMarketSettlement>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(
        ReadyForSettlement.eq(&market.market_status),
        CoreError::SettlementMarketNotReadyForSettlement
    );
    market.market_status = Settled;
    Ok(())
}

pub fn publish(ctx: Context<UpdateMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.published = true;
    Ok(())
}

pub fn unpublish(ctx: Context<UpdateMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.published = false;
    Ok(())
}

pub fn suspend(ctx: Context<UpdateMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.suspended = true;
    Ok(())
}

pub fn unsuspend(ctx: Context<UpdateMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.suspended = false;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::error::CoreError;
    use crate::instructions::market::{open, settle};
    use crate::state::market_account::MarketStatus;
    use crate::Market;
    use anchor_lang::error;

    #[test]
    fn settle_market_ok_result() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Open,
            market_type: "".to_string(),
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 3,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            escrow_account_bump: 0,
        };

        let settle_time = 1665483869;

        let result = settle(&mut market, 0, settle_time);

        assert!(result.is_ok());
        assert_eq!(market.market_status, MarketStatus::ReadyForSettlement)
    }

    #[test]
    fn settle_market_not_open() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Complete,
            market_type: "".to_string(),
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 3,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            escrow_account_bump: 0,
        };

        let settle_time = 1665483869;

        let result = settle(&mut market, 0, settle_time);

        assert!(result.is_err());
        assert_eq!(Err(error!(CoreError::SettlementMarketNotOpen)), result);
    }

    #[test]
    fn settle_market_invalid_outcome_index() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Open,
            market_type: "".to_string(),
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 3,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            escrow_account_bump: 0,
        };

        let settle_time = 1665483869;

        let result = settle(&mut market, 4, settle_time);

        assert!(result.is_err());
        assert_eq!(
            Err(error!(CoreError::SettlementInvalidMarketOutcomeIndex)),
            result
        );
    }

    #[test]
    fn open_market_ok_result() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Initializing,
            market_type: "".to_string(),
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 0,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            escrow_account_bump: 0,
        };

        let result = open(&mut market);

        assert!(result.is_ok());
        assert_eq!(MarketStatus::Open, market.market_status)
    }

    #[test]
    fn open_market_not_intializing() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Open,
            market_type: "".to_string(),
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 0,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            escrow_account_bump: 0,
        };

        let result = open(&mut market);

        assert!(result.is_err());
        let expected_error = Err(error!(CoreError::OpenMarketNotInitializing));
        assert_eq!(expected_error, result)
    }
}
