use crate::instructions::transfer;
use crate::VoidMarketPosition;
use anchor_lang::prelude::*;
use solana_program::log;

use crate::error::CoreError;
use crate::state::market_account::MarketStatus;

pub fn void_market_position(ctx: Context<VoidMarketPosition>) -> Result<()> {
    let market_position = &mut ctx.accounts.market_position;
    if market_position.paid {
        log::sol_log("market position has already been paid out");
        return Ok(());
    }

    let market_account = &mut ctx.accounts.market;
    // validate the market is ready to void
    require!(
        market_account.market_status.eq(&MarketStatus::ReadyToVoid),
        CoreError::VoidMarketNotReadyForVoid
    );

    let total_exposure = market_position.total_exposure();

    market_position.paid = true;
    market_account.decrement_unsettled_accounts_count()?;

    transfer::transfer_market_position_void(&ctx, total_exposure)
}
