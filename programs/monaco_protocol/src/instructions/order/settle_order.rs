use anchor_lang::prelude::*;
use solana_program::log;

use crate::context::SettleOrder;
use crate::error::CoreError;
use crate::instructions::account;
use crate::state::order_account::OrderStatus::{Open, SettledLose, SettledWin};
use crate::{Market, Order};

pub fn settle_order(ctx: Context<SettleOrder>) -> Result<()> {
    let market_account = &ctx.accounts.market;

    // validate the market is settled
    require!(
        market_account.market_winning_outcome_index.is_some(),
        CoreError::SettlementMarketNotSettled
    );

    // exit early if already settled
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
        account::close_account(
            &mut ctx.accounts.order.to_account_info(),
            &mut ctx.accounts.purchaser.to_account_info(),
        )?;
        return Ok(());
    }

    ctx.accounts.order.void_stake_unmatched();
    match is_winning_order(&ctx.accounts.order, market_account) {
        true => ctx.accounts.order.order_status = SettledWin,
        false => ctx.accounts.order.order_status = SettledLose,
    };

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
    use crate::state::market_type::EVENT_RESULT_WINNER;
    use crate::state::order_account::OrderStatus;

    use anchor_lang::prelude::Pubkey;
    use solana_program::clock::UnixTimestamp;

    /*
       Test - fn is_winning_order(order: &Order, market: &Market) -> bool
    */

    #[test]
    fn test_settle_order_win_for_order() {
        // when
        let mut order = Order {
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
            for_outcome: true,
            purchaser: Pubkey::new_unique(),
            payer: Pubkey::new_unique(),

            stake: 100000000,
            expected_price: 2.10,
            order_status: OrderStatus::Matched,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 100000000,
            payout: 210000000,
            voided_stake: 0,
            product: None,
            product_commission_rate: 0.0,
        };
        let market = Market {
            authority: Pubkey::new_unique(),
            event_account: Pubkey::new_unique(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(1),
            market_type: String::from(EVENT_RESULT_WINNER),
            market_lock_timestamp: UnixTimestamp::default(),
            market_settle_timestamp: None,
            title: String::from("META"),
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
        };

        // then
        assert_eq!(is_winning_order(&mut order, &market), true)
    }

    #[test]
    fn test_settle_order_lose_for_order() {
        // when
        let mut order = Order {
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
            for_outcome: true,
            purchaser: Pubkey::new_unique(),
            payer: Pubkey::new_unique(),

            stake: 100000000,
            expected_price: 2.10,
            order_status: OrderStatus::Matched,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 100000000,
            payout: 210000000,
            voided_stake: 0,
            product: None,
            product_commission_rate: 0.0,
        };
        let market = Market {
            authority: Pubkey::new_unique(),
            event_account: Pubkey::new_unique(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(2),
            market_type: String::from(EVENT_RESULT_WINNER),
            market_lock_timestamp: UnixTimestamp::default(),
            market_settle_timestamp: None,
            title: String::from("META"),
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
        };

        // then
        assert_eq!(is_winning_order(&mut order, &market), false)
    }

    #[test]
    fn test_settle_order_win_against_order() {
        // when
        let mut order = Order {
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
            for_outcome: false,
            purchaser: Pubkey::new_unique(),
            payer: Pubkey::new_unique(),

            stake: 100000000,
            expected_price: 2.10,
            order_status: OrderStatus::Matched,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 100000000,
            payout: 210000000,
            voided_stake: 0,
            product: None,
            product_commission_rate: 0.0,
        };
        let market = Market {
            authority: Pubkey::new_unique(),
            event_account: Pubkey::new_unique(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(0),
            market_type: String::from(EVENT_RESULT_WINNER),
            market_lock_timestamp: UnixTimestamp::default(),
            market_settle_timestamp: None,
            title: String::from("META"),
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
        };

        // then
        assert_eq!(is_winning_order(&mut order, &market), true)
    }

    #[test]
    fn test_settle_order_lose_against_order() {
        // when
        let mut order = Order {
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
            for_outcome: false,
            purchaser: Pubkey::new_unique(),
            payer: Pubkey::new_unique(),

            stake: 100000000,
            expected_price: 2.10,
            order_status: OrderStatus::Matched,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 100000000,
            payout: 210000000,
            voided_stake: 0,
            product: None,
            product_commission_rate: 0.0,
        };
        let market = Market {
            authority: Pubkey::new_unique(),
            event_account: Pubkey::new_unique(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(1),
            market_type: String::from(EVENT_RESULT_WINNER),
            market_lock_timestamp: UnixTimestamp::default(),
            market_settle_timestamp: None,
            title: String::from("META"),
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
        };

        // then
        assert_eq!(is_winning_order(&mut order, &market), false)
    }
}
