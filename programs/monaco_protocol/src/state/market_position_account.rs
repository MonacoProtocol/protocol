use crate::error::CoreError;
use crate::instructions::calculate_risk_from_stake;
use crate::state::type_size::*;
use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct MarketPosition {
    pub purchaser: Pubkey,
    pub market: Pubkey,
    pub paid: bool,
    pub market_outcome_sums: Vec<i128>,
    pub outcome_max_exposure: Vec<u64>,
    pub offset: u64,
}

impl MarketPosition {
    pub fn size_for(number_of_market_outcomes: usize) -> usize {
        DISCRIMINATOR_SIZE
            + PUB_KEY_SIZE // purchaser
            + PUB_KEY_SIZE // market
            + BOOL_SIZE // paid
            + vec_size(I128_SIZE, number_of_market_outcomes) // market_outcome_sums
            + vec_size(U64_SIZE, number_of_market_outcomes) // outcome_max_exposure
            + U64_SIZE // offset
    }

    pub fn exposure(&self) -> i128 {
        (*self
            .market_outcome_sums
            .iter()
            .min_by(|x, y| x.cmp(y))
            .unwrap())
        .min(0_i128)
    }

    pub fn max_exposure(&self) -> u64 {
        *self
            .outcome_max_exposure
            .iter()
            .max_by(|x, y| x.cmp(y))
            .unwrap()
    }

    pub fn update_on_match(
        &mut self,
        market_outcome_index: usize,
        for_outcome: bool,
        stake: u64,
        price: f64,
        unmatched_price: f64,
    ) -> Result<u64> {
        let max_exposure = self.max_exposure();

        // update chosen outcome position
        let risk = calculate_risk_from_stake(stake, price);
        let risk_change = calculate_risk_from_stake(stake, unmatched_price).saturating_sub(risk);

        match for_outcome {
            true => {
                self.market_outcome_sums[market_outcome_index] = self.market_outcome_sums
                    [market_outcome_index]
                    .checked_add(risk as i128)
                    .ok_or(CoreError::ArithmeticError)?;
            }
            false => {
                self.market_outcome_sums[market_outcome_index] = self.market_outcome_sums
                    [market_outcome_index]
                    .checked_sub(risk as i128)
                    .ok_or(CoreError::ArithmeticError)?;

                self.outcome_max_exposure[market_outcome_index] = self.outcome_max_exposure
                    [market_outcome_index]
                    .checked_sub(risk_change)
                    .ok_or(CoreError::ArithmeticError)?;
            }
        }

        // update other outcome positions
        let market_outcomes_len = self.market_outcome_sums.len();
        for index in 0..market_outcomes_len {
            if market_outcome_index == index {
                continue;
            }

            match for_outcome {
                true => {
                    self.market_outcome_sums[index] = self.market_outcome_sums[index]
                        .checked_sub(stake as i128)
                        .ok_or(CoreError::ArithmeticError)?;
                }
                false => {
                    self.market_outcome_sums[index] = self.market_outcome_sums[index]
                        .checked_add(stake as i128)
                        .ok_or(CoreError::ArithmeticError)?;
                }
            }
        }

        // max_exposure change
        let max_exposure_change = max_exposure
            .checked_sub(self.max_exposure())
            .ok_or(CoreError::ArithmeticError)?;

        // offset change
        self.offset = self
            .offset
            .checked_sub(
                risk_change
                    .checked_sub(max_exposure_change)
                    .ok_or(CoreError::ArithmeticError)?,
            )
            .ok_or(CoreError::ArithmeticError)?;

        Ok(max_exposure_change)
    }

    pub fn update_on_creation(
        &mut self,
        market_outcome_index: usize,
        for_outcome: bool,
        exposure: u64,
    ) -> Result<u64> {
        let max_exposure = self.max_exposure();

        match for_outcome {
            true => {
                let market_outcomes_len = self.outcome_max_exposure.len();
                for index in 0..market_outcomes_len {
                    if market_outcome_index == index {
                        continue;
                    }
                    self.outcome_max_exposure[index] = self.outcome_max_exposure[index]
                        .checked_add(exposure)
                        .ok_or(CoreError::ArithmeticError)?;
                }
            }
            false => {
                self.outcome_max_exposure[market_outcome_index] = self.outcome_max_exposure
                    [market_outcome_index]
                    .checked_add(exposure)
                    .ok_or(CoreError::ArithmeticError)?;
            }
        }

        // max_exposure change
        let max_exposure_change = self
            .max_exposure()
            .checked_sub(max_exposure)
            .ok_or(CoreError::ArithmeticError)?;

        // offset change
        self.offset = self
            .offset
            .checked_add(
                exposure
                    .checked_sub(max_exposure_change)
                    .ok_or(CoreError::ArithmeticError)?,
            )
            .ok_or(CoreError::ArithmeticError)?;

        Ok(max_exposure_change)
    }

    pub fn update_on_cancelation(
        &mut self,
        market_outcome_index: usize,
        for_outcome: bool,
        exposure: u64,
    ) -> Result<u64> {
        let max_exposure = self.max_exposure();

        match for_outcome {
            true => {
                let market_outcomes_len = self.outcome_max_exposure.len();
                for index in 0..market_outcomes_len {
                    if market_outcome_index == index {
                        continue;
                    }
                    self.outcome_max_exposure[index] = self.outcome_max_exposure[index]
                        .checked_sub(exposure)
                        .ok_or(CoreError::ArithmeticError)?;
                }
            }
            false => {
                self.outcome_max_exposure[market_outcome_index] = self.outcome_max_exposure
                    [market_outcome_index]
                    .checked_sub(exposure)
                    .ok_or(CoreError::ArithmeticError)?;
            }
        }

        // max_exposure change
        let max_exposure_change = max_exposure
            .checked_sub(self.max_exposure())
            .ok_or(CoreError::ArithmeticError)?;

        // offset change
        self.offset = self
            .offset
            .checked_sub(
                exposure
                    .checked_sub(max_exposure_change)
                    .ok_or(CoreError::ArithmeticError)?,
            )
            .ok_or(CoreError::ArithmeticError)?;

        Ok(max_exposure_change)
    }

    pub fn apply_offset(&mut self, amount: u64) -> u64 {
        let offset = self.offset;
        self.offset = self.offset.saturating_sub(amount);
        amount.saturating_sub(offset)
    }
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
    // Orderting on the same outcome
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
    // Orderting on different outcomes
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
        let mut market_position = market_position(vec![0_i128; 3], vec![0_u64; 3], 0);

        for order in orders.into_vec() {
            market_position
                .update_on_match(
                    order.outcome_index,
                    order.for_outcome,
                    order.stake,
                    order.price,
                    order.price,
                )
                .expect("not expecting failure");
        }

        // Check market position
        assert_eq!(market_position.market_outcome_sums, expected_position);
    }

    #[test_case(50, 0, 50, 0 ; "offset is zero")]
    #[test_case(50, 1, 49, 0 ; "offset is 1")]
    #[test_case(50, 30, 20, 0 ; "offset is more than half")]
    #[test_case(50, 50, 0, 0 ; "offset equals payout")]
    #[test_case(50, 51, 0, 1 ; "offset is 1 more than payout")]
    #[test_case(50, 100, 0, 50  ; "offset is much more than payout")]
    fn test_calculate_amended_payout(
        payout: u64,
        offset: u64,
        expected_amended_payout: u64,
        expected_offset: u64,
    ) {
        let mut market_position = market_position(vec![0_i128; 3], vec![0_u64; 3], offset);
        assert_eq!(
            market_position.apply_offset(payout),
            expected_amended_payout
        );
        assert_eq!(market_position.offset, expected_offset)
    }

    fn market_position(
        market_outcome_sums: Vec<i128>,
        outcome_max_exposure: Vec<u64>,
        offset: u64,
    ) -> MarketPosition {
        MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            market_outcome_sums,
            outcome_max_exposure,
            offset,
            paid: false,
        }
    }
}
