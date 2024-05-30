use crate::error::CoreError;
use crate::error::CoreError::MatchingQueueIsFull;
use crate::state::market_liquidities::MarketLiquidities;
use crate::state::market_matching_queue_account::*;
use crate::state::order_account::*;
use anchor_lang::prelude::*;

pub const MATCH_CAPACITY: usize = 8_usize; // an arbitrary number

pub fn on_order_creation(
    market_liquidities: &mut MarketLiquidities,
    market_matching_queue: &mut MarketMatchingQueue,
    order_pk: &Pubkey,
    order: &mut Order,
) -> Result<Vec<(u64, f64)>> {
    let mut order_matches = Vec::with_capacity(MATCH_CAPACITY);
    let order_outcome = order.market_outcome_index;

    // FOR order matches AGAINST liquidity
    if order.for_outcome {
        let liquidities = &market_liquidities.liquidities_against;

        for liquidity in liquidities
            .iter()
            .filter(|element| element.outcome == order_outcome)
        {
            if order.stake_unmatched == 0_u64 {
                break; // no need to loop any further
            }
            if order_matches.len() == order_matches.capacity() {
                break; // can't loop any further
            }
            if liquidity.price < order.expected_price {
                break; // liquidity.price >= expected_price must be true
            }

            let stake_matched = liquidity.liquidity.min(order.stake_unmatched);
            if liquidity.sources.is_empty() {
                // direct match

                market_matching_queue
                    .matches
                    .enqueue(OrderMatch::maker(
                        !order.for_outcome,
                        order.market_outcome_index,
                        liquidity.price,
                        stake_matched,
                    ))
                    .ok_or(MatchingQueueIsFull)?;
            } else {
                // cross match TODO

                for liquidity_source in &liquidity.sources {
                    // TODO proper liquidity_source_stake_matched calculation needed
                    let liquidity_source_stake_matched = stake_matched;
                    // TODO remove source liquidity
                    market_matching_queue
                        .matches
                        .enqueue(OrderMatch::maker(
                            order.for_outcome,
                            liquidity_source.outcome,
                            liquidity_source.price,
                            liquidity_source_stake_matched,
                        ))
                        .ok_or(MatchingQueueIsFull)?;
                }
            }

            // record taker match
            market_matching_queue
                .matches
                .enqueue(OrderMatch::taker(
                    *order_pk,
                    order.for_outcome,
                    order.market_outcome_index,
                    liquidity.price,
                    stake_matched,
                ))
                .ok_or(MatchingQueueIsFull)?;

            // this needs to happen in the loop
            order
                .match_stake_unmatched(stake_matched, liquidity.price)
                .map_err(|_| CoreError::MatchingPayoutAmountError)?;

            order_matches.push((stake_matched, liquidity.price));
        }

        // remove matched liquidity
        for (stake, price) in &order_matches {
            market_liquidities
                .remove_liquidity_against(order.market_outcome_index, *price, *stake)
                .map_err(|_| CoreError::MatchingRemainingLiquidityTooSmall)?;
            market_liquidities.update_stake_matched_total(*stake)?;
        }

        // remainder is added to liquidities
        if order.stake_unmatched > 0_u64 {
            market_liquidities.add_liquidity_for(
                order.market_outcome_index,
                order.expected_price,
                order.stake_unmatched,
            )?;
        }
    }
    // AGAINST order matches FOR liquidity
    else {
        let liquidities = &market_liquidities.liquidities_for;

        for liquidity in liquidities
            .iter()
            .filter(|element| element.outcome == order_outcome)
        {
            if order.stake_unmatched == 0_u64 {
                break; // no need to loop any further
            }
            if order_matches.len() == order_matches.capacity() {
                break; // can't loop any further
            }
            if liquidity.price > order.expected_price {
                break; // liquidity.price <= expected_price must be true
            }

            let stake_matched = liquidity.liquidity.min(order.stake_unmatched);
            if liquidity.sources.is_empty() {
                // direct match

                market_matching_queue
                    .matches
                    .enqueue(OrderMatch::maker(
                        !order.for_outcome,
                        order.market_outcome_index,
                        liquidity.price,
                        stake_matched,
                    ))
                    .ok_or(MatchingQueueIsFull)?;
            } else {
                // cross match TODO

                for liquidity_source in &liquidity.sources {
                    // TODO proper liquidity_source_stake_matched calculation needed
                    let liquidity_source_stake_matched = stake_matched;
                    // TODO remove source liquidity
                    market_matching_queue
                        .matches
                        .enqueue(OrderMatch::maker(
                            order.for_outcome,
                            liquidity_source.outcome,
                            liquidity_source.price,
                            liquidity_source_stake_matched,
                        ))
                        .ok_or(MatchingQueueIsFull)?;
                }
            }

            // record taker match
            market_matching_queue
                .matches
                .enqueue(OrderMatch::taker(
                    *order_pk,
                    order.for_outcome,
                    order.market_outcome_index,
                    liquidity.price,
                    stake_matched,
                ))
                .ok_or(MatchingQueueIsFull)?;

            // this needs to happen in the loop
            order
                .match_stake_unmatched(stake_matched, liquidity.price)
                .map_err(|_| CoreError::MatchingPayoutAmountError)?;

            order_matches.push((stake_matched, liquidity.price));
        }

        // remove matched liquidity
        for (stake, price) in &order_matches {
            market_liquidities
                .remove_liquidity_for(order.market_outcome_index, *price, *stake)
                .map_err(|_| CoreError::MatchingRemainingLiquidityTooSmall)?;
            market_liquidities.update_stake_matched_total(*stake)?;
        }

        // remainder is added to liquidities
        if order.stake_unmatched > 0_u64 {
            market_liquidities.add_liquidity_against(
                order.market_outcome_index,
                order.expected_price,
                order.stake_unmatched,
            )?;
        }
    }

    Ok(order_matches)
}

#[cfg(test)]
mod test {
    use crate::state::market_liquidities::{mock_market_liquidities, MarketOutcomePriceLiquidity};
    use crate::state::market_matching_queue_account::MatchingQueue;

    use super::*;

    #[test]
    fn match_against_order_stop_after_fully_matched() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, false, 1.5, 10, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_for(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            vec!((1.3, 10), (1.4, 10)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            Vec::<(f64, u64)>::new(),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec!((1.2, 10), (1.2, 10)),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(0_u64, order.stake_unmatched);
        assert_eq!(12_u64, order.payout);
    }

    #[test]
    fn match_against_order_with_more_matches_than_alloc() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![
            1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5, 1.55, 1.6, 1.65, 1.7, 1.75,
        ];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, false, 1.8, 100, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_for(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(30),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            vec!((1.6, 10), (1.65, 10), (1.7, 10), (1.75, 10)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((1.8, 20)),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(80_u64, market_liquidities.stake_matched_total);
        assert_eq!(
            vec!(
                (1.2, 10),
                (1.2, 10),
                (1.25, 10),
                (1.25, 10),
                (1.3, 10),
                (1.3, 10),
                (1.35, 10),
                (1.35, 10),
                (1.4, 10),
                (1.4, 10),
                (1.45, 10),
                (1.45, 10),
                (1.5, 10),
                (1.5, 10),
                (1.55, 10),
                (1.55, 10),
            ),
            matches(&market_matching_queue.matches) // vec max length
        );

        assert_eq!(20_u64, order.stake_unmatched);
        assert_eq!(108_u64, order.payout);
    }

    #[test]
    fn match_against_order_with_price_1_1() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, false, 1.1, 100, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_for(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            vec!((1.2, 10), (1.3, 10), (1.4, 10)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((1.1, 100)),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(0_u64, market_liquidities.stake_matched_total);
        assert_eq!(
            Vec::<(f64, u64)>::new(),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(100_u64, order.stake_unmatched);
        assert_eq!(0_u64, order.payout);
    }

    #[test]
    fn match_against_order_with_price_1_2() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, false, 1.2, 100, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_for(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            vec!((1.3, 10), (1.4, 10)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((1.2, 90)),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec!((1.2, 10), (1.2, 10)),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(90_u64, order.stake_unmatched);
        assert_eq!(12_u64, order.payout);
    }

    #[test]
    fn match_against_order_with_price_1_3() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, false, 1.3, 100, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_for(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            vec!((1.4, 10)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((1.3, 80)),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(20_u64, market_liquidities.stake_matched_total);
        assert_eq!(
            vec!((1.2, 10), (1.2, 10), (1.3, 10), (1.3, 10)),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(80_u64, order.stake_unmatched);
        assert_eq!(25_u64, order.payout);
    }

    #[test]
    fn match_against_order_with_price_1_4() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, false, 1.4, 100, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_for(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            Vec::<(f64, u64)>::new(),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((1.4, 70)),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(30_u64, market_liquidities.stake_matched_total);
        assert_eq!(
            vec!(
                (1.2, 10),
                (1.2, 10),
                (1.3, 10),
                (1.3, 10),
                (1.4, 10),
                (1.4, 10)
            ),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(70_u64, order.stake_unmatched);
        assert_eq!(39_u64, order.payout);
    }

    #[test]
    fn match_against_order_with_price_1_5() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, false, 1.5, 100, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_for(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            Vec::<(f64, u64)>::new(),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((1.5, 70)),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(30_u64, market_liquidities.stake_matched_total);
        assert_eq!(
            vec!(
                (1.2, 10),
                (1.2, 10),
                (1.3, 10),
                (1.3, 10),
                (1.4, 10),
                (1.4, 10)
            ),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(70_u64, order.stake_unmatched);
        assert_eq!(39_u64, order.payout);
    }

    #[test]
    fn match_for_order_stop_after_fully_matched() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, true, 1.1, 10, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_against(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            Vec::<(f64, u64)>::new(),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((1.3, 10), (1.2, 10)),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec!((1.4, 10), (1.4, 10)),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(0_u64, order.stake_unmatched);
        assert_eq!(14_u64, order.payout);
    }

    #[test]
    fn match_for_order_with_more_matches_than_alloc() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4, 1.5, 1.6, 1.7];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, true, 1.1, 100, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_against(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(30),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            vec!((1.1, 40)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            Vec::<(f64, u64)>::new(),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(60_u64, market_liquidities.stake_matched_total);
        assert_eq!(
            vec!(
                (1.7, 10),
                (1.7, 10),
                (1.6, 10),
                (1.6, 10),
                (1.5, 10),
                (1.5, 10),
                (1.4, 10),
                (1.4, 10),
                (1.3, 10),
                (1.3, 10),
                (1.2, 10),
                (1.2, 10)
            ),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(40_u64, order.stake_unmatched);
        assert_eq!(87_u64, order.payout);
    }

    #[test]
    fn match_for_order_with_price_1_1() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, true, 1.1, 100, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_against(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            vec!((1.1, 70)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            Vec::<(f64, u64)>::new(),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(30_u64, market_liquidities.stake_matched_total);
        assert_eq!(
            vec!(
                (1.4, 10),
                (1.4, 10),
                (1.3, 10),
                (1.3, 10),
                (1.2, 10),
                (1.2, 10)
            ),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(70_u64, order.stake_unmatched);
        assert_eq!(39_u64, order.payout);
    }

    #[test]
    fn match_for_order_with_price_1_2() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, true, 1.2, 100, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_against(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            vec!((1.2, 70)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            Vec::<(f64, u64)>::new(),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(30_u64, market_liquidities.stake_matched_total);
        assert_eq!(
            vec!(
                (1.4, 10),
                (1.4, 10),
                (1.3, 10),
                (1.3, 10),
                (1.2, 10),
                (1.2, 10)
            ),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(70_u64, order.stake_unmatched);
        assert_eq!(39_u64, order.payout);
    }

    #[test]
    fn match_for_order_with_price_1_3() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, true, 1.3, 100, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_against(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            vec!((1.3, 80)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((1.2, 10)),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(20_u64, market_liquidities.stake_matched_total);
        assert_eq!(
            vec!((1.4, 10), (1.4, 10), (1.3, 10), (1.3, 10),),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(80_u64, order.stake_unmatched);
        assert_eq!(27_u64, order.payout);
    }

    #[test]
    fn match_for_order_with_price_1_4() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, true, 1.4, 100, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_against(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            vec!((1.4, 90)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((1.3, 10), (1.2, 10)),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec!((1.4, 10), (1.4, 10)),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(90_u64, order.stake_unmatched);
        assert_eq!(14_u64, order.payout);
    }

    #[test]
    fn match_for_order_with_price_1_5() {
        let market_pk = Pubkey::new_unique();
        let market_outcome_index = 1;
        let market_price_ladder = vec![1.2, 1.3, 1.4];
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, market_outcome_index, true, 1.5, 100, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        for price in market_price_ladder.iter() {
            market_liquidities
                .add_liquidity_against(market_outcome_index, *price, 10)
                .unwrap();
        }

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        let on_order_creation_result = on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        );

        assert!(on_order_creation_result.is_ok());

        assert_eq!(
            vec!((1.5, 100)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((1.4, 10), (1.3, 10), (1.2, 10)),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(0_u64, market_liquidities.stake_matched_total);
        assert_eq!(
            Vec::<(f64, u64)>::new(),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(100_u64, order.stake_unmatched);
        assert_eq!(0_u64, order.payout);
    }

    fn liquidities(liquidities: &Vec<MarketOutcomePriceLiquidity>) -> Vec<(f64, u64)> {
        liquidities
            .iter()
            .map(|v| (v.price, v.liquidity))
            .collect::<Vec<(f64, u64)>>()
    }

    fn matches(matches: &MatchingQueue) -> Vec<(f64, u64)> {
        matches
            .to_vec()
            .iter()
            .map(|v| (v.price, v.stake))
            .collect::<Vec<(f64, u64)>>()
    }
}
