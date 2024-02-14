use std::cmp::Ordering;
use std::string::ToString;

use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::state::type_size::*;

#[account]
pub struct MarketLiquidities {
    pub market: Pubkey,
    pub liquidities_for: Vec<MarketOutcomePriceLiquidity>,
    pub liquidities_against: Vec<MarketOutcomePriceLiquidity>,
}

impl MarketLiquidities {
    const LIQUIDITIES_VEC_LENGTH: usize = 30_usize;
    pub const SIZE: usize = DISCRIMINATOR_SIZE
        + PUB_KEY_SIZE // market
        + vec_size(MarketOutcomePriceLiquidity::SIZE, MarketLiquidities::LIQUIDITIES_VEC_LENGTH) // for
        + vec_size(MarketOutcomePriceLiquidity::SIZE, MarketLiquidities::LIQUIDITIES_VEC_LENGTH); // against

    pub fn get_liquidity_for(&self, outcome: u16, price: f64) -> MarketOutcomePriceLiquidity {
        match self
            .liquidities_for
            .binary_search_by(Self::sorter_for(outcome, price))
        {
            Ok(index) => self.liquidities_for[index],
            Err(_) => MarketOutcomePriceLiquidity {
                outcome,
                price,
                liquidity: 0,
                cross: false,
            },
        }
    }

    pub fn get_liquidity_against(&self, outcome: u16, price: f64) -> MarketOutcomePriceLiquidity {
        match self
            .liquidities_against
            .binary_search_by(Self::sorter_against(outcome, price))
        {
            Ok(index) => self.liquidities_against[index],
            Err(_) => MarketOutcomePriceLiquidity {
                outcome,
                price,
                liquidity: 0,
                cross: false,
            },
        }
    }

    pub fn add_liquidity_for(&mut self, outcome: u16, price: f64, liquidity: u64) -> Result<()> {
        let liquidities = &mut self.liquidities_for;
        Self::add_liquidity(
            liquidities,
            Self::sorter_for(outcome, price),
            outcome,
            price,
            liquidity,
        )
    }

    pub fn add_liquidity_against(
        &mut self,
        outcome: u16,
        price: f64,
        liquidity: u64,
    ) -> Result<()> {
        let liquidities = &mut self.liquidities_against;
        Self::add_liquidity(
            liquidities,
            Self::sorter_against(outcome, price),
            outcome,
            price,
            liquidity,
        )
    }

    fn add_liquidity(
        liquidities: &mut Vec<MarketOutcomePriceLiquidity>,
        search_function: impl FnMut(&MarketOutcomePriceLiquidity) -> Ordering,
        outcome: u16,
        price: f64,
        liquidity: u64,
    ) -> Result<()> {
        match liquidities.binary_search_by(search_function) {
            Ok(index) => {
                let liquidities_for_value = &mut liquidities[index];
                liquidities_for_value.liquidity = liquidities_for_value
                    .liquidity
                    .checked_add(liquidity)
                    .ok_or(CoreError::MarketOutcomeUpdateError)?
            }
            Err(index) => liquidities.insert(
                index,
                MarketOutcomePriceLiquidity {
                    outcome,
                    price,
                    liquidity,
                    cross: false,
                },
            ),
        }

        Ok(())
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
                    .ok_or(CoreError::MarketOutcomeUpdateError)?;

                if liquidities_for_value.liquidity == 0 {
                    liquidities.remove(index);
                }
                Ok(())
            }
            Err(_) => Err(error!(CoreError::MarketOutcomeUpdateError)),
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
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq)]
pub struct MarketOutcomePriceLiquidity {
    pub outcome: u16,
    pub price: f64,
    pub liquidity: u64,
    pub cross: bool,
}

impl MarketOutcomePriceLiquidity {
    pub const SIZE: usize = U16_SIZE + F64_SIZE + U64_SIZE;
}

#[cfg(test)]
pub fn mock_market_liquidities(market_pk: Pubkey) -> MarketLiquidities {
    MarketLiquidities {
        market: market_pk,
        liquidities_for: Vec::new(),
        liquidities_against: Vec::new(),
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

        let expected_for: Vec<MarketOutcomePriceLiquidity> = vec![
            MarketOutcomePriceLiquidity {
                outcome: 0,
                price: 2.111,
                liquidity: 1001,
                cross: false,
            },
            MarketOutcomePriceLiquidity {
                outcome: 0,
                price: 2.112,
                liquidity: 499,
                cross: false,
            },
            MarketOutcomePriceLiquidity {
                outcome: 1,
                price: 2.111,
                liquidity: 2001,
                cross: false,
            },
            MarketOutcomePriceLiquidity {
                outcome: 2,
                price: 2.111,
                liquidity: 3001,
                cross: false,
            },
        ];
        assert_eq!(expected_for, market_liquidities.liquidities_for);
        let expected_against: Vec<MarketOutcomePriceLiquidity> = vec![
            MarketOutcomePriceLiquidity {
                outcome: 2,
                price: 2.111,
                liquidity: 3001,
                cross: false,
            },
            MarketOutcomePriceLiquidity {
                outcome: 1,
                price: 2.111,
                liquidity: 2001,
                cross: false,
            },
            MarketOutcomePriceLiquidity {
                outcome: 0,
                price: 2.112,
                liquidity: 499,
                cross: false,
            },
            MarketOutcomePriceLiquidity {
                outcome: 0,
                price: 2.111,
                liquidity: 1001,
                cross: false,
            },
        ];
        assert_eq!(expected_against, market_liquidities.liquidities_against);
    }

    #[test]
    fn test_remove_liquidity() {
        let mut market_liquidities: MarketLiquidities = MarketLiquidities {
            market: Pubkey::default(),
            liquidities_for: vec![
                MarketOutcomePriceLiquidity {
                    outcome: 0,
                    price: 2.111,
                    liquidity: 1001,
                    cross: false,
                },
                MarketOutcomePriceLiquidity {
                    outcome: 1,
                    price: 2.111,
                    liquidity: 2001,
                    cross: false,
                },
                MarketOutcomePriceLiquidity {
                    outcome: 2,
                    price: 2.111,
                    liquidity: 3001,
                    cross: false,
                },
            ],
            liquidities_against: vec![
                MarketOutcomePriceLiquidity {
                    outcome: 2,
                    price: 2.111,
                    liquidity: 3001,
                    cross: false,
                },
                MarketOutcomePriceLiquidity {
                    outcome: 1,
                    price: 2.111,
                    liquidity: 2001,
                    cross: false,
                },
                MarketOutcomePriceLiquidity {
                    outcome: 0,
                    price: 2.111,
                    liquidity: 1001,
                    cross: false,
                },
            ],
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

        let expected_for: Vec<MarketOutcomePriceLiquidity> = vec![
            MarketOutcomePriceLiquidity {
                outcome: 0,
                price: 2.111,
                liquidity: 801,
                cross: false,
            },
            MarketOutcomePriceLiquidity {
                outcome: 1,
                price: 2.111,
                liquidity: 1801,
                cross: false,
            },
            MarketOutcomePriceLiquidity {
                outcome: 2,
                price: 2.111,
                liquidity: 2801,
                cross: false,
            },
        ];
        assert_eq!(expected_for, market_liquidities.liquidities_for);
        let expected_against: Vec<MarketOutcomePriceLiquidity> = vec![
            MarketOutcomePriceLiquidity {
                outcome: 2,
                price: 2.111,
                liquidity: 2801,
                cross: false,
            },
            MarketOutcomePriceLiquidity {
                outcome: 1,
                price: 2.111,
                liquidity: 1801,
                cross: false,
            },
            MarketOutcomePriceLiquidity {
                outcome: 0,
                price: 2.111,
                liquidity: 801,
                cross: false,
            },
        ];
        assert_eq!(expected_against, market_liquidities.liquidities_against);
    }

    #[test]
    fn test_get_liquidity_for() {
        let market_liquidities: MarketLiquidities = MarketLiquidities {
            market: Pubkey::default(),
            liquidities_for: vec![
                MarketOutcomePriceLiquidity {
                    outcome: 0,
                    price: 2.30,
                    liquidity: 1001,
                    cross: false,
                },
                MarketOutcomePriceLiquidity {
                    outcome: 0,
                    price: 2.31,
                    liquidity: 1002,
                    cross: false,
                },
                MarketOutcomePriceLiquidity {
                    outcome: 0,
                    price: 2.32,
                    liquidity: 1003,
                    cross: false,
                },
                MarketOutcomePriceLiquidity {
                    outcome: 0,
                    price: 2.33,
                    liquidity: 1004,
                    cross: false,
                },
            ],
            liquidities_against: vec![],
        };

        assert_eq!(
            1002,
            market_liquidities.get_liquidity_for(0, 2.31).liquidity
        );
        assert_eq!(0, market_liquidities.get_liquidity_for(0, 2.315).liquidity);
        assert_eq!(
            1003,
            market_liquidities.get_liquidity_for(0, 2.32).liquidity
        );
    }

    #[test]
    fn test_get_liquidity_against() {
        let market_liquidities: MarketLiquidities = MarketLiquidities {
            market: Pubkey::default(),
            liquidities_for: vec![],
            liquidities_against: vec![
                MarketOutcomePriceLiquidity {
                    outcome: 0,
                    price: 2.33,
                    liquidity: 1004,
                    cross: false,
                },
                MarketOutcomePriceLiquidity {
                    outcome: 0,
                    price: 2.32,
                    liquidity: 1003,
                    cross: false,
                },
                MarketOutcomePriceLiquidity {
                    outcome: 0,
                    price: 2.31,
                    liquidity: 1002,
                    cross: false,
                },
                MarketOutcomePriceLiquidity {
                    outcome: 0,
                    price: 2.30,
                    liquidity: 1001,
                    cross: false,
                },
            ],
        };

        assert_eq!(
            1002,
            market_liquidities.get_liquidity_against(0, 2.31).liquidity
        );
        assert_eq!(
            0,
            market_liquidities.get_liquidity_against(0, 2.315).liquidity
        );
        assert_eq!(
            1003,
            market_liquidities.get_liquidity_against(0, 2.32).liquidity
        );
    }
}
