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
    // this section cannot be moved or on-chain search will stop working
    pub market_type: String,
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
    pub event_start_timestamp: i64,
}

impl Market {
    pub const TYPE_MAX_LENGTH: usize = 50;
    pub const TITLE_MAX_LENGTH: usize = 100;

    pub const SIZE: usize = DISCRIMINATOR_SIZE
        + (PUB_KEY_SIZE * 3) // authority, event and mint
        + U8_SIZE // decimal_limit
        + ENUM_SIZE // market_status
        + BOOL_SIZE // inplay_enabled
        + BOOL_SIZE // inplay
        + vec_size (CHAR_SIZE, Market::TYPE_MAX_LENGTH) // market_type
        + BOOL_SIZE * 2 // published + suspended
        + U16_SIZE // market_outcomes_count
        + option_size(U16_SIZE) // market_winning_outcome_index
        + I64_SIZE // market_lock_timestamp
        + option_size(I64_SIZE) // market_settle_timestamp
        + ENUM_SIZE * 2 // event_start and market_lock _order_behaviour
        + U8_SIZE // inplay_order_delay
        + vec_size(CHAR_SIZE, Market::TITLE_MAX_LENGTH) // title
        + U8_SIZE // bump
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
