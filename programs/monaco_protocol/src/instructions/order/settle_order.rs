use crate::context::SettleOrder;
use crate::error::CoreError;
use crate::state::market_account::MarketStatus::ReadyForSettlement;
use crate::state::order_account::OrderStatus::{Cancelled, Open, SettledLose, SettledWin};
use crate::{Market, Order};
use anchor_lang::prelude::*;
use solana_program::log;

pub fn settle_order(ctx: Context<SettleOrder>) -> Result<()> {
    let market_account = &mut ctx.accounts.market;

    // validate the market is ready for settlement
    require!(
        ReadyForSettlement.eq(&market_account.market_status),
        CoreError::SettlementMarketNotReadyForSettlement
    );

    // exit early if order already settled
    if Cancelled.eq(&ctx.accounts.order.order_status) {
        log::sol_log("order already cancelled");
        return Ok(());
    }
    if SettledLose.eq(&ctx.accounts.order.order_status) {
        log::sol_log("order already settled as loss");
        return Ok(());
    }
    if SettledWin.eq(&ctx.accounts.order.order_status) {
        log::sol_log("order already settled as win");
        return Ok(());
    }

    // if never matched close
    if Open.eq(&ctx.accounts.order.order_status) {
        market_account.decrement_account_counts()?;
        return ctx
            .accounts
            .order
            .close(ctx.accounts.payer.to_account_info());
    }

    if ctx.accounts.order.stake_unmatched > 0_u64 {
        ctx.accounts.order.void_stake_unmatched();
    }
    match is_winning_order(&ctx.accounts.order, market_account) {
        true => ctx.accounts.order.order_status = SettledWin,
        false => ctx.accounts.order.order_status = SettledLose,
    };

    market_account.decrement_unsettled_accounts_count()?;

    Ok(())
}

fn is_winning_order(order: &Order, market: &Market) -> bool {
    match order.for_outcome {
        true => order.market_outcome_index == market.market_winning_outcome_index.unwrap(),
        false => order.market_outcome_index != market.market_winning_outcome_index.unwrap(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::market_account::{MarketOrderBehaviour, MarketStatus};
    use crate::state::order_account::mock_order;
    use anchor_lang::prelude::Pubkey;
    use solana_program::clock::UnixTimestamp;

    /*
       Test - fn is_winning_order(order: &Order, market: &Market) -> bool
    */

    #[test]
    fn test_settle_order_win_for_order() {
        // when
        let mut order = mock_order(
            Pubkey::new_unique(),
            1,
            true,
            2.10,
            100_000_000,
            Pubkey::new_unique(),
        );
        order
            .match_stake_unmatched(100_000_000, 2.10)
            .expect("test setup");
        let market = Market {
            authority: Pubkey::new_unique(),
            event_account: Pubkey::new_unique(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(1),
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            market_lock_timestamp: UnixTimestamp::default(),
            market_settle_timestamp: None,
            title: String::from("META"),
            unsettled_accounts_count: 0,
            market_status: MarketStatus::ReadyForSettlement,
            escrow_account_bump: 0,
            published: true,
            suspended: false,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            unclosed_accounts_count: 0,
            funding_account_bump: 0,
        };

        // then
        assert_eq!(is_winning_order(&mut order, &market), true)
    }

    #[test]
    fn test_settle_order_lose_for_order() {
        // when
        let mut order = mock_order(
            Pubkey::new_unique(),
            1,
            true,
            2.10,
            100_000_000,
            Pubkey::new_unique(),
        );
        order
            .match_stake_unmatched(100_000_000, 2.10)
            .expect("test setup");
        let market = Market {
            authority: Pubkey::new_unique(),
            event_account: Pubkey::new_unique(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(2),
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            market_lock_timestamp: UnixTimestamp::default(),
            market_settle_timestamp: None,
            title: String::from("META"),
            unsettled_accounts_count: 0,
            market_status: MarketStatus::ReadyForSettlement,
            escrow_account_bump: 0,
            published: true,
            suspended: false,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            unclosed_accounts_count: 0,
            funding_account_bump: 0,
        };

        // then
        assert_eq!(is_winning_order(&mut order, &market), false)
    }

    #[test]
    fn test_settle_order_win_against_order() {
        // when
        let mut order = mock_order(
            Pubkey::new_unique(),
            1,
            false,
            2.10,
            100000000,
            Pubkey::new_unique(),
        );
        order
            .match_stake_unmatched(100_000_000, 2.10)
            .expect("test setup");
        let market = Market {
            authority: Pubkey::new_unique(),
            event_account: Pubkey::new_unique(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(0),
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            market_lock_timestamp: UnixTimestamp::default(),
            market_settle_timestamp: None,
            title: String::from("META"),
            unsettled_accounts_count: 0,
            market_status: MarketStatus::ReadyForSettlement,
            escrow_account_bump: 0,
            published: true,
            suspended: false,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            unclosed_accounts_count: 0,
            funding_account_bump: 0,
        };

        // then
        assert_eq!(is_winning_order(&mut order, &market), true)
    }

    #[test]
    fn test_settle_order_lose_against_order() {
        // when
        let mut order = mock_order(
            Pubkey::new_unique(),
            1,
            false,
            2.10,
            100000000,
            Pubkey::new_unique(),
        );
        order
            .match_stake_unmatched(100_000_000, 2.10)
            .expect("test setup");
        let market = Market {
            authority: Pubkey::new_unique(),
            event_account: Pubkey::new_unique(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(1),
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            market_lock_timestamp: UnixTimestamp::default(),
            market_settle_timestamp: None,
            title: String::from("META"),
            unsettled_accounts_count: 0,
            market_status: MarketStatus::ReadyForSettlement,
            escrow_account_bump: 0,
            published: true,
            suspended: false,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            unclosed_accounts_count: 0,
            funding_account_bump: 0,
        };

        // then
        assert_eq!(is_winning_order(&mut order, &market), false)
    }
}
