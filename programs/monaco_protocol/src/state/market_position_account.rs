use crate::state::type_size::*;
use anchor_lang::prelude::*;
use std::convert::TryFrom;

#[account]
#[derive(Default)]
pub struct MarketPosition {
    pub purchaser: Pubkey,
    pub market: Pubkey,
    pub paid: bool,
    pub market_outcome_sums: Vec<i128>,
    pub unmatched_exposures: Vec<u64>,
    pub payer: Pubkey, // solana account fee payer
    pub matched_risk: u64,
    pub matched_risk_per_product: Vec<ProductMatchedRiskAndRate>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub struct ProductMatchedRiskAndRate {
    pub product: Pubkey,
    pub risk: u64,
    pub rate: f64,
}

impl ProductMatchedRiskAndRate {
    pub const MAX_LENGTH: usize = 20;
    pub const SIZE: usize = PUB_KEY_SIZE + F64_SIZE + U64_SIZE;
}

impl MarketPosition {
    pub fn size_for(number_of_market_outcomes: usize) -> usize {
        DISCRIMINATOR_SIZE
            + PUB_KEY_SIZE // purchaser
            + PUB_KEY_SIZE // market
            + BOOL_SIZE // paid
            + U64_SIZE // total_matched_stake
            + vec_size(I128_SIZE, number_of_market_outcomes) // market_outcome_sums
            + vec_size(U64_SIZE, number_of_market_outcomes) // unmatched_exposures
            + PUB_KEY_SIZE // payer
            + vec_size(ProductMatchedRiskAndRate::SIZE, ProductMatchedRiskAndRate::MAX_LENGTH)
        // number of products to track matched stake contributions for
    }

    pub fn total_exposure(&self) -> u64 {
        self.market_outcome_sums
            .iter()
            .map(|market_outcome_sum| {
                u64::try_from(market_outcome_sum.min(&0_i128).checked_neg().unwrap()).unwrap()
            })
            .zip(&self.unmatched_exposures)
            .map(|(postmatch_exposure, unmatched_exposure)| {
                unmatched_exposure.checked_add(postmatch_exposure).unwrap()
            })
            .max_by(|x, y| x.cmp(y))
            .unwrap()
    }
}

#[cfg(test)]
pub fn mock_market_position(number_of_market_outcomes: usize) -> MarketPosition {
    let mut market_position = MarketPosition::default();
    market_position
        .market_outcome_sums
        .resize(number_of_market_outcomes, 0_i128);
    market_position
        .unmatched_exposures
        .resize(number_of_market_outcomes, 0_u64);
    market_position
}

#[cfg(test)]
mod total_exposure_tests {
    use super::*;

    #[test]
    fn test_empty() {
        let mut market_position: MarketPosition = MarketPosition::default();
        market_position.unmatched_exposures = vec![0, 0, 0];
        market_position.market_outcome_sums = vec![0, 0, 0];

        assert_eq!(0, market_position.total_exposure());
    }

    #[test]
    fn test_only_unmatched_exposures() {
        let mut market_position: MarketPosition = MarketPosition::default();
        market_position.unmatched_exposures = vec![10, 20, 30];
        market_position.market_outcome_sums = vec![0, 0, 0];

        assert_eq!(30, market_position.total_exposure());
    }

    #[test]
    fn test_only_postmatch_exposures() {
        let mut market_position: MarketPosition = MarketPosition::default();
        market_position.unmatched_exposures = vec![0, 0, 0];
        market_position.market_outcome_sums = vec![20, -10, -10]; // match of 10 @ 3.0

        assert_eq!(10, market_position.total_exposure());
    }

    #[test]
    fn test_both_exposures() {
        let mut market_position: MarketPosition = MarketPosition::default();
        market_position.unmatched_exposures = vec![10, 20, 30];
        market_position.market_outcome_sums = vec![20, -10, -10]; // match of 10 @ 3.0

        assert_eq!(40, market_position.total_exposure());
    }

    #[test]
    #[should_panic]
    fn test_overflow() {
        let mut market_position: MarketPosition = MarketPosition::default();
        let loss_bigger_than_u64 = (u64::MAX as i128)
            .checked_neg()
            .unwrap()
            .checked_sub(1)
            .unwrap();

        market_position.unmatched_exposures = vec![0, 0, 0];
        market_position.market_outcome_sums = vec![0, 0, loss_bigger_than_u64];

        market_position.total_exposure();
    }
}
