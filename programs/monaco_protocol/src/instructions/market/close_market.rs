use anchor_lang::prelude::*;
use solana_program::pubkey::Pubkey;

use crate::state::market_account::MarketStatus;
use crate::{CoreError, Market};

pub fn validate_close_market(market_operator: &Pubkey, market: &Market) -> Result<()> {
    require!(
        market_operator.key().eq(&market.authority),
        CoreError::UnauthorisedOperator
    );
    require!(
        [MarketStatus::Settled, MarketStatus::Complete].contains(&market.market_status),
        CoreError::MarketInvalidStatus
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::borrow::Borrow;

    #[test]
    fn test_validate_close_market_success() {
        let operator: Pubkey = Pubkey::new_unique();
        let mut market: Market = mock_market();
        market.authority = operator;

        market.market_status = MarketStatus::Settled;
        assert!(validate_close_market(&operator, market.borrow()).is_ok());

        market.market_status = MarketStatus::Complete;
        assert!(validate_close_market(&operator, market.borrow()).is_ok());
    }

    #[test]
    fn test_validate_close_market_status_fail() {
        let operator: Pubkey = Pubkey::new_unique();
        let mut market: Market = mock_market();
        market.authority = operator;

        market.market_status = MarketStatus::Open;
        assert!(validate_close_market(&operator, market.borrow()).is_err());
        market.market_status = MarketStatus::Locked;
        assert!(validate_close_market(&operator, market.borrow()).is_err());
        market.market_status = MarketStatus::ReadyForSettlement;
        assert!(validate_close_market(&operator, market.borrow()).is_err());
    }

    #[test]
    fn test_validate_close_market_authority_fail() {
        let operator: Pubkey = Pubkey::new_unique();
        let mut market: Market = mock_market();
        market.authority = Pubkey::new_unique();

        market.market_status = MarketStatus::Complete;
        assert!(validate_close_market(&operator, market.borrow()).is_err());
    }

    fn mock_market() -> Market {
        Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 0_u16,
            market_winning_outcome_index: Some(1),
            market_type: "".to_string(),
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            market_status: MarketStatus::ReadyForSettlement,
            escrow_account_bump: 0,
            published: false,
            suspended: false,
        }
    }
}
