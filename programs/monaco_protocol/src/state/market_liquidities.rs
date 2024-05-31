use crate::error::CoreError;
use crate::state::market_account::MarketOrderBehaviour;
use crate::state::type_size::*;
use anchor_lang::prelude::*;
use std::cmp::Ordering;
use std::string::ToString;

#[account]
pub struct MarketLiquidities {
    pub market: Pubkey,
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

    pub fn get_liquidity_for(
        &self,
        outcome: u16,
        price: f64,
    ) -> Option<&MarketOutcomePriceLiquidity> {
        self.liquidities_for
            .binary_search_by(Self::sorter_for(outcome, price))
            .ok()
            .map(|index| &self.liquidities_for[index])
    }

    pub fn get_liquidity_against(
        &self,
        outcome: u16,
        price: f64,
    ) -> Option<&MarketOutcomePriceLiquidity> {
        self.liquidities_against
            .binary_search_by(Self::sorter_against(outcome, price))
            .ok()
            .map(|index| &self.liquidities_against[index])
    }

    pub fn add_liquidity_for(&mut self, outcome: u16, price: f64, liquidity: u64) -> Result<()> {
        let is_full = self.is_full();
        let liquidities = &mut self.liquidities_for;
        Self::add_liquidity(
            liquidities,
            Self::sorter_for(outcome, price),
            outcome,
            price,
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
        Self::add_liquidity(
            liquidities,
            Self::sorter_against(outcome, price),
            outcome,
            price,
            liquidity,
            is_full,
        )
    }

    fn is_full(&self) -> bool {
        Self::LIQUIDITIES_VEC_LENGTH + Self::LIQUIDITIES_VEC_LENGTH
            <= self.liquidities_for.len() + self.liquidities_against.len()
    }

    fn add_liquidity(
        liquidities: &mut Vec<MarketOutcomePriceLiquidity>,
        search_function: impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering,
        outcome: u16,
        price: f64,
        liquidity: u64,
        is_full: bool,
    ) -> Result<()> {
        match liquidities.binary_search_by(search_function) {
            Ok(index) => {
                let liquidities_for_value = &mut liquidities[index];
                liquidities_for_value.liquidity = liquidities_for_value
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
                            sources: vec![],
                        },
                    )
                }
            }
        }

        Ok(())
    }

    pub fn set_liquidity_for_sources(
        &mut self,
        outcome: u16,
        price: f64,
        sources: Vec<LiquidityKey>,
    ) -> Result<()> {
        let liquidities = &mut self.liquidities_for;
        let search_function = Self::sorter_for(outcome, price);

        match liquidities.binary_search_by(search_function) {
            Ok(index) => {
                let liquidities_for_value = &mut liquidities[index];
                liquidities_for_value.sources = sources;
                Ok(())
            }
            Err(_) => Err(error!(CoreError::MarketLiquiditiesUpdateError)),
        }
    }

    pub fn set_liquidity_against_sources(
        &mut self,
        outcome: u16,
        price: f64,
        sources: Vec<LiquidityKey>,
    ) -> Result<()> {
        let liquidities = &mut self.liquidities_against;
        let search_function = Self::sorter_against(outcome, price);

        match liquidities.binary_search_by(search_function) {
            Ok(index) => {
                let liquidities_for_value = &mut liquidities[index];
                liquidities_for_value.sources = sources;
                Ok(())
            }
            Err(_) => Err(error!(CoreError::MarketLiquiditiesUpdateError)),
        }
    }

    pub fn set_liquidity_for(
        &mut self,
        outcome: u16,
        price: f64,
        liquidity: u64,
        sources: Vec<LiquidityKey>,
    ) {
        Self::set_liquidity(
            &mut self.liquidities_for,
            Self::sorter_for(outcome, price),
            outcome,
            price,
            liquidity,
            sources,
        )
    }

    pub fn set_liquidity_against(
        &mut self,
        outcome: u16,
        price: f64,
        liquidity: u64,
        sources: Vec<LiquidityKey>,
    ) {
        Self::set_liquidity(
            &mut self.liquidities_against,
            Self::sorter_against(outcome, price),
            outcome,
            price,
            liquidity,
            sources,
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

    pub fn remove_liquidity_for(&mut self, outcome: u16, price: f64, liquidity: u64) -> Result<()> {
        let liquidities = &mut self.liquidities_for;
        Self::remove_liquidity(liquidities, Self::sorter_for(outcome, price), liquidity)
    }

    pub fn remove_liquidity_against(
        &mut self,
        outcome: u16,
        price: f64,
        liquidity: u64,
    ) -> Result<()> {
        let liquidities = &mut self.liquidities_against;
        Self::remove_liquidity(liquidities, Self::sorter_against(outcome, price), liquidity)
    }

    fn remove_liquidity(
        liquidities: &mut Vec<MarketOutcomePriceLiquidity>,
        search_function: impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering,
        liquidity: u64,
    ) -> Result<()> {
        match liquidities.binary_search_by(search_function) {
            Ok(index) => {
                let liquidities_for_value = &mut liquidities[index];
                liquidities_for_value.liquidity = liquidities_for_value
                    .liquidity
                    .checked_sub(liquidity)
                    .ok_or(CoreError::MarketLiquiditiesUpdateError)?;

                if liquidities_for_value.liquidity == 0 {
                    liquidities.remove(index);
                }
                Ok(())
            }
            Err(_) => Err(error!(CoreError::MarketLiquiditiesUpdateError)),
        }
    }

    fn sorter_for(
        outcome: u16,
        price: f64,
    ) -> impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering {
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

            Ordering::Equal
        }
    }

    fn sorter_against(
        outcome: u16,
        price: f64,
    ) -> impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering {
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

            Ordering::Equal
        }
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
    pub liquidity: u64,
    pub sources: Vec<LiquidityKey>,
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
        liquidity,
        sources: Vec::new(),
    }
}

#[cfg(test)]
mod total_exposure_tests {
    use super::*;

    #[test]
    fn test_add_liquidity() {
        let mut market_liquidities = mock_market_liquidities(Pubkey::default());

        market_liquidities.add_liquidity_for(0, 2.111, 501).unwrap();
        market_liquidities.add_liquidity_for(0, 2.111, 500).unwrap();
        market_liquidities.add_liquidity_for(0, 2.112, 499).unwrap();
        market_liquidities
            .add_liquidity_for(1, 2.111, 2001)
            .unwrap();
        market_liquidities
            .add_liquidity_for(2, 2.111, 1500)
            .unwrap();
        market_liquidities
            .add_liquidity_for(2, 2.111, 1501)
            .unwrap();

        market_liquidities
            .add_liquidity_against(0, 2.111, 501)
            .unwrap();
        market_liquidities
            .add_liquidity_against(0, 2.111, 500)
            .unwrap();
        market_liquidities
            .add_liquidity_against(0, 2.112, 499)
            .unwrap();
        market_liquidities
            .add_liquidity_against(1, 2.111, 2001)
            .unwrap();
        market_liquidities
            .add_liquidity_against(2, 2.111, 1500)
            .unwrap();
        market_liquidities
            .add_liquidity_against(2, 2.111, 1501)
            .unwrap();

        assert_eq!(
            vec![
                mock_liquidity(0, 2.111, 1001),
                mock_liquidity(0, 2.112, 499),
                mock_liquidity(1, 2.111, 2001),
                mock_liquidity(2, 2.111, 3001),
            ],
            market_liquidities.liquidities_for
        );
        assert_eq!(
            vec![
                mock_liquidity(2, 2.111, 3001),
                mock_liquidity(1, 2.111, 2001),
                mock_liquidity(0, 2.112, 499),
                mock_liquidity(0, 2.111, 1001),
            ],
            market_liquidities.liquidities_against
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
    fn test_remove_liquidity() {
        let mut market_liquidities: MarketLiquidities = MarketLiquidities {
            market: Pubkey::default(),
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

        market_liquidities
            .remove_liquidity_for(0, 2.111, 200)
            .unwrap();
        market_liquidities
            .remove_liquidity_for(1, 2.111, 200)
            .unwrap();
        market_liquidities
            .remove_liquidity_for(2, 2.111, 200)
            .unwrap();

        market_liquidities
            .remove_liquidity_against(0, 2.111, 200)
            .unwrap();
        market_liquidities
            .remove_liquidity_against(1, 2.111, 200)
            .unwrap();
        market_liquidities
            .remove_liquidity_against(2, 2.111, 200)
            .unwrap();

        assert_eq!(
            vec![
                mock_liquidity(0, 2.111, 801),
                mock_liquidity(1, 2.111, 1801),
                mock_liquidity(2, 2.111, 2801),
            ],
            market_liquidities.liquidities_for
        );
        assert_eq!(
            vec![
                mock_liquidity(2, 2.111, 2801),
                mock_liquidity(1, 2.111, 1801),
                mock_liquidity(0, 2.111, 801),
            ],
            market_liquidities.liquidities_against
        );
    }

    #[test]
    fn test_get_liquidity_for() {
        let market_liquidities: MarketLiquidities = MarketLiquidities {
            market: Pubkey::default(),
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
        assert_eq!(
            1003,
            market_liquidities
                .get_liquidity_for(0, 2.32)
                .unwrap()
                .liquidity
        );
    }

    #[test]
    fn test_get_liquidity_against() {
        let market_liquidities: MarketLiquidities = MarketLiquidities {
            market: Pubkey::default(),
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
        assert_eq!(
            1003,
            market_liquidities
                .get_liquidity_against(0, 2.32)
                .unwrap()
                .liquidity
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
