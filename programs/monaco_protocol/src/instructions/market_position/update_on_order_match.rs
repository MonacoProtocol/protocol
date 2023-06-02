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
    let outcome_index = order.market_outcome_index as usize;
    let for_outcome = order.for_outcome;
    let unmatched_price = order.expected_price;

    let max_exposure = market_position.max_exposure();

    // update chosen outcome position
    let matched_risk = calculate_risk_from_stake(stake_matched, price_matched);
    let risk_change =
        calculate_risk_from_stake(stake_matched, unmatched_price).saturating_sub(matched_risk);

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

            market_position.outcome_max_exposure[outcome_index] = market_position
                .outcome_max_exposure[outcome_index]
                .checked_sub(risk_change)
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

    // max_exposure change
    let max_exposure_change = max_exposure
        .checked_sub(market_position.max_exposure())
        .ok_or(CoreError::ArithmeticError)?;

    Ok(max_exposure_change)
}

#[cfg(test)]
mod tests {
    use super::*;
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
            let order = order(
                order_data.outcome_index as u16,
                order_data.for_outcome,
                order_data.stake,
                order_data.price,
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

    fn order(
        market_outcome_index: u16,
        for_outcome: bool,
        stake: u64,
        expected_price: f64,
    ) -> Order {
        Order {
            purchaser: Default::default(),
            market: Default::default(),
            market_outcome_index,
            for_outcome,
            order_status: OrderStatus::Open,
            product: None,
            stake,
            voided_stake: 0u64,
            expected_price,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 0u64,
            payout: 0u64,
            payer: Pubkey::new_unique(),
            product_commission_rate: 0f64,
        }
    }

    fn market_position(
        market_outcome_sums: Vec<i128>,
        outcome_max_exposure: Vec<u64>,
    ) -> MarketPosition {
        MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums,
            outcome_max_exposure,
            payer: Pubkey::new_unique(),
            matched_risk_per_product: vec![],
            matched_risk: 0,
        }
    }
}
