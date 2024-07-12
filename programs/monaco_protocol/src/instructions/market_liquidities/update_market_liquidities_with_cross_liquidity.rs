use crate::error::CoreError;
use crate::instructions::calculate_price_cross;
use crate::state::market_liquidities::{LiquiditySource, MarketLiquidities};
use anchor_lang::prelude::*;

pub fn update_market_liquidities_with_cross_liquidity(
    market_liquidities: &mut MarketLiquidities,
    source_for_outcome: bool,
    source_liquidities: Vec<LiquiditySource>,
    cross_liquidity: LiquiditySource,
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
            if source_for_outcome {
                market_liquidities.update_cross_liquidity_against(&source_liquidities);
            } else {
                market_liquidities.update_cross_liquidity_for(&source_liquidities);
            };
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
            vec![LiquiditySource::new(0, 3.0)],
            LiquiditySource::new(1, 1.5),
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        update_market_liquidities_with_cross_liquidity(
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(0, 3.5)],
            LiquiditySource::new(1, 1.4),
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        update_market_liquidities_with_cross_liquidity(
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(0, 4.125)],
            LiquiditySource::new(1, 1.32),
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        assert_eq!(
            vec!((1, 1.5, 2000), (1, 1.4, 2000), (1, 1.32, 3000)),
            liquidities(&market_liquidities.liquidities_against)
        );
    }

    #[test]
    fn test_3_way_market() {
        // 2.0, 3.0, 6.0
        // 2.1, 3.0, 5.25
        let mut market_liquidities = mock_market_liquidities(Pubkey::new_unique());
        market_liquidities
            .add_liquidity_for(0, 2.0, 100_000)
            .unwrap();
        market_liquidities
            .add_liquidity_for(0, 2.1, 100_000)
            .unwrap();
        market_liquidities
            .add_liquidity_for(1, 3.0, 100_000)
            .unwrap();

        assert_eq!(
            vec!((0, 2.0, 100_000), (0, 2.1, 100_000), (1, 3.0, 100_000)),
            liquidities(&market_liquidities.liquidities_for)
        );

        //------------------------------------------------------------------------------------------

        update_market_liquidities_with_cross_liquidity(
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(0, 2.1), LiquiditySource::new(1, 3.0)],
            LiquiditySource::new(2, 5.25),
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");
        update_market_liquidities_with_cross_liquidity(
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(0, 2.0), LiquiditySource::new(1, 3.0)],
            LiquiditySource::new(2, 6.0),
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        assert_eq!(
            vec!((2, 6.0, 33_000), (2, 5.25, 40_000)),
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
