use anchor_lang::prelude::*;

use crate::instructions::market_position::update_product_commission_contributions;
use crate::instructions::matching::create_trade::create_trade;
use crate::instructions::{calculate_risk_from_stake, current_timestamp, market_position, order};

use crate::error::CoreError;
use crate::events::trade::TradeEvent;
use crate::state::market_account::Market;
use crate::state::market_matching_pool_account::MarketMatchingPool;
use crate::state::market_matching_queue_account::MarketMatchingQueue;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::Order;
use crate::state::trade_account::Trade;

use super::update_matching_pool_with_matched_order;

pub fn on_order_match(
    market_pk: &Pubkey,
    market: &mut Market,
    market_matching_queue: &mut MarketMatchingQueue,
    market_matching_pool: &mut MarketMatchingPool,
    maker_order_pk: &Pubkey,
    maker_order: &mut Order,
    market_position: &mut MarketPosition,
    maker_order_trade_pk: &Pubkey,
    maker_order_trade: &mut Trade,
    taker_order_trade_pk: &Pubkey,
    taker_order_trade: &mut Trade,
    payer: &Pubkey,
) -> Result<u64> {
    let now = current_timestamp();

    match market_matching_queue.matches.peek_mut() {
        None => Err(error!(CoreError::MatchingMatchingQueueEmpty)),
        Some(taker_order) => {
            // determine matched stake
            let stake = maker_order.stake_unmatched.min(taker_order.stake);

            // update order
            order::match_order_internal(maker_order, stake, taker_order.price)?;
            let refund = market_position::update_on_order_match(
                market_position,
                maker_order,
                stake,
                taker_order.price,
            )?;
            update_matching_pool_with_matched_order(
                market_matching_pool,
                stake,
                *maker_order_pk,
                maker_order.stake_unmatched == 0_u64,
            )?;

            // update match
            taker_order.stake = taker_order
                .stake
                .checked_sub(stake)
                .ok_or(CoreError::MatchingMatchedStakeCalculationError)?;

            // update product commission tracking for matched risk
            update_product_commission_contributions(
                market_position,
                maker_order,
                match maker_order.for_outcome {
                    true => stake,
                    false => calculate_risk_from_stake(stake, taker_order.price),
                },
            )?;

            // store trades
            create_trade(
                maker_order_trade,
                &maker_order.purchaser,
                &maker_order.market,
                maker_order_pk,
                taker_order_trade_pk,
                maker_order.market_outcome_index,
                maker_order.for_outcome,
                stake,
                taker_order.price,
                now,
                *payer,
            );
            market.increment_unclosed_accounts_count()?;

            create_trade(
                taker_order_trade,
                &taker_order.purchaser,
                &maker_order.market,
                &taker_order.pk,
                maker_order_trade_pk,
                taker_order.outcome_index,
                taker_order.for_outcome,
                stake,
                taker_order.price,
                now,
                *payer,
            );
            market.increment_unclosed_accounts_count()?;

            emit!(TradeEvent {
                amount: stake,
                price: taker_order.price,
                market: *market_pk,
            });

            // dequeue empty matches (needs to be last due to borrowing)
            if taker_order.stake == 0_u64 {
                market_matching_queue.matches.dequeue();
            }

            Ok(refund)
        }
    }
}

#[cfg(test)]
mod test {
    use crate::state::market_order_request_queue::OrderRequest;
    use crate::state::{
        market_account::{MarketOrderBehaviour, MarketStatus},
        market_matching_pool_account::Cirque,
        market_matching_queue_account::{MatchingQueue, OrderMatch},
    };

    use super::*;

    #[test]
    fn error_empty_queue() {
        let market_pk = Pubkey::new_unique();
        let mut market = mock_market();
        let market_outcome_index = 1;
        let matched_price = 2.2_f64;
        let payer_pk = Pubkey::new_unique();

        let order_request = mock_order_request(
            Pubkey::new_unique(),
            false,
            market_outcome_index,
            100_u64,
            2.4_f64,
        );
        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, order_request, payer_pk);

        let mut market_position = mock_market_position(market_pk, order_request.purchaser, 3);
        let update_on_order_creation =
            market_position::update_on_order_request_creation(&mut market_position, &order_request);
        assert!(update_on_order_creation.is_ok());
        assert_eq!(vec!(0, 140, 0), market_position.unmatched_exposures);

        let mut market_matching_pool = MarketMatchingPool {
            market: market_pk,
            market_outcome_index,
            for_outcome: false,
            price: matched_price,
            liquidity_amount: 100_u64,
            matched_amount: 0_u64,
            inplay: false,
            orders: Cirque::new(1),
            payer: payer_pk,
        };
        market_matching_pool.orders.enqueue(order_pk);
        assert_eq!(1_u32, market_matching_pool.orders.len());

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let maker_order_trade_pk = Pubkey::new_unique();
        let taker_order_trade_pk = Pubkey::new_unique();
        let mut maker_order_trade = Trade::default();
        let mut taker_order_trade = Trade::default();

        let on_order_match_testable_result = on_order_match(
            &market_pk,
            &mut market,
            &mut market_matching_queue,
            &mut market_matching_pool,
            &order_pk,
            &mut order,
            &mut market_position,
            &maker_order_trade_pk,
            &mut maker_order_trade,
            &taker_order_trade_pk,
            &mut taker_order_trade,
            &payer_pk,
        );
        assert!(on_order_match_testable_result.is_err());
        assert_eq!(
            error!(CoreError::MatchingMatchingQueueEmpty),
            on_order_match_testable_result.unwrap_err()
        );

        assert_eq!(100_u64, order.stake_unmatched);
        assert_eq!(0_u64, order.payout);
        assert_eq!(2.4_f64, order.expected_price);

        assert_eq!(vec!(0, 140, 0), market_position.unmatched_exposures);
        assert_eq!(vec!(0, 0, 0), market_position.market_outcome_sums);

        assert_eq!(100_u64, market_matching_pool.liquidity_amount);
        assert_eq!(0_u64, market_matching_pool.matched_amount);
        assert_eq!(1_u32, market_matching_pool.orders.len());

        assert_eq!(false, maker_order_trade.for_outcome); // default value
        assert_eq!(0_u64, maker_order_trade.stake); // default value
        assert_eq!(0.0_f64, maker_order_trade.price); // default value

        assert_eq!(false, taker_order_trade.for_outcome); // default value
        assert_eq!(0_u64, taker_order_trade.stake); // default value
        assert_eq!(0.0_f64, taker_order_trade.price); // default value
    }

    #[test]
    fn match_less_than() {
        let market_pk = Pubkey::new_unique();
        let mut market = mock_market();
        let market_outcome_index = 1;
        let matched_price = 2.2_f64;
        let matched_stake = 10_u64;
        let payer_pk = Pubkey::new_unique();

        let order_request = mock_order_request(
            Pubkey::new_unique(),
            false,
            market_outcome_index,
            100_u64,
            2.4_f64,
        );
        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, order_request, payer_pk);

        let mut market_position = mock_market_position(market_pk, order_request.purchaser, 3);
        let update_on_order_creation =
            market_position::update_on_order_request_creation(&mut market_position, &order_request);
        assert!(update_on_order_creation.is_ok());
        assert_eq!(vec!(0, 140, 0), market_position.unmatched_exposures);

        let mut market_matching_pool = MarketMatchingPool {
            market: market_pk,
            market_outcome_index,
            for_outcome: false,
            price: matched_price,
            liquidity_amount: 100_u64,
            matched_amount: 0_u64,
            inplay: false,
            orders: Cirque::new(1),
            payer: payer_pk,
        };
        market_matching_pool.orders.enqueue(order_pk);
        assert_eq!(1_u32, market_matching_pool.orders.len());

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };
        market_matching_queue.matches.enqueue(OrderMatch {
            for_outcome: true,
            outcome_index: market_outcome_index,
            price: matched_price,
            stake: matched_stake,
            pk: Pubkey::new_unique(),
            purchaser: Pubkey::new_unique(),
        });

        let maker_order_trade_pk = Pubkey::new_unique();
        let taker_order_trade_pk = Pubkey::new_unique();
        let mut maker_order_trade = Trade::default();
        let mut taker_order_trade = Trade::default();

        let on_order_match_testable_result = on_order_match(
            &market_pk,
            &mut market,
            &mut market_matching_queue,
            &mut market_matching_pool,
            &order_pk,
            &mut order,
            &mut market_position,
            &maker_order_trade_pk,
            &mut maker_order_trade,
            &taker_order_trade_pk,
            &mut taker_order_trade,
            &payer_pk,
        );
        assert!(on_order_match_testable_result.is_ok());

        assert_eq!(90_u64, order.stake_unmatched);
        assert_eq!(22_u64, order.payout);
        assert_eq!(2.4_f64, order.expected_price);

        assert_eq!(vec!(0, 126, 0), market_position.unmatched_exposures);
        assert_eq!(vec!(10, -12, 10), market_position.market_outcome_sums);

        assert_eq!(90_u64, market_matching_pool.liquidity_amount);
        assert_eq!(10_u64, market_matching_pool.matched_amount);
        assert_eq!(1_u32, market_matching_pool.orders.len());

        assert_eq!(false, maker_order_trade.for_outcome);
        assert_eq!(10_u64, maker_order_trade.stake);
        assert_eq!(2.2_f64, maker_order_trade.price);

        assert_eq!(true, taker_order_trade.for_outcome);
        assert_eq!(10_u64, taker_order_trade.stake);
        assert_eq!(2.2_f64, taker_order_trade.price);
    }

    #[test]
    fn match_greater_than() {
        let market_pk = Pubkey::new_unique();
        let mut market = mock_market();
        let market_outcome_index = 1;
        let matched_price = 2.2_f64;
        let matched_stake = 100_u64;
        let payer_pk = Pubkey::new_unique();

        let order_request = mock_order_request(
            Pubkey::new_unique(),
            false,
            market_outcome_index,
            10_u64,
            2.4_f64,
        );
        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, order_request, payer_pk);

        let mut market_position = mock_market_position(market_pk, order_request.purchaser, 3);
        let update_on_order_creation =
            market_position::update_on_order_request_creation(&mut market_position, &order_request);
        assert!(update_on_order_creation.is_ok());
        assert_eq!(vec!(0, 14, 0), market_position.unmatched_exposures);

        let mut market_matching_pool = MarketMatchingPool {
            market: market_pk,
            market_outcome_index,
            for_outcome: false,
            price: matched_price,
            liquidity_amount: 10_u64,
            matched_amount: 0_u64,
            inplay: false,
            orders: Cirque::new(1),
            payer: payer_pk,
        };
        market_matching_pool.orders.enqueue(order_pk);
        assert_eq!(1_u32, market_matching_pool.orders.len());

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };
        market_matching_queue.matches.enqueue(OrderMatch {
            for_outcome: true,
            outcome_index: market_outcome_index,
            price: matched_price,
            stake: matched_stake,
            pk: Pubkey::new_unique(),
            purchaser: Pubkey::new_unique(),
        });

        let maker_order_trade_pk = Pubkey::new_unique();
        let taker_order_trade_pk = Pubkey::new_unique();
        let mut maker_order_trade = Trade::default();
        let mut taker_order_trade = Trade::default();

        let on_order_match_testable_result = on_order_match(
            &market_pk,
            &mut market,
            &mut market_matching_queue,
            &mut market_matching_pool,
            &order_pk,
            &mut order,
            &mut market_position,
            &maker_order_trade_pk,
            &mut maker_order_trade,
            &taker_order_trade_pk,
            &mut taker_order_trade,
            &payer_pk,
        );
        assert!(on_order_match_testable_result.is_ok());

        assert_eq!(0_u64, order.stake_unmatched);
        assert_eq!(22_u64, order.payout);
        assert_eq!(2.4_f64, order.expected_price);

        assert_eq!(vec!(0, 0, 0), market_position.unmatched_exposures);
        assert_eq!(vec!(10, -12, 10), market_position.market_outcome_sums);

        assert_eq!(0_u64, market_matching_pool.liquidity_amount);
        assert_eq!(10_u64, market_matching_pool.matched_amount);
        assert_eq!(0_u32, market_matching_pool.orders.len());

        assert_eq!(false, maker_order_trade.for_outcome);
        assert_eq!(10_u64, maker_order_trade.stake);
        assert_eq!(2.2_f64, maker_order_trade.price);

        assert_eq!(true, taker_order_trade.for_outcome);
        assert_eq!(10_u64, taker_order_trade.stake);
        assert_eq!(2.2_f64, taker_order_trade.price);
    }

    fn mock_market() -> Market {
        Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Open,
            inplay_enabled: true,
            inplay: true,
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
            event_start_order_behaviour: MarketOrderBehaviour::CancelUnmatched,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            inplay_order_delay: 0,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            funding_account_bump: 0,
            event_start_timestamp: 100,
        }
    }

    fn mock_order_request(
        purchaser: Pubkey,
        for_outcome: bool,
        outcome: u16,
        stake: u64,
        price: f64,
    ) -> OrderRequest {
        OrderRequest {
            purchaser,
            market_outcome_index: outcome,
            for_outcome,
            stake,
            expected_price: price,
            product: None,
            product_commission_rate: 0.0,
            delay_expiration_timestamp: 0,
            distinct_seed: [0; 16],
            creation_timestamp: 0,
        }
    }

    fn mock_order(market_pk: Pubkey, order_request: OrderRequest, payer_pk: Pubkey) -> Order {
        Order {
            market: market_pk,
            purchaser: order_request.purchaser,
            market_outcome_index: order_request.market_outcome_index,
            for_outcome: order_request.for_outcome,
            stake: order_request.stake,
            stake_unmatched: order_request.stake,
            expected_price: order_request.expected_price,
            voided_stake: 0_u64,
            payout: 0_u64,
            order_status: crate::state::order_account::OrderStatus::Open,
            product: order_request.product,
            product_commission_rate: order_request.product_commission_rate,
            creation_timestamp: 0,
            payer: payer_pk,
        }
    }

    fn mock_market_position(market_pk: Pubkey, purchaser_pk: Pubkey, len: usize) -> MarketPosition {
        let mut market_position = MarketPosition::default();
        market_position.market = market_pk;
        market_position.purchaser = purchaser_pk;
        market_position.market_outcome_sums.resize(len, 0_i128);
        market_position.unmatched_exposures.resize(len, 0_u64);
        return market_position;
    }
}
