use crate::error::CoreError;
use anchor_lang::prelude::*;
use solana_program::pubkey::Pubkey;

pub fn verify_market_authority(operator: &Pubkey, market_authority: &Pubkey) -> Result<()> {
    require!(
        market_authority.eq(operator),
        CoreError::MarketAuthorityMismatch
    );
    Ok(())
}
