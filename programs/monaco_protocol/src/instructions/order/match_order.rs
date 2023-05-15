use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::instructions::calculate_for_payout;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::{Order, OrderStatus};

pub fn match_order(
    order: &mut Account<Order>,
    market_position: &mut MarketPosition,
    stake_matched: u64,
    price_matched: f64,
) -> Result<u64> {
    // validate that status is open or matched (for partial matches)
    if order.order_status != OrderStatus::Open && order.order_status != OrderStatus::Matched {
        msg!("Order Matching: status closed");
        return Err(error!(CoreError::MatchingStatusClosed));
    }

    // validate that there is enough stake to match (for partial matches)
    if order.stake_unmatched < stake_matched {
        msg!("Order Matching: remaining stake too small");
        return Err(error!(CoreError::MatchingRemainingStakeTooSmall));
    }

    match_order_internal(order, stake_matched, price_matched)?;

    let refund = market_position.update_on_match(
        order.market_outcome_index as usize,
        order.for_outcome,
        stake_matched,
        price_matched,
        order.expected_price,
    )?;

    Ok(refund)
}

fn match_order_internal(order: &mut Order, stake_matched: u64, price_matched: f64) -> Result<()> {
    if stake_matched <= order.stake_unmatched {
        order.order_status = OrderStatus::Matched;
        order.stake_unmatched -= stake_matched;
        order.payout = order
            .payout
            .checked_add(calculate_for_payout(stake_matched, price_matched))
            .ok_or(CoreError::MatchingPayoutAmountError)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::order_account::{Order, OrderStatus};
    use anchor_lang::prelude::Pubkey;

    #[test]
    fn test_match_order_no_match() {
        // given
        let mut order = Order {
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
            for_outcome: true,
            purchaser: Pubkey::new_unique(),
            payer: Pubkey::new_unique(),

            stake: 100000000,
            expected_price: 2.10,
            order_status: OrderStatus::Open,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 100000000,
            payout: 0_u64,
            voided_stake: 0,
            product: Default::default(),
        };
        let stake_matched = 100000100;

        // when
        let _ = match_order_internal(&mut order, stake_matched, 2.10);

        // then
        assert_eq!(order.order_status, OrderStatus::Open);
        assert_eq!(order.stake_unmatched, 100000000);
        assert_eq!(order.payout, 0_u64);
    }

    #[test]
    fn test_match_order_partial_match() {
        // given
        let mut order = Order {
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
            for_outcome: true,
            purchaser: Pubkey::new_unique(),
            payer: Pubkey::new_unique(),

            stake: 100000000,
            expected_price: 2.10,
            order_status: OrderStatus::Open,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 100000000,
            payout: 0_u64,
            voided_stake: 0,
            product: Default::default(),
        };
        let stake_matched = order.stake_unmatched - 100;

        // when
        let _ = match_order_internal(&mut order, stake_matched, 2.10);

        // then
        assert_eq!(order.order_status, OrderStatus::Matched);
        assert_eq!(order.stake_unmatched, 100);
        assert_eq!(order.payout, 209999790);
    }

    #[test]
    fn test_match_order_full_match() {
        // when
        let mut order = Order {
            market: Pubkey::new_unique(),
            market_outcome_index: 1,
            for_outcome: true,
            purchaser: Pubkey::new_unique(),
            payer: Pubkey::new_unique(),

            stake: 100000000,
            expected_price: 2.10,
            order_status: OrderStatus::Open,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 100000000,
            payout: 0_u64,
            voided_stake: 0,
            product: Default::default(),
        };
        let stake_matched = order.stake_unmatched;

        // when
        let _ = match_order_internal(&mut order, stake_matched, 2.10);

        // then
        assert_eq!(order.order_status, OrderStatus::Matched);
        assert_eq!(order.stake_unmatched, 0);
        assert_eq!(order.payout, 210000000);
    }
}
