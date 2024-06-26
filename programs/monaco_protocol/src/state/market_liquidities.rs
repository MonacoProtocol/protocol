use crate::error::CoreError;
use crate::instructions::{calculate_price_cross, calculate_stake_cross};
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
        + U64_SIZE // stake_matched_total
        + vec_size(MarketOutcomePriceLiquidity::SIZE, MarketLiquidities::LIQUIDITIES_VEC_LENGTH) // for
        + vec_size(MarketOutcomePriceLiquidity::SIZE, MarketLiquidities::LIQUIDITIES_VEC_LENGTH); // against

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
        let sources = &[];
        Self::add_liquidity(
            liquidities,
            Self::sorter_for(outcome, price, sources),
            outcome,
            price,
            sources,
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
        let sources = &[];
        Self::add_liquidity(
            liquidities,
            Self::sorter_against(outcome, price, sources),
            outcome,
            price,
            sources,
            liquidity,
            is_full,
        )
    }

    fn add_liquidity(
        liquidities: &mut Vec<MarketOutcomePriceLiquidity>,
        search_function: impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering,
        outcome: u16,
        price: f64,
        sources: &[LiquidityKey],
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

    pub fn update_cross_liquidity_for(&mut self, sources: &[LiquidityKey]) {
        // silly way of detecting which outcome is supposed to be updated
        // sum of all the outcomes minus sum of all provided ones equals the one we want
        let outcome_count = sources.len().to_u16().unwrap();
        let outcome = (0_u16..=outcome_count).sum::<u16>() - Self::source_outcomes_sum(sources);

        let source_prices = sources
            .iter()
            .map(|source| source.price)
            .collect::<Vec<f64>>();
        if let Some(cross_price) = calculate_price_cross(&source_prices) {
            let cross_liquidity = sources
                .iter()
                .map(|source_liquidity_key| {
                    let source_liquidity = self.get_liquidity_against(
                        source_liquidity_key.outcome,
                        source_liquidity_key.price,
                    );
                    calculate_stake_cross(
                        source_liquidity
                            .map(|source_liquidity| source_liquidity.liquidity)
                            .unwrap_or(0_u64),
                        source_liquidity_key.price,
                        cross_price,
                    )
                })
                .min()
                .unwrap_or(0_u64);

            self.set_liquidity_for(outcome, cross_price, cross_liquidity, sources);
        }
    }

    pub fn update_cross_liquidity_against(&mut self, sources: &[LiquidityKey]) {
        // silly way of detecting which outcome is supposed to be updated
        // sum of all the outcomes minus sum of all provided ones equals the one we want
        let outcome_count = sources.len().to_u16().unwrap();
        let outcome = (0_u16..=outcome_count).sum::<u16>() - Self::source_outcomes_sum(sources);

        let source_prices = sources
            .iter()
            .map(|source| source.price)
            .collect::<Vec<f64>>();
        if let Some(cross_price) = calculate_price_cross(&source_prices) {
            let cross_liquidity = sources
                .iter()
                .map(|source_liquidity_key| {
                    let source_liquidity = self.get_liquidity_for(
                        source_liquidity_key.outcome,
                        source_liquidity_key.price,
                    );
                    calculate_stake_cross(
                        source_liquidity
                            .map(|source_liquidity| source_liquidity.liquidity)
                            .unwrap_or(0_u64),
                        source_liquidity_key.price,
                        cross_price,
                    )
                })
                .min()
                .unwrap_or(0_u64);

            self.set_liquidity_against(outcome, cross_price, cross_liquidity, sources);
        }
    }

    pub fn set_liquidity_for(
        &mut self,
        outcome: u16,
        price: f64,
        liquidity: u64,
        sources: &[LiquidityKey],
    ) {
        let sorter = Self::sorter_for(outcome, price, sources);
        Self::set_liquidity(
            &mut self.liquidities_for,
            sorter,
            outcome,
            price,
            liquidity,
            sources.to_vec(),
        )
    }

    pub fn set_liquidity_against(
        &mut self,
        outcome: u16,
        price: f64,
        liquidity: u64,
        sources: &[LiquidityKey],
    ) {
        let sorter = Self::sorter_against(outcome, price, sources);
        Self::set_liquidity(
            &mut self.liquidities_against,
            sorter,
            outcome,
            price,
            liquidity,
            sources.to_vec(),
        )
    }

    fn set_liquidity(
        liquidities: &mut Vec<MarketOutcomePriceLiquidity>,
        search_function: impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering,
        outcome: u16,
        price: f64,
        liquidity: u64,
        sources: Vec<LiquidityKey>,
    ) {
        match liquidities.binary_search_by(search_function) {
            Ok(index) => {
                liquidities[index].liquidity = liquidity;
            }
            Err(index) => liquidities.insert(
                index,
                MarketOutcomePriceLiquidity {
                    outcome,
                    price,
                    liquidity,
                    sources,
                },
            ),
        }
    }

    pub fn remove_liquidity_for(
        &mut self,
        outcome: u16,
        price: f64,
        sources: &[LiquidityKey],
        liquidity: u64,
    ) -> Result<()> {
        let liquidities = &mut self.liquidities_for;
        let sorter = Self::sorter_for(outcome, price, sources);
        Self::remove_liquidity(liquidities, sorter, liquidity)
    }

    pub fn remove_liquidity_against(
        &mut self,
        outcome: u16,
        price: f64,
        sources: &[LiquidityKey],
        liquidity: u64,
    ) -> Result<()> {
        let liquidities = &mut self.liquidities_against;
        let sorter = Self::sorter_against(outcome, price, sources);
        Self::remove_liquidity(liquidities, sorter, liquidity)
    }

    fn remove_liquidity(
        liquidities: &mut Vec<MarketOutcomePriceLiquidity>,
        search_function: impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering,
        liquidity: u64,
    ) -> Result<()> {
        match liquidities.binary_search_by(search_function) {
            Ok(index) => {
                let value = &mut liquidities[index];
                value.liquidity = value
                    .liquidity
                    .checked_sub(liquidity)
                    .ok_or(CoreError::MarketLiquiditiesUpdateError)?;
                if value.liquidity == 0 {
                    liquidities.remove(index);
                }
                Ok(())
            }
            Err(_) => Err(error!(CoreError::MarketLiquiditiesUpdateError)),
        }
    }

    pub fn sorter_for(
        outcome: u16,
        price: f64,
        sources: &[LiquidityKey],
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

    pub fn sorter_against(
        outcome: u16,
        price: f64,
        sources: &[LiquidityKey],
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

    fn source_prices(sources: &[LiquidityKey]) -> Vec<f64> {
        sources.iter().map(|source| source.price).collect()
    }

    fn source_outcomes_sum(sources: &[LiquidityKey]) -> u16 {
        sources.iter().map(|source| source.outcome).sum()
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
pub struct LiquidityKey {
    pub outcome: u16,
    pub price: f64,
}

impl LiquidityKey {
    pub fn new(outcome: u16, price: f64) -> LiquidityKey {
        LiquidityKey { outcome, price }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, PartialEq)]
pub struct MarketOutcomePriceLiquidity {
    pub outcome: u16,
    pub price: f64,
    pub sources: Vec<LiquidityKey>,

    pub liquidity: u64,
}

impl MarketOutcomePriceLiquidity {
    pub const SIZE: usize = U16_SIZE // outcome
        + F64_SIZE // price
        + U64_SIZE // liquidity
        + vec_size(U16_SIZE + F64_SIZE, 3); // sources: sized to work for 3 and 4 way markets
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
    sources: Vec<LiquidityKey>,
    liquidity: u64,
) -> MarketOutcomePriceLiquidity {
    MarketOutcomePriceLiquidity {
        outcome,
        price,
        sources,
        liquidity,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_liquidity() {
        let mut mls = mock_market_liquidities(Pubkey::default());

        mls.set_liquidity_for(0, 2.1, 10, &[LiquidityKey::new(1, 9.9)]);
        mls.add_liquidity_for(0, 2.1, 5).unwrap();
        mls.add_liquidity_for(0, 2.1, 5).unwrap();
        mls.add_liquidity_for(0, 2.2, 15).unwrap();
        mls.add_liquidity_for(1, 2.1, 20).unwrap();
        mls.add_liquidity_for(2, 2.1, 15).unwrap();
        mls.add_liquidity_for(2, 2.1, 10).unwrap();

        mls.set_liquidity_against(0, 2.1, 10, &[LiquidityKey::new(1, 9.9)]);
        mls.add_liquidity_against(0, 2.1, 5).unwrap();
        mls.add_liquidity_against(0, 2.1, 5).unwrap();
        mls.add_liquidity_against(0, 2.2, 15).unwrap();
        mls.add_liquidity_against(1, 2.1, 20).unwrap();
        mls.add_liquidity_against(2, 2.1, 15).unwrap();
        mls.add_liquidity_against(2, 2.1, 10).unwrap();

        // the order of the results is important
        assert_eq!(
            vec![
                mock_liquidity(0, 2.1, 10),
                mock_liquidity_with_sources(0, 2.1, vec![LiquidityKey::new(1, 9.9)], 10,),
                mock_liquidity(0, 2.2, 15),
                mock_liquidity(1, 2.1, 20),
                mock_liquidity(2, 2.1, 25),
            ],
            mls.liquidities_for
        );
        // the order of the results is important
        assert_eq!(
            vec![
                mock_liquidity(2, 2.1, 25),
                mock_liquidity(1, 2.1, 20),
                mock_liquidity(0, 2.2, 15),
                mock_liquidity(0, 2.1, 10),
                mock_liquidity_with_sources(0, 2.1, vec![LiquidityKey::new(1, 9.9)], 10,),
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
        let mut mls: MarketLiquidities = mock_market_liquidities(Pubkey::default());
        mls.add_liquidity_against(0, 2.700, 100).unwrap();
        mls.add_liquidity_against(1, 3.000, 90).unwrap();
        mls.add_liquidity_against(0, 3.000, 45).unwrap();
        mls.add_liquidity_against(1, 2.700, 50).unwrap();

        mls.update_cross_liquidity_for(&[LiquidityKey::new(0, 2.7), LiquidityKey::new(1, 3.0)]);
        mls.update_cross_liquidity_for(&[LiquidityKey::new(0, 3.0), LiquidityKey::new(1, 2.7)]);

        assert_eq!(
            vec![
                mock_liquidity_with_sources(
                    2,
                    3.375,
                    [LiquidityKey::new(0, 2.7), LiquidityKey::new(1, 3.0)].to_vec(),
                    80,
                ),
                mock_liquidity_with_sources(
                    2,
                    3.375,
                    [LiquidityKey::new(0, 3.0), LiquidityKey::new(1, 2.7)].to_vec(),
                    40,
                ),
            ],
            mls.liquidities_for
        );
    }

    #[test]
    fn test_update_cross_liquidity_against() {
        let mut mls: MarketLiquidities = mock_market_liquidities(Pubkey::default());
        mls.add_liquidity_for(0, 2.700, 100).unwrap();
        mls.add_liquidity_for(1, 3.000, 90).unwrap();
        mls.add_liquidity_for(0, 3.000, 45).unwrap();
        mls.add_liquidity_for(1, 2.700, 50).unwrap();

        mls.update_cross_liquidity_against(&[LiquidityKey::new(0, 2.7), LiquidityKey::new(1, 3.0)]);
        mls.update_cross_liquidity_against(&[LiquidityKey::new(0, 3.0), LiquidityKey::new(1, 2.7)]);

        assert_eq!(
            vec![
                mock_liquidity_with_sources(
                    2,
                    3.375,
                    [LiquidityKey::new(0, 2.7), LiquidityKey::new(1, 3.0)].to_vec(),
                    80,
                ),
                mock_liquidity_with_sources(
                    2,
                    3.375,
                    [LiquidityKey::new(0, 3.0), LiquidityKey::new(1, 2.7)].to_vec(),
                    40,
                ),
            ],
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

        mls.remove_liquidity_for(0, 2.111, &[], 200).unwrap();
        mls.remove_liquidity_for(1, 2.111, &[], 200).unwrap();
        mls.remove_liquidity_for(2, 2.111, &[], 200).unwrap();

        mls.remove_liquidity_against(0, 2.111, &[], 200).unwrap();
        mls.remove_liquidity_against(1, 2.111, &[], 200).unwrap();
        mls.remove_liquidity_against(2, 2.111, &[], 200).unwrap();

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
