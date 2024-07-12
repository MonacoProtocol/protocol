use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::error::CoreError::MatchingQueueIsFull;
use crate::instructions::calculate_stake_cross;
use crate::state::market_liquidities::MarketLiquidities;
use crate::state::market_matching_queue_account::*;
use crate::state::order_account::*;

#[cfg(test)]
use crate::state::market_liquidities::MarketOutcomePriceLiquidity;

pub const MATCH_CAPACITY: usize = 10_usize; // an arbitrary number

pub fn on_order_creation(
    market_liquidities: &mut MarketLiquidities,
    market_matching_queue: &mut MarketMatchingQueue,
    order_pk: &Pubkey,
    order: &mut Order,
) -> Result<Vec<(u64, f64)>> {
    match order.for_outcome {
        true => match_for_order(market_liquidities, market_matching_queue, order_pk, order),
        false => match_against_order(market_liquidities, market_matching_queue, order_pk, order),
    }
}

fn match_for_order(
    market_liquidities: &mut MarketLiquidities,
    market_matching_queue: &mut MarketMatchingQueue,
    order_pk: &Pubkey,
    order: &mut Order,
) -> Result<Vec<(u64, f64)>> {
    let mut order_matches = Vec::with_capacity(MATCH_CAPACITY);
    let order_outcome = order.market_outcome_index;

    // FOR order matches AGAINST liquidity
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

        let liquidity_value = if liquidity.sources.is_empty() {
            liquidity.liquidity
        } else {
            // jit cross liquidity calculation
            market_liquidities.get_cross_liquidity_against(&liquidity.sources, liquidity.price)
        };
        let stake_matched = liquidity_value.min(order.stake_unmatched);

        // record it for removals later
        order_matches.push((liquidity.price, liquidity.sources.clone(), stake_matched));

        if stake_matched == 0_u64 {
            continue;
        }

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
            // cross match
            for liquidity_source in &liquidity.sources {
                let liquidity_source_stake_matched =
                    calculate_stake_cross(stake_matched, liquidity.price, liquidity_source.price);
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
    }

    // remove matched liquidity
    for (price, sources, stake) in &order_matches {
        if sources.is_empty() {
            // for direct liquidity match just remove it
            market_liquidities
                .remove_liquidity_against(order.market_outcome_index, *price, *stake)
                .map_err(|_| CoreError::MatchingRemainingLiquidityTooSmall)?;
        } else {
            // for cross liquidity match remove the sources
            if *stake > 0_u64 {
                for source in sources {
                    let source_stake = calculate_stake_cross(*stake, *price, source.price);
                    market_liquidities
                        .remove_liquidity_for(source.outcome, source.price, source_stake)
                        .map_err(|_| CoreError::MatchingRemainingLiquidityTooSmall)?;
                }
            }
            // always update even if it's 0
            market_liquidities.update_cross_liquidity_against(sources);
        }
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

    Ok(order_matches
        .iter()
        .filter(|(_, _, stake)| *stake > 0)
        .map(|(price, _, stake)| (*stake, *price))
        .collect())
}

fn match_against_order(
    market_liquidities: &mut MarketLiquidities,
    market_matching_queue: &mut MarketMatchingQueue,
    order_pk: &Pubkey,
    order: &mut Order,
) -> Result<Vec<(u64, f64)>> {
    let mut order_matches = Vec::with_capacity(MATCH_CAPACITY);
    let order_outcome = order.market_outcome_index;

    // AGAINST order matches FOR liquidity
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

        let liquidity_value = if liquidity.sources.is_empty() {
            liquidity.liquidity
        } else {
            // jit cross liquidity calculation
            market_liquidities.get_cross_liquidity_for(&liquidity.sources, liquidity.price)
        };
        let stake_matched = liquidity_value.min(order.stake_unmatched);

        // record it for removals later
        order_matches.push((liquidity.price, liquidity.sources.clone(), stake_matched));

        if stake_matched == 0_u64 {
            continue;
        }

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
            // cross match
            for liquidity_source in &liquidity.sources {
                let liquidity_source_stake_matched =
                    calculate_stake_cross(stake_matched, liquidity.price, liquidity_source.price);

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
    }

    // remove matched liquidity
    for (price, sources, stake) in &order_matches {
        if sources.is_empty() {
            // for direct liquidity match just remove it
            market_liquidities
                .remove_liquidity_for(order.market_outcome_index, *price, *stake)
                .map_err(|_| CoreError::MatchingRemainingLiquidityTooSmall)?;
        } else {
            // for cross liquidity match remove the sources
            if *stake > 0_u64 {
                for source in sources {
                    let source_stake = calculate_stake_cross(*stake, *price, source.price);
                    market_liquidities
                        .remove_liquidity_against(source.outcome, source.price, source_stake)
                        .map_err(|_| CoreError::MatchingRemainingLiquidityTooSmall)?;
                }
            }
            // always update even if it's 0
            market_liquidities.update_cross_liquidity_for(sources);
        }
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

    Ok(order_matches
        .iter()
        .filter(|(_, _, stake)| *stake > 0)
        .map(|(price, _, stake)| (*stake, *price))
        .collect())
}

#[cfg(test)]
mod test_match_for_order {
    use crate::instructions::matching::on_order_creation;
    use crate::instructions::matching::on_order_creation::{liquidities, liquidities2, matches};
    use crate::state::market_liquidities::{mock_market_liquidities, LiquiditySource};
    use crate::state::market_matching_queue_account::{MarketMatchingQueue, MatchingQueue};
    use crate::state::order_account::mock_order;
    use solana_program::pubkey::Pubkey;

    #[test]
    fn direct_match() {
        let market_pk = Pubkey::new_unique();
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, 1, true, 2.8, 100_000, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        market_liquidities
            .add_liquidity_against(1, 2.8, 125_000)
            .unwrap();
        market_liquidities
            .add_liquidity_against(2, 2.8, 125_000)
            .unwrap();
        market_liquidities.update_cross_liquidity_for(&[
            LiquiditySource::new(1, 2.8),
            LiquiditySource::new(2, 2.8),
        ]);

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        )
        .expect("match_for_order");

        assert_eq!(
            vec!((3.5, 100_000)), // TODO incorrect - should be 20
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((2.8, 125_000), (2.8, 25_000)),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec![(false, 2.8, 100_000), (true, 2.8, 100_000),],
            matches(&market_matching_queue.matches)
        );

        assert_eq!(0_u64, order.stake_unmatched);
        assert_eq!(280_000_u64, order.payout);
    }

    #[test]
    fn cross_match_3way() {
        let market_pk = Pubkey::new_unique();
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, 0, true, 3.5, 80_000, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        market_liquidities
            .add_liquidity_for(1, 2.8, 125_000)
            .unwrap();
        market_liquidities
            .add_liquidity_for(2, 2.8, 125_000)
            .unwrap();
        market_liquidities.update_cross_liquidity_against(&[
            LiquiditySource::new(1, 2.8),
            LiquiditySource::new(2, 2.8),
        ]);

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        )
        .expect("match_for_order");

        assert_eq!(
            vec![(2.8, 25_000), (2.8, 25_000)],
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec![(3.5, "2.80:2.80".to_string(), 20_000)],
            liquidities2(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec![
                (true, 2.8, 100_000),
                (true, 2.8, 100_000),
                (true, 3.5, 80_000)
            ],
            matches(&market_matching_queue.matches) // vec max length
        );

        assert_eq!(0_u64, order.stake_unmatched);
        assert_eq!(280_000_u64, order.payout);
    }

    #[test]
    fn cross_match_3way_liquidity_reduced() {
        let market_pk = Pubkey::new_unique();
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, 0, true, 3.5, 80_000, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        market_liquidities
            .add_liquidity_for(1, 2.8, 250_000)
            .unwrap();
        market_liquidities
            .add_liquidity_for(2, 2.8, 250_000)
            .unwrap();
        market_liquidities.update_cross_liquidity_against(&[
            LiquiditySource::new(1, 2.8),
            LiquiditySource::new(2, 2.8),
        ]);
        // following removals make cross liquidity to be too big
        market_liquidities
            .remove_liquidity_for(1, 2.8, 125_000)
            .unwrap();
        market_liquidities
            .remove_liquidity_for(2, 2.8, 125_000)
            .unwrap();

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        )
        .expect("match_for_order");

        assert_eq!(
            vec![(2.8, "".to_string(), 25_000), (2.8, "".to_string(), 25_000)],
            liquidities2(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec![(3.5, "2.80:2.80".to_string(), 20_000)],
            liquidities2(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec![
                (true, 2.8, 100_000),
                (true, 2.8, 100_000),
                (true, 3.5, 80_000)
            ],
            matches(&market_matching_queue.matches) // vec max length
        );

        assert_eq!(0_u64, order.stake_unmatched);
        assert_eq!(280_000_u64, order.payout);
    }

    #[test]
    fn cross_match_3way_liquidity_removed() {
        let market_pk = Pubkey::new_unique();
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, 0, true, 3.5, 80_000, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        market_liquidities
            .add_liquidity_for(1, 2.8, 125_000)
            .unwrap();
        market_liquidities
            .add_liquidity_for(2, 2.8, 125_000)
            .unwrap();
        market_liquidities.update_cross_liquidity_against(&[
            LiquiditySource::new(1, 2.8),
            LiquiditySource::new(2, 2.8),
        ]);
        assert_eq!(
            vec![(3.5, "2.80:2.80".to_string(), 100_000)],
            liquidities2(&market_liquidities.liquidities_against)
        );

        // following removals make cross liquidity to be too big
        market_liquidities
            .remove_liquidity_for(1, 2.8, 125_000)
            .unwrap();
        market_liquidities
            .remove_liquidity_for(2, 2.8, 125_000)
            .unwrap();

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        )
        .expect("match_for_order");

        assert_eq!(
            vec![(3.5, "".to_string(), 80_000)],
            liquidities2(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            Vec::<(f64, String, u64)>::new(),
            liquidities2(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            Vec::<(bool, f64, u64)>::new(),
            matches(&market_matching_queue.matches) // vec max length
        );

        assert_eq!(80_000_u64, order.stake_unmatched);
        assert_eq!(0_u64, order.payout);
    }

    #[test]
    fn cross_match_4way() {
        let market_pk = Pubkey::new_unique();
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, 0, true, 3.0, 120_000, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        market_liquidities
            .add_liquidity_for(1, 3.6, 200_000)
            .unwrap();
        market_liquidities
            .add_liquidity_for(2, 4.0, 180_000)
            .unwrap();
        market_liquidities
            .add_liquidity_for(3, 7.2, 100_000)
            .unwrap();
        market_liquidities.update_cross_liquidity_against(&[
            LiquiditySource::new(1, 3.6),
            LiquiditySource::new(2, 4.0),
            LiquiditySource::new(3, 7.2),
        ]);

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        )
        .expect("match_for_order");

        assert_eq!(
            vec![(3.6, 100_000), (4.0, 90_000), (7.2, 50_000)],
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec![(3.0, 120_000)],
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec![
                (true, 3.6, 100_000),
                (true, 4.0, 90_000),
                (true, 7.2, 50_000),
                (true, 3.0, 120_000)
            ],
            matches(&market_matching_queue.matches)
        );

        assert_eq!(0_u64, order.stake_unmatched);
        assert_eq!(360_000_u64, order.payout);
    }
}

#[cfg(test)]
mod test_match_against_order {
    use crate::instructions::matching::on_order_creation;
    use crate::instructions::matching::on_order_creation::{liquidities, liquidities2, matches};
    use crate::state::market_liquidities::{mock_market_liquidities, LiquiditySource};
    use crate::state::market_matching_queue_account::{MarketMatchingQueue, MatchingQueue};
    use crate::state::order_account::mock_order;
    use solana_program::pubkey::Pubkey;

    #[test]
    fn direct_match() {
        let market_pk = Pubkey::new_unique();
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, 1, false, 2.8, 100_000, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        market_liquidities
            .add_liquidity_for(1, 2.8, 125_000)
            .unwrap();
        market_liquidities
            .add_liquidity_for(2, 2.8, 125_000)
            .unwrap();
        market_liquidities.update_cross_liquidity_against(&[
            LiquiditySource::new(1, 2.8),
            LiquiditySource::new(2, 2.8),
        ]);

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        )
        .expect("");

        assert_eq!(
            vec!((2.8, 25_000), (2.8, 125_000)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((3.5, 100_000)), // TODO incorrect - should be 20
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec![(true, 2.8, 100_000), (false, 2.8, 100_000),],
            matches(&market_matching_queue.matches)
        );

        assert_eq!(0_u64, order.stake_unmatched);
        assert_eq!(280_000_u64, order.payout);
    }

    #[test]
    fn cross_match_3way() {
        let market_pk = Pubkey::new_unique();
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, 0, false, 3.5, 80_000, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        market_liquidities
            .add_liquidity_against(1, 2.8, 125_000)
            .unwrap();
        market_liquidities
            .add_liquidity_against(2, 2.8, 125_000)
            .unwrap();
        market_liquidities.update_cross_liquidity_for(&[
            LiquiditySource::new(1, 2.8),
            LiquiditySource::new(2, 2.8),
        ]);

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        )
        .expect("");

        assert_eq!(
            vec!((3.5, 20_000)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec![(2.8, 25_000), (2.8, 25_000)],
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec![
                (false, 2.8, 100_000),
                (false, 2.8, 100_000),
                (false, 3.5, 80_000)
            ],
            matches(&market_matching_queue.matches) // vec max length
        );

        assert_eq!(0_u64, order.stake_unmatched);
        assert_eq!(280_000_u64, order.payout);
    }

    #[test]
    fn cross_match_3way_liquidity_reduced() {
        let market_pk = Pubkey::new_unique();
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, 0, false, 3.5, 80_000, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        market_liquidities
            .add_liquidity_against(1, 2.8, 250_000)
            .unwrap();
        market_liquidities
            .add_liquidity_against(2, 2.8, 250_000)
            .unwrap();
        market_liquidities.update_cross_liquidity_for(&[
            LiquiditySource::new(1, 2.8),
            LiquiditySource::new(2, 2.8),
        ]);
        // following removals make cross liquidity to be too big
        market_liquidities
            .remove_liquidity_against(1, 2.8, 125_000)
            .unwrap();
        market_liquidities
            .remove_liquidity_against(2, 2.8, 125_000)
            .unwrap();

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        )
        .expect("");

        assert_eq!(
            vec![(3.5, "2.80:2.80".to_string(), 20_000)],
            liquidities2(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec![(2.8, "".to_string(), 25_000), (2.8, "".to_string(), 25_000)],
            liquidities2(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec![
                (false, 2.8, 100_000),
                (false, 2.8, 100_000),
                (false, 3.5, 80_000)
            ],
            matches(&market_matching_queue.matches) // vec max length
        );

        assert_eq!(0_u64, order.stake_unmatched);
        assert_eq!(280_000_u64, order.payout);
    }

    #[test]
    fn cross_match_3way_liquidity_removed() {
        let market_pk = Pubkey::new_unique();
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, 0, false, 3.5, 80, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        market_liquidities
            .add_liquidity_against(1, 2.8, 125)
            .unwrap();
        market_liquidities
            .add_liquidity_against(2, 2.8, 125)
            .unwrap();
        market_liquidities.update_cross_liquidity_for(&[
            LiquiditySource::new(1, 2.8),
            LiquiditySource::new(2, 2.8),
        ]);
        // following removals make cross liquidity to be too big
        market_liquidities
            .remove_liquidity_against(1, 2.8, 125)
            .unwrap();
        market_liquidities
            .remove_liquidity_against(2, 2.8, 125)
            .unwrap();

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        )
        .expect("");

        assert_eq!(
            Vec::<(f64, String, u64)>::new(),
            liquidities2(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec![(3.5, "".to_string(), 80)],
            liquidities2(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            Vec::<(bool, f64, u64)>::new(),
            matches(&market_matching_queue.matches) // vec max length
        );

        assert_eq!(80_u64, order.stake_unmatched);
        assert_eq!(0_u64, order.payout);
    }

    #[test]
    fn cross_match_4way() {
        let market_pk = Pubkey::new_unique();
        let payer_pk = Pubkey::new_unique();

        let order_pk = Pubkey::new_unique();
        let mut order = mock_order(market_pk, 0, false, 3.0, 120_000, payer_pk);

        let mut market_liquidities = mock_market_liquidities(market_pk);
        market_liquidities
            .add_liquidity_against(1, 3.6, 200_000)
            .unwrap();
        market_liquidities
            .add_liquidity_against(2, 4.0, 180_000)
            .unwrap();
        market_liquidities
            .add_liquidity_against(3, 7.2, 100_000)
            .unwrap();
        market_liquidities.update_cross_liquidity_for(&[
            LiquiditySource::new(1, 3.6),
            LiquiditySource::new(2, 4.0),
            LiquiditySource::new(3, 7.2),
        ]);

        let mut market_matching_queue = MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(10),
        };

        on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        )
        .expect("");

        assert_eq!(
            vec![(3.0, 120_000)],
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec![(7.2, 50_000), (4.0, 90_000), (3.6, 100_000),],
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec![
                (false, 3.6, 100_000),
                (false, 4.0, 90_000),
                (false, 7.2, 50_000),
                (false, 3.0, 120_000)
            ],
            matches(&market_matching_queue.matches)
        );

        assert_eq!(0_u64, order.stake_unmatched);
        assert_eq!(360_000_u64, order.payout);
    }
}

#[cfg(test)]
mod test {
    use crate::state::market_liquidities::mock_market_liquidities;
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

        on_order_creation(
            &mut market_liquidities,
            &mut market_matching_queue,
            &order_pk,
            &mut order,
        )
        .expect("");

        assert_eq!(
            vec!((1.3, 10), (1.4, 10)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            Vec::<(f64, u64)>::new(),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(
            vec!((true, 1.2, 10), (false, 1.2, 10)),
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
        let mut order = mock_order(market_pk, market_outcome_index, false, 1.8, 120, payer_pk);

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
            vec!((1.7, 10), (1.75, 10)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            vec!((1.8, 20)),
            liquidities(&market_liquidities.liquidities_against)
        );
        assert_eq!(100_u64, market_liquidities.stake_matched_total);
        assert_eq!(
            vec![
                (true, 1.2, 10),
                (false, 1.2, 10),
                (true, 1.25, 10),
                (false, 1.25, 10),
                (true, 1.3, 10),
                (false, 1.3, 10),
                (true, 1.35, 10),
                (false, 1.35, 10),
                (true, 1.4, 10),
                (false, 1.4, 10),
                (true, 1.45, 10),
                (false, 1.45, 10),
                (true, 1.5, 10),
                (false, 1.5, 10),
                (true, 1.55, 10),
                (false, 1.55, 10),
                (true, 1.6, 10),
                (false, 1.6, 10),
                (true, 1.65, 10),
                (false, 1.65, 10)
            ],
            matches(&market_matching_queue.matches) // vec max length
        );

        assert_eq!(20_u64, order.stake_unmatched);
        assert_eq!(140_u64, order.payout);
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
            Vec::<(bool, f64, u64)>::new(),
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
            vec!((true, 1.2, 10), (false, 1.2, 10)),
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
            vec!(
                (true, 1.2, 10),
                (false, 1.2, 10),
                (true, 1.3, 10),
                (false, 1.3, 10)
            ),
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
                (true, 1.2, 10),
                (false, 1.2, 10),
                (true, 1.3, 10),
                (false, 1.3, 10),
                (true, 1.4, 10),
                (false, 1.4, 10)
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
                (true, 1.2, 10),
                (false, 1.2, 10),
                (true, 1.3, 10),
                (false, 1.3, 10),
                (true, 1.4, 10),
                (false, 1.4, 10)
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
            vec!((false, 1.4, 10), (true, 1.4, 10)),
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
                (false, 1.7, 10),
                (true, 1.7, 10),
                (false, 1.6, 10),
                (true, 1.6, 10),
                (false, 1.5, 10),
                (true, 1.5, 10),
                (false, 1.4, 10),
                (true, 1.4, 10),
                (false, 1.3, 10),
                (true, 1.3, 10),
                (false, 1.2, 10),
                (true, 1.2, 10)
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
                (false, 1.4, 10),
                (true, 1.4, 10),
                (false, 1.3, 10),
                (true, 1.3, 10),
                (false, 1.2, 10),
                (true, 1.2, 10)
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
                (false, 1.4, 10),
                (true, 1.4, 10),
                (false, 1.3, 10),
                (true, 1.3, 10),
                (false, 1.2, 10),
                (true, 1.2, 10)
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
            vec!(
                (false, 1.4, 10),
                (true, 1.4, 10),
                (false, 1.3, 10),
                (true, 1.3, 10),
            ),
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
            vec!((false, 1.4, 10), (true, 1.4, 10)),
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
            Vec::<(bool, f64, u64)>::new(),
            matches(&market_matching_queue.matches)
        );

        assert_eq!(100_u64, order.stake_unmatched);
        assert_eq!(0_u64, order.payout);
    }
}

#[cfg(test)]
fn liquidities(liquidities: &Vec<MarketOutcomePriceLiquidity>) -> Vec<(f64, u64)> {
    liquidities
        .iter()
        .map(|v| (v.price, v.liquidity))
        .collect::<Vec<(f64, u64)>>()
}

#[cfg(test)]
fn liquidities2(liquidities: &Vec<MarketOutcomePriceLiquidity>) -> Vec<(f64, String, u64)> {
    liquidities
        .iter()
        .map(|v| {
            (
                v.price,
                v.sources
                    .iter()
                    .map(|source| format!("{:.2}", source.price))
                    .collect::<Vec<String>>()
                    .join(":"),
                v.liquidity,
            )
        })
        .collect::<Vec<(f64, String, u64)>>()
}

#[cfg(test)]
fn matches(matches: &MatchingQueue) -> Vec<(bool, f64, u64)> {
    matches
        .to_vec()
        .iter()
        .map(|v| (v.for_outcome, v.price, v.stake))
        .collect::<Vec<(bool, f64, u64)>>()
}
