use crate::error::CoreError;
use crate::state::market_account::Market;
use crate::state::market_liquidities::{LiquiditySource, MarketLiquidities};
use anchor_lang::prelude::*;

pub fn update_market_liquidities_with_cross_liquidity(
    market: &Market,
    market_liquidities: &mut MarketLiquidities,
    source_for_outcome: bool,
    source_liquidities: Vec<LiquiditySource>,
) -> Result<()> {
    require!(
        market_liquidities.enable_cross_matching,
        CoreError::MarketLiquiditiesCrossMatchingDisabled,
    );

    require!(
        source_liquidities.len() == (market.market_outcomes_count - 1) as usize,
        CoreError::MarketLiquiditiesSourceLiquiditiesInvalid,
    );

    // ensuring that all newly created cross liquidity has sources sorted the same way
    let mut source_liquidities_sorted = source_liquidities.to_vec();
    source_liquidities_sorted.sort_by(|a, b| a.outcome.partial_cmp(&b.outcome).unwrap());
    source_liquidities_sorted.retain(|v| v.outcome < market.market_outcomes_count);
    source_liquidities_sorted.dedup_by(|a, b| a.outcome == b.outcome);

    // making sure there were no duplicates
    require!(
        source_liquidities_sorted.len() == source_liquidities.len(),
        CoreError::MarketLiquiditiesSourceLiquiditiesInvalid,
    );

    // provided cross_liquidity.price is valid
    if source_for_outcome {
        market_liquidities.update_cross_liquidity_against(&source_liquidities_sorted);
    } else {
        market_liquidities.update_cross_liquidity_for(&source_liquidities_sorted);
    };

    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::state::market_account::{mock_market, MarketStatus};
    use crate::state::market_liquidities::{mock_market_liquidities, MarketOutcomePriceLiquidity};

    #[test]
    fn test_source_liquidities_validation() {
        let mut market = mock_market(MarketStatus::Open);
        market.market_outcomes_count = 3;
        let mut market_liquidities = mock_market_liquidities(Pubkey::new_unique());
        market_liquidities
            .add_liquidity_for(0, 2.0, 100_000)
            .unwrap();
        market_liquidities
            .add_liquidity_for(1, 3.0, 100_000)
            .unwrap();

        assert_eq!(
            vec!((0, 2.0, 100_000), (1, 3.0, 100_000)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            Vec::<(u16, f64, u64)>::new(),
            liquidities(&market_liquidities.liquidities_against)
        );

        //------------------------------------------------------------------------------------------

        let result1 = update_market_liquidities_with_cross_liquidity(
            &market,
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(0, 2.0)], // missing source
        );
        assert!(result1.is_err());
        assert_eq!(
            Err(error!(CoreError::MarketLiquiditiesSourceLiquiditiesInvalid)),
            result1
        );

        let result2 = update_market_liquidities_with_cross_liquidity(
            &market,
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(1, 3.0), LiquiditySource::new(1, 2.0)], // duplicate outcomes
        );
        assert!(result2.is_err());
        assert_eq!(
            Err(error!(CoreError::MarketLiquiditiesSourceLiquiditiesInvalid)),
            result2
        );

        let result3 = update_market_liquidities_with_cross_liquidity(
            &market,
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(1, 3.0), LiquiditySource::new(3, 2.0)], // incorrect outcomes
        );
        assert!(result3.is_err());
        assert_eq!(
            Err(error!(CoreError::MarketLiquiditiesSourceLiquiditiesInvalid)),
            result3
        );

        assert_eq!(
            Vec::<(u16, f64, u64)>::new(),
            liquidities(&market_liquidities.liquidities_against)
        );
    }

    #[test]
    fn test_source_order_does_not_matter() {
        let mut market = mock_market(MarketStatus::Open);
        market.market_outcomes_count = 3;
        let mut market_liquidities = mock_market_liquidities(Pubkey::new_unique());
        market_liquidities
            .add_liquidity_for(0, 2.0, 100_000)
            .unwrap();
        market_liquidities
            .add_liquidity_for(1, 3.0, 100_000)
            .unwrap();

        assert_eq!(
            vec!((0, 2.0, 100_000), (1, 3.0, 100_000)),
            liquidities(&market_liquidities.liquidities_for)
        );
        assert_eq!(
            Vec::<(u16, f64, u64)>::new(),
            liquidities(&market_liquidities.liquidities_against)
        );

        //------------------------------------------------------------------------------------------

        update_market_liquidities_with_cross_liquidity(
            &market,
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(0, 2.0), LiquiditySource::new(1, 3.0)],
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        update_market_liquidities_with_cross_liquidity(
            &market,
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(1, 3.0), LiquiditySource::new(0, 2.0)],
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        assert_eq!(
            vec!((2, 6.0, 33_000)),
            liquidities(&market_liquidities.liquidities_against)
        );
    }

    #[test]
    fn test_2_way_market() {
        let mut market = mock_market(MarketStatus::Open);
        market.market_outcomes_count = 2;
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
            &market,
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(0, 3.0)],
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        update_market_liquidities_with_cross_liquidity(
            &market,
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(0, 3.5)],
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        update_market_liquidities_with_cross_liquidity(
            &market,
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(0, 4.125)],
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
        let mut market = mock_market(MarketStatus::Open);
        market.market_outcomes_count = 3;
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
            &market,
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(0, 2.1), LiquiditySource::new(1, 3.0)],
        )
        .expect("update_market_liquidities_with_cross_liquidity failed");

        update_market_liquidities_with_cross_liquidity(
            &market,
            &mut market_liquidities,
            true,
            vec![LiquiditySource::new(0, 2.0), LiquiditySource::new(1, 3.0)],
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
