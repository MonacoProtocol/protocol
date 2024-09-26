use crate::error::CoreError;
use crate::instructions::{
    calculate_for_payout, calculate_price_cross, calculate_stake_from_payout,
};
use crate::state::market_account::MarketOrderBehaviour;
use crate::state::type_size::*;
use anchor_lang::prelude::*;
use rust_decimal::prelude::ToPrimitive;
use std::cmp::Ordering;
use std::string::ToString;

#[account]
pub struct MarketLiquidities {
    pub market: Pubkey,
    pub enable_cross_matching: bool,
    pub stake_matched_total: u64,
    pub liquidities_for: Vec<MarketOutcomePriceLiquidity>,
    pub liquidities_against: Vec<MarketOutcomePriceLiquidity>,
}

impl MarketLiquidities {
    const LIQUIDITIES_VEC_LENGTH: usize = 30_usize;
    pub const SIZE: usize = DISCRIMINATOR_SIZE
        + PUB_KEY_SIZE // market
        + BOOL_SIZE // enable_cross_matching
        + U64_SIZE // stake_matched_total
        + vec_size(MarketOutcomePriceLiquidity::SIZE, MarketLiquidities::LIQUIDITIES_VEC_LENGTH) // for
        + vec_size(MarketOutcomePriceLiquidity::SIZE, MarketLiquidities::LIQUIDITIES_VEC_LENGTH); // against

    pub fn get_liquidity_for(
        &self,
        outcome: u16,
        price: f64,
    ) -> Option<&MarketOutcomePriceLiquidity> {
        self.liquidities_for
            .binary_search_by(Self::sorter_for(outcome, price, &[]))
            .ok()
            .map(|index| &self.liquidities_for[index])
    }

    pub fn get_liquidity_against(
        &self,
        outcome: u16,
        price: f64,
    ) -> Option<&MarketOutcomePriceLiquidity> {
        self.liquidities_against
            .binary_search_by(Self::sorter_against(outcome, price, &[]))
            .ok()
            .map(|index| &self.liquidities_against[index])
    }

    pub fn add_liquidity_for(&mut self, outcome: u16, price: f64, liquidity: u64) -> Result<()> {
        let is_full = self.is_full();
        let liquidities = &mut self.liquidities_for;
        let sources = [];
        Self::add_liquidity(
            liquidities,
            Self::sorter_for(outcome, price, &sources),
            outcome,
            price,
            &sources,
            liquidity,
            is_full,
        )
    }

    pub fn add_liquidity_against(
        &mut self,
        outcome: u16,
        price: f64,
        liquidity: u64,
    ) -> Result<()> {
        let is_full = self.is_full();
        let liquidities = &mut self.liquidities_against;
        let sources = [];
        Self::add_liquidity(
            liquidities,
            Self::sorter_against(outcome, price, &sources),
            outcome,
            price,
            &sources,
            liquidity,
            is_full,
        )
    }

    fn add_liquidity(
        liquidities: &mut Vec<MarketOutcomePriceLiquidity>,
        search_function: impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering,
        outcome: u16,
        price: f64,
        sources: &[LiquiditySource],
        liquidity: u64,
        is_full: bool,
    ) -> Result<()> {
        match liquidities.binary_search_by(search_function) {
            Ok(index) => {
                let value = &mut liquidities[index];
                value.liquidity = value
                    .liquidity
                    .checked_add(liquidity)
                    .ok_or(CoreError::MarketLiquiditiesUpdateError)?
            }
            Err(index) => {
                if is_full {
                    return Err(error!(CoreError::MarketLiquiditiesIsFull));
                } else {
                    liquidities.insert(
                        index,
                        MarketOutcomePriceLiquidity {
                            outcome,
                            price,
                            liquidity,
                            sources: sources.to_vec(),
                        },
                    )
                }
            }
        }

        Ok(())
    }

    // this method does not validate parameters so value returned might not be real
    // assumption is that all (n-1) different sources were passed for the n-outcome market and the price is of the n-th outcome
    pub fn get_cross_liquidity_for(&self, sources: &[LiquiditySource], price: f64) -> u64 {
        let amount = calculate_stake_from_payout(
            sources
                .iter()
                .map(|liquidity_source| {
                    self.get_liquidity_against(liquidity_source.outcome, liquidity_source.price)
                        .map(|l| calculate_for_payout(l.liquidity, l.price))
                        .unwrap_or(0_u64)
                })
                .min()
                .unwrap_or(0_u64),
            price,
        );
        amount / 1000 * 1000 // erase 3 last digits, so we don't have rounding on match
    }

    // this method does not validate parameters so value returned might not be real
    // assumption is that all (n-1) different sources were passed for the n-outcome market and the price is of the n-th outcome
    pub fn get_cross_liquidity_against(&self, sources: &[LiquiditySource], price: f64) -> u64 {
        let amount = calculate_stake_from_payout(
            sources
                .iter()
                .map(|liquidity_source| {
                    self.get_liquidity_for(liquidity_source.outcome, liquidity_source.price)
                        .map(|l| calculate_for_payout(l.liquidity, l.price))
                        .unwrap_or(0_u64)
                })
                .min()
                .unwrap_or(0_u64),
            price,
        );
        amount / 1000 * 1000 // erase 3 last digits, so we don't have rounding on match
    }

    // recalculates cross liquidity for a given sources
    // this method does not validate parameters so value returned might not be real
    // assumption is that all (n-1) different sources were passed for the n-outcome market and the price is of the n-th outcome
    pub fn update_cross_liquidity_for(&mut self, sources: &[LiquiditySource]) {
        // silly way of detecting which outcome is supposed to be updated
        // sum of all the outcomes minus sum of all provided ones equals the one we want
        let outcome_count = sources.len().to_u16().unwrap();
        let outcome = (0_u16..=outcome_count).sum::<u16>() - Self::source_outcomes_sum(sources);

        let source_prices = sources
            .iter()
            .map(|source| source.price)
            .collect::<Vec<f64>>();
        if let Some(cross_price) = calculate_price_cross(&source_prices) {
            let cross_liquidity = self.get_cross_liquidity_for(sources, cross_price);
            Self::set_liquidity(
                &mut self.liquidities_for,
                Self::sorter_for(outcome, cross_price, sources),
                outcome,
                cross_price,
                cross_liquidity,
                sources.to_vec(),
            );
        }
    }

    // recalculates cross liquidity for a given sources
    // this method does not validate parameters so value returned might not be real
    // assumption is that all (n-1) different sources were passed for the n-outcome market and the price is of the n-th outcome
    pub fn update_cross_liquidity_against(&mut self, sources: &[LiquiditySource]) {
        // silly way of detecting which outcome is supposed to be updated
        // sum of all the outcomes minus sum of all provided ones equals the one we want
        let outcome_count = sources.len().to_u16().unwrap();
        let outcome = (0_u16..=outcome_count).sum::<u16>() - Self::source_outcomes_sum(sources);

        let source_prices = sources
            .iter()
            .map(|source| source.price)
            .collect::<Vec<f64>>();
        if let Some(cross_price) = calculate_price_cross(&source_prices) {
            let cross_liquidity = self.get_cross_liquidity_against(sources, cross_price);
            Self::set_liquidity(
                &mut self.liquidities_against,
                Self::sorter_against(outcome, cross_price, sources),
                outcome,
                cross_price,
                cross_liquidity,
                sources.to_vec(),
            )
        }
    }

    fn set_liquidity(
        liquidities: &mut Vec<MarketOutcomePriceLiquidity>,
        search_function: impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering,
        outcome: u16,
        price: f64,
        liquidity: u64,
        sources: Vec<LiquiditySource>,
    ) {
        match liquidities.binary_search_by(search_function) {
            Ok(index) => {
                if liquidity == 0 {
                    liquidities.remove(index);
                } else {
                    liquidities[index].liquidity = liquidity;
                }
            }
            Err(index) => {
                if liquidity > 0 {
                    liquidities.insert(
                        index,
                        MarketOutcomePriceLiquidity {
                            outcome,
                            price,
                            liquidity,
                            sources,
                        },
                    )
                }
            }
        }
    }

    // recalculates all existing cross liquidities for a given source
    // removes elements with zero amount, but does NOT add new ones
    // assumption is that all  existing cross liquidities are correct
    pub fn update_all_cross_liquidity_for(&mut self, liquidity_source: &LiquiditySource) {
        let indexed_liquidity_amounts = self
            .liquidities_for
            .iter()
            .enumerate()
            .filter(|(_, liquidity)| liquidity.sources.contains(liquidity_source))
            .map(|(index, liquidity)| {
                (
                    index,
                    self.get_cross_liquidity_for(&liquidity.sources, liquidity.price),
                )
            })
            .collect::<Vec<(usize, u64)>>();

        // bigger indexes need to be removed first
        for (index, liquidity_amount) in indexed_liquidity_amounts.iter().rev() {
            if *liquidity_amount == 0 {
                self.liquidities_for.remove(*index);
            } else {
                self.liquidities_for[*index].liquidity = *liquidity_amount;
            }
        }
    }

    // recalculates all existing cross liquidities for a given source
    // removes elements with zero amount, but does NOT add new ones
    // assumption is that all  existing cross liquidities are correct
    pub fn update_all_cross_liquidity_against(&mut self, liquidity_source: &LiquiditySource) {
        let indexed_liquidity_amounts = self
            .liquidities_against
            .iter()
            .enumerate()
            .filter(|(_, liquidity)| liquidity.sources.contains(liquidity_source))
            .map(|(index, liquidity)| {
                (
                    index,
                    self.get_cross_liquidity_against(&liquidity.sources, liquidity.price),
                )
            })
            .collect::<Vec<(usize, u64)>>();

        // bigger indexes need to be removed first
        for (index, liquidity_amount) in indexed_liquidity_amounts.iter().rev() {
            if *liquidity_amount == 0 {
                self.liquidities_against.remove(*index);
            } else {
                self.liquidities_against[*index].liquidity = *liquidity_amount;
            }
        }
    }

    pub fn remove_liquidity_for(
        &mut self,
        outcome: u16,
        price: f64,
        liquidity: u64,
    ) -> Result<u64> {
        let liquidities = &mut self.liquidities_for;
        let sorter = Self::sorter_for(outcome, price, &[]);
        Self::remove_liquidity(liquidities, sorter, liquidity)
    }

    pub fn remove_liquidity_against(
        &mut self,
        outcome: u16,
        price: f64,
        liquidity: u64,
    ) -> Result<u64> {
        let liquidities = &mut self.liquidities_against;
        let sorter = Self::sorter_against(outcome, price, &[]);
        Self::remove_liquidity(liquidities, sorter, liquidity)
    }

    fn remove_liquidity(
        liquidities: &mut Vec<MarketOutcomePriceLiquidity>,
        search_function: impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering,
        liquidity: u64,
    ) -> Result<u64> {
        match liquidities.binary_search_by(search_function) {
            Ok(index) => {
                let value = &mut liquidities[index];
                let liquidity_removed = liquidity.min(value.liquidity);
                value.liquidity = value
                    .liquidity
                    .checked_sub(liquidity_removed)
                    .ok_or(CoreError::MarketLiquiditiesUpdateError)?;
                if value.liquidity == 0 {
                    liquidities.remove(index);
                }
                Ok(liquidity_removed)
            }
            Err(_) => Err(error!(CoreError::MarketLiquiditiesUpdateError)),
        }
    }

    fn sorter_for(
        outcome: u16,
        price: f64,
        sources: &[LiquiditySource],
    ) -> impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering + '_ {
        move |liquidity| {
            #[allow(clippy::comparison_chain)]
            if outcome < liquidity.outcome {
                return Ordering::Greater;
            } else if liquidity.outcome < outcome {
                return Ordering::Less;
            }

            if price < liquidity.price {
                return Ordering::Greater;
            } else if liquidity.price < price {
                return Ordering::Less;
            }

            let source_prices = Self::source_prices(sources);
            let liquidity_source_prices = Self::source_prices(&liquidity.sources);
            if source_prices < liquidity_source_prices {
                return Ordering::Greater;
            } else if liquidity_source_prices < source_prices {
                return Ordering::Less;
            }

            Ordering::Equal
        }
    }

    fn sorter_against(
        outcome: u16,
        price: f64,
        sources: &[LiquiditySource],
    ) -> impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering + '_ {
        move |liquidity| {
            #[allow(clippy::comparison_chain)]
            if outcome < liquidity.outcome {
                return Ordering::Less;
            } else if liquidity.outcome < outcome {
                return Ordering::Greater;
            }

            if price < liquidity.price {
                return Ordering::Less;
            } else if liquidity.price < price {
                return Ordering::Greater;
            }

            let source_prices = Self::source_prices(sources);
            let liquidity_source_prices = Self::source_prices(&liquidity.sources);
            if source_prices < liquidity_source_prices {
                return Ordering::Greater;
            } else if liquidity_source_prices < source_prices {
                return Ordering::Less;
            }

            Ordering::Equal
        }
    }

    fn source_prices(sources: &[LiquiditySource]) -> Vec<f64> {
        sources.iter().map(|source| source.price).collect()
    }

    fn source_outcomes_sum(sources: &[LiquiditySource]) -> u16 {
        sources.iter().map(|source| source.outcome).sum()
    }

    fn is_full(&self) -> bool {
        Self::LIQUIDITIES_VEC_LENGTH + Self::LIQUIDITIES_VEC_LENGTH
            <= self.liquidities_for.len() + self.liquidities_against.len()
    }

    pub fn update_stake_matched_total(&mut self, stake_matched: u64) -> Result<()> {
        if stake_matched > 0_u64 {
            self.stake_matched_total = self
                .stake_matched_total
                .checked_add(stake_matched)
                .ok_or(CoreError::MarketLiquiditiesUpdateError)?;
        }
        Ok(())
    }

    pub fn move_to_inplay(&mut self, market_event_start_order_behaviour: &MarketOrderBehaviour) {
        // Reset liquidities when market moves to inplay if that's the desired behaviour
        if market_event_start_order_behaviour.eq(&MarketOrderBehaviour::CancelUnmatched) {
            self.liquidities_for = Vec::new();
            self.liquidities_against = Vec::new();
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, PartialEq)]
pub struct LiquiditySource {
    pub outcome: u16,
    pub price: f64,
}

impl LiquiditySource {
    pub fn new(outcome: u16, price: f64) -> LiquiditySource {
        LiquiditySource { outcome, price }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, PartialEq)]
pub struct MarketOutcomePriceLiquidity {
    pub outcome: u16,
    pub price: f64,
    pub sources: Vec<LiquiditySource>,
    pub liquidity: u64,
}

impl MarketOutcomePriceLiquidity {
    pub const SIZE: usize = U16_SIZE // outcome
        + F64_SIZE // price
        + vec_size(U16_SIZE + F64_SIZE, 3) // sources: sized to work for 3 and 4 way markets
        + U64_SIZE; // liquidity
}

#[cfg(test)]
pub fn mock_market_liquidities(market_pk: Pubkey) -> MarketLiquidities {
    MarketLiquidities {
        market: market_pk,
        enable_cross_matching: true,
        liquidities_for: Vec::new(),
        liquidities_against: Vec::new(),
        stake_matched_total: 0_u64,
    }
}

#[cfg(test)]
pub fn mock_liquidity(outcome: u16, price: f64, liquidity: u64) -> MarketOutcomePriceLiquidity {
    MarketOutcomePriceLiquidity {
        outcome,
        price,
        sources: Vec::new(),
        liquidity,
    }
}

#[cfg(test)]
pub fn mock_liquidity_with_sources(
    outcome: u16,
    price: f64,
    sources: &[LiquiditySource],
    liquidity: u64,
) -> MarketOutcomePriceLiquidity {
    MarketOutcomePriceLiquidity {
        outcome,
        price,
        sources: sources.to_vec(),
        liquidity,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_liquidity() {
        let sources01 = [LiquiditySource::new(0, 2.8), LiquiditySource::new(1, 2.8)];
        let mut mls = mock_market_liquidities(Pubkey::default());

        mls.add_liquidity_for(0, 2.8, 5_000).unwrap();
        mls.add_liquidity_for(0, 2.8, 5_000).unwrap();
        mls.add_liquidity_for(0, 2.9, 15_000).unwrap();
        mls.add_liquidity_for(1, 2.8, 20_000).unwrap();
        mls.add_liquidity_for(2, 2.8, 25_000).unwrap();
        mls.add_liquidity_for(2, 3.5, 30_000).unwrap();

        mls.add_liquidity_against(0, 2.8, 5_000).unwrap();
        mls.add_liquidity_against(0, 2.8, 5_000).unwrap();
        mls.add_liquidity_against(0, 2.9, 15_000).unwrap();
        mls.add_liquidity_against(1, 2.8, 20_000).unwrap();
        mls.add_liquidity_against(2, 2.8, 25_000).unwrap();
        mls.add_liquidity_against(2, 3.5, 30_000).unwrap();

        mls.update_cross_liquidity_for(&sources01);
        mls.update_cross_liquidity_against(&sources01);

        // the order of the results is important
        assert_eq!(
            vec![
                mock_liquidity(0, 2.8, 10_000),
                mock_liquidity(0, 2.9, 15_000),
                mock_liquidity(1, 2.8, 20_000),
                mock_liquidity(2, 2.8, 25_000),
                mock_liquidity(2, 3.5, 30_000),
                mock_liquidity_with_sources(2, 3.5, &sources01, 8_000),
            ],
            mls.liquidities_for
        );
        // the order of the results is important
        assert_eq!(
            vec![
                mock_liquidity(2, 3.5, 30_000),
                mock_liquidity_with_sources(2, 3.5, &sources01, 8_000),
                mock_liquidity(2, 2.8, 25_000),
                mock_liquidity(1, 2.8, 20_000),
                mock_liquidity(0, 2.9, 15_000),
                mock_liquidity(0, 2.8, 10_000),
            ],
            mls.liquidities_against
        );
    }

    #[test]
    fn test_add_liquidity_when_full() {
        let mut market_liquidities = mock_market_liquidities(Pubkey::default());

        let mut price = 2.01;
        for _ in 0..60 {
            market_liquidities.add_liquidity_for(0, price, 1).unwrap();
            price += 0.01;
        }

        let result = market_liquidities.add_liquidity_for(0, price, 1);
        assert!(result.is_err());
        assert_eq!(Err(error!(CoreError::MarketLiquiditiesIsFull)), result);
    }

    #[test]
    fn test_update_cross_liquidity_for() {
        let sources1 = [LiquiditySource::new(0, 2.7), LiquiditySource::new(1, 3.0)];
        let sources2 = [LiquiditySource::new(0, 3.0), LiquiditySource::new(1, 2.7)];

        let mut mls: MarketLiquidities = mock_market_liquidities(Pubkey::default());
        mls.add_liquidity_against(0, 2.700, 100_000).unwrap();
        mls.add_liquidity_against(1, 3.000, 90_000).unwrap();
        mls.add_liquidity_against(0, 3.000, 45_000).unwrap();
        mls.add_liquidity_against(1, 2.700, 50_000).unwrap();

        mls.update_cross_liquidity_for(&sources1);
        mls.update_cross_liquidity_for(&sources2);

        assert_eq!(
            vec![
                mock_liquidity_with_sources(2, 3.375, &sources1, 80_000,),
                mock_liquidity_with_sources(2, 3.375, &sources2, 40_000,),
            ],
            mls.liquidities_for
        );

        mls.remove_liquidity_against(0, 2.700, 100_000).unwrap();
        mls.update_cross_liquidity_for(&sources1);
        mls.update_cross_liquidity_for(&sources2);

        assert_eq!(
            vec![mock_liquidity_with_sources(2, 3.375, &sources2, 40_000,),],
            mls.liquidities_for
        );
    }

    #[test]
    fn test_update_cross_liquidity_against() {
        let sources1 = [LiquiditySource::new(0, 2.7), LiquiditySource::new(1, 3.0)];
        let sources2 = [LiquiditySource::new(0, 3.0), LiquiditySource::new(1, 2.7)];

        let mut mls: MarketLiquidities = mock_market_liquidities(Pubkey::default());
        mls.add_liquidity_for(0, 2.700, 100_000).unwrap();
        mls.add_liquidity_for(1, 3.000, 90_000).unwrap();
        mls.add_liquidity_for(0, 3.000, 45_000).unwrap();
        mls.add_liquidity_for(1, 2.700, 50_000).unwrap();

        mls.update_cross_liquidity_against(&sources1);
        mls.update_cross_liquidity_against(&sources2);

        assert_eq!(
            vec![
                mock_liquidity_with_sources(2, 3.375, &sources1, 80_000,),
                mock_liquidity_with_sources(2, 3.375, &sources2, 40_000,),
            ],
            mls.liquidities_against
        );

        mls.remove_liquidity_for(0, 2.700, 100_000).unwrap();
        mls.update_cross_liquidity_against(&sources1);
        mls.update_cross_liquidity_against(&sources2);

        assert_eq!(
            vec![mock_liquidity_with_sources(2, 3.375, &sources2, 40_000,),],
            mls.liquidities_against
        );
    }

    #[test]
    fn test_remove_liquidity() {
        let mut mls: MarketLiquidities = MarketLiquidities {
            market: Pubkey::default(),
            enable_cross_matching: true,
            liquidities_for: vec![
                mock_liquidity(0, 2.111, 1001),
                mock_liquidity(1, 2.111, 2001),
                mock_liquidity(2, 2.111, 3001),
            ],
            liquidities_against: vec![
                mock_liquidity(2, 2.111, 3001),
                mock_liquidity(1, 2.111, 2001),
                mock_liquidity(0, 2.111, 1001),
            ],
            stake_matched_total: 0_u64,
        };

        mls.remove_liquidity_for(0, 2.111, 200).unwrap();
        mls.remove_liquidity_for(1, 2.111, 200).unwrap();
        mls.remove_liquidity_for(2, 2.111, 200).unwrap();

        mls.remove_liquidity_against(0, 2.111, 200).unwrap();
        mls.remove_liquidity_against(1, 2.111, 200).unwrap();
        mls.remove_liquidity_against(2, 2.111, 200).unwrap();

        assert_eq!(
            vec![
                mock_liquidity(0, 2.111, 801),
                mock_liquidity(1, 2.111, 1801),
                mock_liquidity(2, 2.111, 2801),
            ],
            mls.liquidities_for
        );
        assert_eq!(
            vec![
                mock_liquidity(2, 2.111, 2801),
                mock_liquidity(1, 2.111, 1801),
                mock_liquidity(0, 2.111, 801),
            ],
            mls.liquidities_against
        );
    }

    #[test]
    fn test_get_liquidity_for() {
        let market_liquidities: MarketLiquidities = MarketLiquidities {
            market: Pubkey::default(),
            enable_cross_matching: true,
            liquidities_for: vec![
                mock_liquidity(0, 2.30, 1001),
                mock_liquidity(0, 2.31, 1002),
                mock_liquidity(0, 2.32, 1003),
                mock_liquidity(0, 2.33, 1004),
            ],
            liquidities_against: vec![],
            stake_matched_total: 0_u64,
        };

        assert_eq!(
            1002,
            market_liquidities
                .get_liquidity_for(0, 2.31)
                .unwrap()
                .liquidity
        );
        assert_eq!(None, market_liquidities.get_liquidity_for(0, 2.315));
    }

    #[test]
    fn test_get_liquidity_against() {
        let market_liquidities: MarketLiquidities = MarketLiquidities {
            market: Pubkey::default(),
            enable_cross_matching: true,
            liquidities_for: vec![],
            liquidities_against: vec![
                mock_liquidity(0, 2.33, 1004),
                mock_liquidity(0, 2.32, 1003),
                mock_liquidity(0, 2.31, 1002),
                mock_liquidity(0, 2.30, 1001),
            ],
            stake_matched_total: 0_u64,
        };

        assert_eq!(
            1002,
            market_liquidities
                .get_liquidity_against(0, 2.31)
                .unwrap()
                .liquidity
        );
        assert_eq!(None, market_liquidities.get_liquidity_against(0, 2.315));
    }
}

#[cfg(test)]
mod update_all_cross_liquidity {
    use super::*;

    #[test]
    fn test_for() {
        let market_pk = Pubkey::new_unique();
        let mut mls = mock_market_liquidities(market_pk);
        mls.add_liquidity_for(0, 3.0, 100_000).unwrap();
        for price in [3.5, 4.0, 4.5] {
            mls.add_liquidity_for(1, price, 100_000).unwrap();
            mls.update_cross_liquidity_against(&[
                LiquiditySource::new(0, 3.0),
                LiquiditySource::new(1, price),
            ]);
        }

        assert_eq!(
            vec![
                mock_liquidity(0, 3.0, 100_000),
                mock_liquidity(1, 3.5, 100_000),
                mock_liquidity(1, 4.0, 100_000),
                mock_liquidity(1, 4.5, 100_000),
            ],
            mls.liquidities_for
        );

        let sources1 = [LiquiditySource::new(0, 3.0), LiquiditySource::new(1, 3.5)];
        let sources2 = [LiquiditySource::new(0, 3.0), LiquiditySource::new(1, 4.0)];
        let sources3 = [LiquiditySource::new(0, 3.0), LiquiditySource::new(1, 4.5)];

        assert_eq!(
            vec![
                mock_liquidity_with_sources(2, 2.625, &sources1, 114_000),
                mock_liquidity_with_sources(2, 2.4, &sources2, 125_000),
                mock_liquidity_with_sources(2, 2.25, &sources3, 133_000),
            ],
            mls.liquidities_against
        );

        mls.remove_liquidity_for(0, 3.0, 100_000).unwrap();
        mls.update_all_cross_liquidity_against(&LiquiditySource::new(0, 3.0));

        assert_eq!(
            Vec::<MarketOutcomePriceLiquidity>::new(),
            mls.liquidities_against
        );
    }

    #[test]
    fn test_against() {
        let market_pk = Pubkey::new_unique();
        let mut mls = mock_market_liquidities(market_pk);
        mls.add_liquidity_against(0, 3.0, 100_000).unwrap();
        for price in [3.5, 4.0, 4.5] {
            mls.add_liquidity_against(1, price, 100_000).unwrap();
            mls.update_cross_liquidity_for(&[
                LiquiditySource::new(0, 3.0),
                LiquiditySource::new(1, price),
            ]);
        }

        assert_eq!(
            vec![
                mock_liquidity(1, 4.5, 100_000),
                mock_liquidity(1, 4.0, 100_000),
                mock_liquidity(1, 3.5, 100_000),
                mock_liquidity(0, 3.0, 100_000),
            ],
            mls.liquidities_against
        );

        let sources1 = [LiquiditySource::new(0, 3.0), LiquiditySource::new(1, 3.5)];
        let sources2 = [LiquiditySource::new(0, 3.0), LiquiditySource::new(1, 4.0)];
        let sources3 = [LiquiditySource::new(0, 3.0), LiquiditySource::new(1, 4.5)];

        assert_eq!(
            vec![
                mock_liquidity_with_sources(2, 2.25, &sources3, 133_000),
                mock_liquidity_with_sources(2, 2.4, &sources2, 125_000),
                mock_liquidity_with_sources(2, 2.625, &sources1, 114_000),
            ],
            mls.liquidities_for
        );

        mls.remove_liquidity_against(0, 3.0, 100_000).unwrap();
        mls.update_all_cross_liquidity_for(&LiquiditySource::new(0, 3.0));

        assert_eq!(
            Vec::<MarketOutcomePriceLiquidity>::new(),
            mls.liquidities_for
        );
    }
}

#[cfg(test)]
mod update_stake_matched_total_tests {
    use super::*;

    #[test]
    fn test_on_match() {
        let market_pk = Pubkey::new_unique();
        let mut market_liquidities = mock_market_liquidities(market_pk);

        let result_1 = market_liquidities.update_stake_matched_total(0);

        assert!(result_1.is_ok());
        assert_eq!(market_liquidities.stake_matched_total, 0);

        let result_2 = market_liquidities.update_stake_matched_total(1);

        assert!(result_2.is_ok());
        assert_eq!(market_liquidities.stake_matched_total, 1);

        let result_3 = market_liquidities.update_stake_matched_total(u64::MAX);

        assert!(result_3.is_err());
        assert_eq!(market_liquidities.stake_matched_total, 1);
    }
}
