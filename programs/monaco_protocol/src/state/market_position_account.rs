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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
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
