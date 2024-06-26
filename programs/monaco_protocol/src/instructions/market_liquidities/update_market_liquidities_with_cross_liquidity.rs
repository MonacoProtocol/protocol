use crate::error::CoreError;
use crate::instructions::{calculate_price_cross, calculate_stake_cross};
use crate::state::market_liquidities::{LiquidityKey, MarketLiquidities};
use anchor_lang::prelude::*;

pub fn update_market_liquidities_with_cross_liquidity(
    market_liquidities: &mut MarketLiquidities,
    source_for_outcome: bool,
    source_liquidities: Vec<LiquidityKey>,
    cross_liquidity: LiquidityKey,
) -> Result<()> {
    require!(
        market_liquidities.enable_cross_matching,
        CoreError::MarketLiquiditiesUpdateError,
    );

    // calculate price based on provided inputs
    let source_prices = source_liquidities
        .iter()
        .map(|source_liquidity| source_liquidity.price)
        .collect::<Vec<f64>>();

    if let Some(cross_price) = calculate_price_cross(&source_prices) {
        // provided cross_liquidity.price is valid
        if cross_price == cross_liquidity.price {
            // calculate stake
            let cross_liquidity_stake = source_liquidities
                .iter()
                .map(|source_liquidity_key| {
                    let source_liquidity = if source_for_outcome {
                        market_liquidities.get_liquidity_for(
                            source_liquidity_key.outcome,
                            source_liquidity_key.price,
                        )
                    } else {
                        market_liquidities.get_liquidity_against(
                            source_liquidity_key.outcome,
                            source_liquidity_key.price,
                        )
                    };

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

            // update liquidity
            if source_for_outcome {
                market_liquidities.set_liquidity_against(
                    cross_liquidity.outcome,
                    cross_liquidity.price,
                    cross_liquidity_stake,
                    &source_liquidities,
                );
            } else {
                market_liquidities.set_liquidity_for(
                    cross_liquidity.outcome,
                    cross_liquidity.price,
                    cross_liquidity_stake,
                    &source_liquidities,
                );
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::state::market_liquidities::{mock_market_liquidities, MarketOutcomePriceLiquidity};

    #[test]
    fn test_2_way_market() {
        let mut market_liquidities = mock_market_liquidities(Pubkey::new_unique());
        market_liquidities.add_liquidity_for(0, 3.0, 1000).unwrap();
        market_liquidities.add_liquidity_for(0, 3.5, 1000).unwrap();
        market_liquidities
            .add_liquidity_for(0, 4.125, 1000)
            .unwrap();

        assert_eq!(
            vec!((0, 3.0, 1000), (0, 3.5, 1000), (0, 4.125, 1000)),
            liquidities(&market_liquidities.liquidities_for)
        );

        //------------------------------------------------------------------------------------------

        update_market_liquidities_with_cross_liquidity(
            &mut market_liquidities,
            true,
            vec![LiquidityKey::new(0, 3.0)],
            LiquidityKey::new(1, 1.5),
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        update_market_liquidities_with_cross_liquidity(
            &mut market_liquidities,
            true,
            vec![LiquidityKey::new(0, 3.5)],
            LiquidityKey::new(1, 1.4),
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        update_market_liquidities_with_cross_liquidity(
            &mut market_liquidities,
            true,
            vec![LiquidityKey::new(0, 4.125)],
            LiquidityKey::new(1, 1.32),
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        assert_eq!(
            vec!((1, 1.5, 2000), (1, 1.4, 2500), (1, 1.32, 3125)),
            liquidities(&market_liquidities.liquidities_against)
        );
    }

    #[test]
    fn test_3_way_market() {
        // 2.0, 3.0, 6.0
        // 2.1, 3.0, 5.25
        let mut market_liquidities = mock_market_liquidities(Pubkey::new_unique());
        market_liquidities.add_liquidity_for(0, 2.0, 100).unwrap();
        market_liquidities.add_liquidity_for(0, 2.1, 100).unwrap();
        market_liquidities.add_liquidity_for(1, 3.0, 100).unwrap();

        assert_eq!(
            vec!((0, 2.0, 100), (0, 2.1, 100), (1, 3.0, 100)),
            liquidities(&market_liquidities.liquidities_for)
        );

        //------------------------------------------------------------------------------------------

        update_market_liquidities_with_cross_liquidity(
            &mut market_liquidities,
            true,
            vec![LiquidityKey::new(0, 2.1), LiquidityKey::new(1, 3.0)],
            LiquidityKey::new(2, 5.25),
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");
        update_market_liquidities_with_cross_liquidity(
            &mut market_liquidities,
            true,
            vec![LiquidityKey::new(0, 2.0), LiquidityKey::new(1, 3.0)],
            LiquidityKey::new(2, 6.0),
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        assert_eq!(
            vec!((2, 6.0, 33), (2, 5.25, 40)),
            liquidities(&market_liquidities.liquidities_against)
        );
    }

    fn liquidities(liquidities: &Vec<MarketOutcomePriceLiquidity>) -> Vec<(u16, f64, u64)> {
        liquidities
            .iter()
            .map(|v| (v.outcome, v.price, v.liquidity))
            .collect::<Vec<(u16, f64, u64)>>()
    }
}
