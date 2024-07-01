use crate::error::CoreError;
use crate::instructions::calculate_risk_from_stake;
use crate::state::market_position_account::MarketPosition;
use crate::state::order_account::*;
use anchor_lang::prelude::*;

pub fn update_on_order_match(
    market_position: &mut MarketPosition,
    order: &Order,
    stake_matched: u64,
    price_matched: f64,
) -> Result<u64> {
    let total_exposure_before = market_position.total_exposure();

    let outcome_index = order.market_outcome_index as usize;
    let for_outcome = order.for_outcome;
    let price_unmatched = order.expected_price;

    let unmatched_risk = calculate_risk_from_stake(stake_matched, price_unmatched);
    let matched_risk = calculate_risk_from_stake(stake_matched, price_matched);

    // update chosen outcome position
    match for_outcome {
        true => {
            market_position.market_outcome_sums[outcome_index] = market_position
                .market_outcome_sums[outcome_index]
                .checked_add(matched_risk as i128)
                .ok_or(CoreError::ArithmeticError)?;
        }
        false => {
            market_position.market_outcome_sums[outcome_index] = market_position
                .market_outcome_sums[outcome_index]
                .checked_sub(matched_risk as i128)
                .ok_or(CoreError::ArithmeticError)?;
        }
    }

    // update other outcome positions
    let market_outcomes_len = market_position.market_outcome_sums.len();
    for index in 0..market_outcomes_len {
        if outcome_index == index {
            continue;
        }

        match for_outcome {
            true => {
                market_position.market_outcome_sums[index] = market_position.market_outcome_sums
                    [index]
                    .checked_sub(stake_matched as i128)
                    .ok_or(CoreError::ArithmeticError)?;
            }
            false => {
                market_position.market_outcome_sums[index] = market_position.market_outcome_sums
                    [index]
                    .checked_add(stake_matched as i128)
                    .ok_or(CoreError::ArithmeticError)?;
            }
        }
    }

    // update unmatched_exposures
    match for_outcome {
        true => {
            let market_outcomes_len = market_position.unmatched_exposures.len();
            for index in 0..market_outcomes_len {
                if outcome_index == index {
                    continue;
                }
                market_position.unmatched_exposures[index] = market_position.unmatched_exposures
                    [index]
                    .checked_sub(stake_matched)
                    .ok_or(CoreError::ArithmeticError)?;
            }
        }
        false => {
            market_position.unmatched_exposures[outcome_index] = market_position
                .unmatched_exposures[outcome_index]
                .checked_sub(unmatched_risk)
                .ok_or(CoreError::ArithmeticError)?;
        }
    }

    // total exposure change
    let total_exposure_change = total_exposure_before
        .checked_sub(market_position.total_exposure())
        .ok_or(CoreError::ArithmeticError)?;

    Ok(total_exposure_change)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::instructions::market_position;
    use crate::state::market_order_request_queue::mock_order_request;
    use test_case::test_case;

    struct OrderData {
        outcome_index: usize,
        price: f64,
        stake: u64,
        for_outcome: bool,
    }

    //
    // Matching orders of the same outcome
    //
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 3.05, stake: 100, for_outcome: true},
    OrderData{outcome_index: 0, price: 3.05, stake: 100, for_outcome: false}
    ]), vec![0,0,0] ; "For-Against: Same price and stakes")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 3.05, stake: 100, for_outcome: false},
    OrderData{outcome_index: 0, price: 3.05, stake: 100, for_outcome: true}
    ]), vec![0,0,0] ; "Against-For: Same price and stakes")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 2.0, stake: 100, for_outcome: true},
    OrderData{outcome_index: 0, price: 2.0, stake:  50, for_outcome: false}
    ]), vec![50,-50,-50] ; "For-Against: Same price, against stake is half")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 2.0, stake:  50, for_outcome: false},
    OrderData{outcome_index: 0, price: 2.0, stake: 100, for_outcome: true}
    ]), vec![50,-50,-50] ; "Against-For: Same price, against stake is half")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 2.0, stake:  50, for_outcome: true},
    OrderData{outcome_index: 0, price: 2.0, stake: 100, for_outcome: false}
    ]), vec![-50,50,50] ; "For-Against: Same price, for stake is half")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 2.0, stake: 100, for_outcome: false},
    OrderData{outcome_index: 0, price: 2.0, stake:  50, for_outcome: true}
    ]), vec![-50,50,50] ; "Against-For: Same price, for stake is half")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 11.0, stake:  10, for_outcome: true},
    OrderData{outcome_index: 0, price: 2.0,  stake: 100, for_outcome: false}
    ]), vec![0,90,90] ; "For-Against: Diff price, same stake")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 2.0,  stake: 100, for_outcome: false},
    OrderData{outcome_index: 0, price: 11.0, stake:  10, for_outcome: true}
    ]), vec![0,90,90] ; "Against-For: Diff price, same stake")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 11.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 0, price: 2.0,  stake: 10, for_outcome: false},
    OrderData{outcome_index: 0, price: 2.0,  stake: 20, for_outcome: false},
    OrderData{outcome_index: 0, price: 2.0,  stake: 30, for_outcome: false},
    OrderData{outcome_index: 0, price: 2.0,  stake: 40, for_outcome: false}
    ]), vec![0,90,90] ; "For-Against: Diff price, same stake but split")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 2.0,  stake: 10, for_outcome: false},
    OrderData{outcome_index: 0, price: 2.0,  stake: 20, for_outcome: false},
    OrderData{outcome_index: 0, price: 2.0,  stake: 30, for_outcome: false},
    OrderData{outcome_index: 0, price: 2.0,  stake: 40, for_outcome: false},
    OrderData{outcome_index: 0, price: 11.0, stake: 10, for_outcome: true}
    ]), vec![0,90,90] ; "Against-For: Diff price, same stake but split")]
    //
    // Matching orders of different outcomes
    //
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 1, price: 2.0, stake: 10, for_outcome: true}
    ]), vec![0,0,-20] ; "Same price (2.0), same stake, 2 different outcomes (0,1)")]
    #[test_case(Box::new([
    OrderData{outcome_index: 1, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 0, price: 2.0, stake: 10, for_outcome: true}
    ]), vec![0,0,-20] ; "Same price (2.0), same stake, 2 different outcomes (1,0)")]
    #[test_case(Box::new([
    OrderData{outcome_index: 1, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 2, price: 2.0, stake: 10, for_outcome: true}
    ]), vec![-20,0,0] ; "Same price (2.0), same stake, 2 different outcomes (1,2)")]
    #[test_case(Box::new([
    OrderData{outcome_index: 2, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 1, price: 2.0, stake: 10, for_outcome: true}
    ]), vec![-20,0,0] ; "Same price (2.0), same stake, 2 different outcomes (2,1)")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 2, price: 2.0, stake: 10, for_outcome: true}
    ]), vec![0,-20,0] ; "Same price (2.0), same stake, 2 different outcomes (0,2)")]
    #[test_case(Box::new([
    OrderData{outcome_index: 2, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 0, price: 2.0, stake: 10, for_outcome: true}
    ]), vec![0,-20,0] ; "Same price (2.0), same stake, 2 different outcomes (2,0)")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 1, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 2, price: 2.0, stake: 10, for_outcome: true}
    ]), vec![-10,-10,-10] ; "Same price (2.0), same stake, 3 different outcomes (0,1,2)")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 2, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 1, price: 2.0, stake: 10, for_outcome: true}
    ]), vec![-10,-10,-10] ; "Same price (2.0), same stake, 3 different outcomes (0,2,1)")]
    #[test_case(Box::new([
    OrderData{outcome_index: 1, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 0, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 2, price: 2.0, stake: 10, for_outcome: true}
    ]), vec![-10,-10,-10] ; "Same price (2.0), same stake, 3 different outcomes (1,0,2)")]
    #[test_case(Box::new([
    OrderData{outcome_index: 1, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 2, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 0, price: 2.0, stake: 10, for_outcome: true}
    ]), vec![-10,-10,-10] ; "Same price (2.0), same stake, 3 different outcomes (1,2,0)")]
    #[test_case(Box::new([
    OrderData{outcome_index: 2, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 0, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 1, price: 2.0, stake: 10, for_outcome: true}
    ]), vec![-10,-10,-10] ; "Same price (2.0), same stake, 3 different outcomes (2,0,1)")]
    #[test_case(Box::new([
    OrderData{outcome_index: 2, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 1, price: 2.0, stake: 10, for_outcome: true},
    OrderData{outcome_index: 0, price: 2.0, stake: 10, for_outcome: true}
    ]), vec![-10,-10,-10] ; "Same price (2.0), same stake, 3 different outcomes (2,1,0)")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 2.0, stake: 1000000, for_outcome: true},
    OrderData{outcome_index: 1, price: 2.0, stake: 1000000, for_outcome: true},
    OrderData{outcome_index: 2, price: 2.0, stake: 1000000, for_outcome: true},
    OrderData{outcome_index: 0, price: 2.0, stake: 1000000, for_outcome: false},
    OrderData{outcome_index: 1, price: 2.0, stake: 1000000, for_outcome: false},
    OrderData{outcome_index: 2, price: 2.0, stake: 1000000, for_outcome: false}
    ]), vec![0,0,0] ; "Same price, same stake, 3 different outcomes, then against them all to end up neutral")]
    #[test_case(Box::new([
    OrderData{outcome_index: 0, price: 2.0, stake: 1000000, for_outcome: true},
    OrderData{outcome_index: 0, price: 2.0, stake: 1000000, for_outcome: false},
    OrderData{outcome_index: 1, price: 2.0, stake: 1000000, for_outcome: true},
    OrderData{outcome_index: 1, price: 2.0, stake: 1000000, for_outcome: false},
    OrderData{outcome_index: 2, price: 2.0, stake: 1000000, for_outcome: true},
    OrderData{outcome_index: 2, price: 2.0, stake: 1000000, for_outcome: false}
    ]), vec![0,0,0] ; "Same price, same stake, 3 different outcomes, for and against them in order to end up neutral")]
    fn test_update_on_match(orders: Box<[OrderData]>, expected_position: Vec<i128>) {
        let mut market_position = market_position(vec![0_i128; 3], vec![0_u64; 3]);

        for order_data in orders.into_vec() {
            let order_request = mock_order_request(
                Pubkey::new_unique(),
                order_data.for_outcome,
                order_data.outcome_index as u16,
                order_data.stake,
                order_data.price,
            );

            market_position::update_on_order_request_creation(
                &mut market_position,
                order_request.market_outcome_index,
                order_request.for_outcome,
                order_request.stake,
                order_request.expected_price,
            )
            .expect("not expecting failure");

            let order = mock_order_from_order_request(
                Pubkey::new_unique(),
                order_request,
                Pubkey::new_unique(),
            );

            update_on_order_match(
                &mut market_position,
                &order,
                order_data.stake,
                order_data.price,
            )
            .expect("not expecting failure");
        }

        // Check market position
        assert_eq!(market_position.market_outcome_sums, expected_position);
    }

    fn market_position(
        market_outcome_sums: Vec<i128>,
        unmatched_exposures: Vec<u64>,
    ) -> MarketPosition {
        MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums,
            unmatched_exposures,
            payer: Pubkey::new_unique(),
            matched_risk_per_product: vec![],
            matched_risk: 0,
        }
    }
}
