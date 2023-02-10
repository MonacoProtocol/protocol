use crate::instructions::{calculate_commission, transfer};
use crate::SettleMarketPosition;
use anchor_lang::prelude::*;
use solana_program::log;
use std::convert::TryFrom;

use crate::error::CoreError;

pub fn settle_market_position(ctx: Context<SettleMarketPosition>) -> Result<()> {
    let market_position = &mut ctx.accounts.market_position;
    if market_position.paid {
        log::sol_log("market position has already been paid out");
        return Ok(());
    }

    let market_account = &ctx.accounts.market;
    // validate the market is settled
    require!(
        market_account.market_winning_outcome_index.is_some(),
        CoreError::SettlementMarketNotSettled
    );

    let position_profit = market_position.market_outcome_sums
        [market_account.market_winning_outcome_index.unwrap() as usize];
    let max_exposure = market_position.max_exposure();

    let protocol_commission = calculate_commission(
        ctx.accounts.protocol_config.commission_rate,
        position_profit,
    );

    let total_payout = position_profit
        // protocol_commission > 0 only if position_profit > 0
        .checked_sub(i128::from(protocol_commission))
        .ok_or(CoreError::SettlementPaymentCalculation)?
        .checked_add(i128::from(max_exposure))
        .ok_or(CoreError::SettlementPaymentCalculation)?;
    let total_payout_u64 =
        u64::try_from(total_payout).map_err(|_| CoreError::SettlementPaymentCalculation)?;

    market_position.paid = true;

    transfer::transfer_protocol_commission(&ctx, protocol_commission)?;
    transfer::transfer_market_position(&ctx, total_payout_u64)?;

    Ok(())
}
