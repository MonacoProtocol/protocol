use crate::error::CoreError;
use crate::instructions::current_timestamp;
use crate::state::type_size::*;
use anchor_lang::prelude::*;
use solana_program::clock::UnixTimestamp;
use std::string::ToString;

#[account]
pub struct Market {
    // this section cannot be moved or on-chain search will stop working
    pub authority: Pubkey,
    pub event_account: Pubkey,
    pub mint_account: Pubkey,
    pub market_status: MarketStatus,
    pub inplay_enabled: bool,
    pub inplay: bool,
    pub market_type: Pubkey,
    // this section cannot be moved or on-chain search will stop working
    pub market_type_discriminator: Option<String>,
    pub market_type_value: Option<String>,
    pub version: u8,
    pub decimal_limit: u8,

    pub published: bool,
    pub suspended: bool,

    pub market_outcomes_count: u16,
    pub market_winning_outcome_index: Option<u16>,
    pub market_lock_timestamp: i64,
    pub market_settle_timestamp: Option<i64>,

    pub event_start_order_behaviour: MarketOrderBehaviour,
    pub market_lock_order_behaviour: MarketOrderBehaviour,

    pub inplay_order_delay: u8,

    pub title: String,

    pub unsettled_accounts_count: u32,
    pub unclosed_accounts_count: u32,

    pub escrow_account_bump: u8,
    pub funding_account_bump: u8,
    pub event_start_timestamp: i64,
}

impl Market {
    pub const TYPE_FIELD_MAX_LENGTH: usize = 16;
    pub const TITLE_MAX_LENGTH: usize = 100;

    pub const SIZE: usize = DISCRIMINATOR_SIZE
        + (PUB_KEY_SIZE * 3) // authority, event and mint
        + U8_SIZE // decimal_limit
        + ENUM_SIZE // market_status
        + BOOL_SIZE // inplay_enabled
        + BOOL_SIZE // inplay
        + PUB_KEY_SIZE // market_type
        + option_size(string_size(Market::TYPE_FIELD_MAX_LENGTH)) // market_type disc.
        + option_size(string_size(Market::TYPE_FIELD_MAX_LENGTH)) // market_type value
        + U8_SIZE // version
        + BOOL_SIZE * 2 // published + suspended
        + U16_SIZE // market_outcomes_count
        + option_size(U16_SIZE) // market_winning_outcome_index
        + I64_SIZE // market_lock_timestamp
        + option_size(I64_SIZE) // market_settle_timestamp
        + ENUM_SIZE * 2 // event_start and market_lock _order_behaviour
        + U8_SIZE // inplay_order_delay
        + vec_size(CHAR_SIZE, Market::TITLE_MAX_LENGTH) // title
        + U8_SIZE * 2// bumps
        + I64_SIZE // event_start_timestamp
        + U32_SIZE * 2; // unsettled_accounts + unclosed_accounts

    pub fn increment_market_outcomes_count(&mut self) -> Result<u16> {
        self.market_outcomes_count = self
            .market_outcomes_count
            .checked_add(1_u16)
            .ok_or(CoreError::ArithmeticError)?;
        Ok(self.market_outcomes_count)
    }

    pub fn increment_unsettled_accounts_count(&mut self) -> Result<()> {
        self.unsettled_accounts_count = self
            .unsettled_accounts_count
            .checked_add(1_u32)
            .ok_or(CoreError::ArithmeticError)?;
        Ok(())
    }

    pub fn decrement_unsettled_accounts_count(&mut self) -> Result<()> {
        self.unsettled_accounts_count = self
            .unsettled_accounts_count
            .checked_sub(1_u32)
            .ok_or(CoreError::ArithmeticError)?;
        Ok(())
    }

    pub fn increment_unclosed_accounts_count(&mut self) -> Result<()> {
        self.unclosed_accounts_count = self
            .unclosed_accounts_count
            .checked_add(1_u32)
            .ok_or(CoreError::ArithmeticError)?;
        Ok(())
    }

    pub fn decrement_unclosed_accounts_count(&mut self) -> Result<()> {
        self.unclosed_accounts_count = self
            .unclosed_accounts_count
            .checked_sub(1_u32)
            .ok_or(CoreError::ArithmeticError)?;
        Ok(())
    }

    pub fn increment_account_counts(&mut self) -> Result<()> {
        self.increment_unsettled_accounts_count()?;
        self.increment_unclosed_accounts_count()?;
        Ok(())
    }

    pub fn decrement_account_counts(&mut self) -> Result<()> {
        self.decrement_unsettled_accounts_count()?;
        self.decrement_unclosed_accounts_count()?;
        Ok(())
    }

    pub fn is_inplay(&self) -> bool {
        Market::market_is_inplay(self, current_timestamp())
    }

    pub fn market_is_inplay(market: &Market, now: UnixTimestamp) -> bool {
        market.inplay || (market.inplay_enabled && market.event_start_timestamp <= now)
    }

    pub fn move_to_inplay(&mut self) {
        self.inplay = true;
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, PartialEq, Eq)]
pub enum MarketStatus {
    Initializing,
    Open,
    Locked,
    ReadyForSettlement,
    Settled,
    ReadyToClose,
    ReadyToVoid,
    Voided,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, PartialEq, Eq)]
pub enum MarketOrderBehaviour {
    None,
    CancelUnmatched,
}

#[cfg(test)]
mod tests {
    use crate::state::market_account::{mock_market, Market, MarketOrderBehaviour, MarketStatus};
    use anchor_lang::prelude::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    // Market account tests

    #[test]
    fn test_is_inplay_inplay_true() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let market: Market = Market {
            authority: Pubkey::default(),
            event_account: Pubkey::default(),
            mint_account: Pubkey::default(),
            market_status: MarketStatus::Initializing,
            inplay_enabled: true,
            inplay: true,
            market_type: Pubkey::default(),
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
            event_start_timestamp: now + 1000,
        };

        assert!(Market::market_is_inplay(&market, now));
    }

    #[test]
    fn test_is_inplay_inplay_false_event_not_started() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let market: Market = Market {
            authority: Pubkey::default(),
            event_account: Pubkey::default(),
            mint_account: Pubkey::default(),
            market_status: MarketStatus::Initializing,
            inplay_enabled: true,
            inplay: false,
            market_type: Pubkey::default(),
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
            event_start_timestamp: now + 1000,
        };

        assert!(!Market::market_is_inplay(&market, now));
    }

    #[test]
    fn test_is_inplay_inplay_false_event_started() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let market: Market = Market {
            authority: Pubkey::default(),
            event_account: Pubkey::default(),
            mint_account: Pubkey::default(),
            market_status: MarketStatus::Initializing,
            inplay_enabled: true,
            inplay: false,
            market_type: Pubkey::default(),
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
            event_start_timestamp: now,
        };

        assert!(Market::market_is_inplay(&market, now));
    }

    #[test]
    fn test_is_inplay_inplay_false_event_started_not_inplay_market() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let market: Market = Market {
            authority: Pubkey::default(),
            event_account: Pubkey::default(),
            mint_account: Pubkey::default(),
            market_status: MarketStatus::Initializing,
            inplay_enabled: false,
            inplay: false,
            market_type: Pubkey::default(),
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
            event_start_timestamp: now,
        };

        assert!(!Market::market_is_inplay(&market, now))
    }

    // test account count fields

    #[test]
    fn test_increment_unsettled_accounts_count() {
        let mut market = mock_market(MarketStatus::Initializing);

        let result = market.increment_unsettled_accounts_count();
        assert!(result.is_ok());
        assert_eq!(1, market.unsettled_accounts_count);

        let result = market.increment_unsettled_accounts_count();
        assert!(result.is_ok());
        assert_eq!(2, market.unsettled_accounts_count);
    }

    #[test]
    fn test_decrement_unsettled_accounts_count() {
        let mut market = mock_market(MarketStatus::Initializing);

        let result = market.increment_unsettled_accounts_count();
        assert!(result.is_ok());
        assert_eq!(1, market.unsettled_accounts_count);

        let result = market.decrement_unsettled_accounts_count();
        assert!(result.is_ok());
        assert_eq!(0, market.unsettled_accounts_count);
    }

    #[test]
    fn test_increment_unclosed_accounts_count() {
        let mut market = mock_market(MarketStatus::Initializing);

        let result = market.increment_unclosed_accounts_count();
        assert!(result.is_ok());
        assert_eq!(1, market.unclosed_accounts_count);

        let result = market.increment_unclosed_accounts_count();
        assert!(result.is_ok());
        assert_eq!(2, market.unclosed_accounts_count);
    }

    #[test]
    fn test_decrement_unclosed_accounts_count() {
        let mut market = mock_market(MarketStatus::Initializing);

        let result = market.increment_unclosed_accounts_count();
        assert!(result.is_ok());
        assert_eq!(1, market.unclosed_accounts_count);

        let result = market.decrement_unclosed_accounts_count();
        assert!(result.is_ok());
        assert_eq!(0, market.unclosed_accounts_count);
    }
}

#[cfg(test)]
pub fn mock_market(market_status: MarketStatus) -> Market {
    Market {
        market_status,
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
        unsettled_accounts_count: 0,
        unclosed_accounts_count: 0,
        escrow_account_bump: 0,
        funding_account_bump: 0,
        event_start_timestamp: 0,
    }
}
