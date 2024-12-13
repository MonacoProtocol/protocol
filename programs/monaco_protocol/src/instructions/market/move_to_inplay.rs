use anchor_lang::prelude::*;

use crate::error::CoreError;
use crate::instructions::current_timestamp;
use crate::state::market_account::Market;
use crate::state::market_account::MarketStatus::Open;
use crate::state::market_liquidities::MarketLiquidities;

pub fn move_market_to_inplay(
    market: &mut Market,
    market_liquidities: &mut MarketLiquidities,
) -> Result<()> {
    let now = current_timestamp();

    require!(
        Open.eq(&market.market_status),
        CoreError::MarketNotOpenForInplay
    );

    // market must have inplay enabled
    require!(market.inplay_enabled, CoreError::MarketInplayNotEnabled);

    // set it `true` only if it's `false`
    require!(!market.inplay, CoreError::MarketAlreadyInplay);

    // set it `true` only if now is after event start
    require!(
        market.event_start_timestamp <= now,
        CoreError::MarketEventNotStarted,
    );

    market.move_to_inplay();
    market_liquidities.move_to_inplay(&market.event_start_order_behaviour);

    Ok(())
}

pub fn move_market_to_inplay_if_needed(
    market: &mut Market,
    market_liquidities: &mut MarketLiquidities,
) -> Result<()> {
    let now = current_timestamp();

    require!(
        Open.eq(&market.market_status),
        CoreError::MarketNotOpenForInplay
    );

    if market.inplay_enabled && market.event_start_timestamp <= now && !market.inplay {
        market.move_to_inplay();
        market_liquidities.move_to_inplay(&market.event_start_order_behaviour);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::instructions::current_timestamp;
    use crate::instructions::market::move_market_to_inplay;
    use crate::state::market_account::{mock_market, Market, MarketOrderBehaviour, MarketStatus};
    use crate::state::market_liquidities::{mock_market_liquidities, MarketLiquidities};
    use solana_program::pubkey::Pubkey;

    fn market_setup() -> Market {
        let mut market = mock_market(MarketStatus::Open);
        market.inplay_enabled = true;
        market.inplay = false;
        market.market_lock_timestamp = current_timestamp() + 1000000001;
        market.event_start_timestamp = current_timestamp() - 1000000000;
        market.event_start_order_behaviour = MarketOrderBehaviour::CancelUnmatched;
        return market;
    }

    fn liquidities_setup() -> MarketLiquidities {
        let mut market_liquidities = mock_market_liquidities(Pubkey::new_unique());
        market_liquidities.add_liquidity_for(0, 2.0, 1).expect("");
        market_liquidities.add_liquidity_for(0, 3.0, 1).expect("");
        market_liquidities.add_liquidity_for(0, 4.0, 1).expect("");
        market_liquidities
            .add_liquidity_against(0, 2.0, 1)
            .expect("");
        market_liquidities
            .add_liquidity_against(0, 3.0, 1)
            .expect("");
        market_liquidities
            .add_liquidity_against(0, 4.0, 1)
            .expect("");
        return market_liquidities;
    }

    #[test]
    fn test_market_move_to_inplay_success() {
        let mut market: Market = market_setup();
        let mut market_liquidities = liquidities_setup();
        let result = move_market_to_inplay(&mut market, &mut market_liquidities);
        assert!(result.is_ok());
        assert_eq!(0, market_liquidities.liquidities_for.len());
        assert_eq!(0, market_liquidities.liquidities_against.len());
    }

    #[test]
    fn test_market_move_to_inplay_not_cancel_unmatched_success() {
        let mut market: Market = market_setup();
        let mut market_liquidities = liquidities_setup();
        let for_len_before = market_liquidities.liquidities_for.len();
        let against_len_before = market_liquidities.liquidities_against.len();
        assert!(for_len_before > 0 && against_len_before > 0);
        market.event_start_order_behaviour = MarketOrderBehaviour::None;
        let result = move_market_to_inplay(&mut market, &mut market_liquidities);
        assert!(result.is_ok());
        assert_eq!(for_len_before, market_liquidities.liquidities_for.len());
        assert_eq!(
            against_len_before,
            market_liquidities.liquidities_against.len()
        );
    }

    #[test]
    fn test_market_move_to_inplay_failure_not_inplay() {
        let mut market: Market = market_setup();
        let mut market_liquidities = liquidities_setup();
        market.inplay_enabled = false;
        let result = move_market_to_inplay(&mut market, &mut market_liquidities);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("market inplay not enabled"));
    }

    #[test]
    fn test_market_move_to_inplay_not_started() {
        let mut market: Market = market_setup();
        let mut market_liquidities = liquidities_setup();
        market.event_start_timestamp = current_timestamp() + 1000000000;
        let result = move_market_to_inplay(&mut market, &mut market_liquidities);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("market event not started"));
    }

    #[test]
    fn test_market_move_to_inplay_failure_already_inplay() {
        let mut market: Market = market_setup();
        let mut market_liquidities = liquidities_setup();
        market.inplay = true;
        let result = move_market_to_inplay(&mut market, &mut market_liquidities);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("market is already inplay"));
    }

    #[test]
    fn test_market_move_to_inplay_failure_market_not_open_initializing() {
        let mut market: Market = market_setup();
        let mut market_liquidities = liquidities_setup();
        market.market_status = MarketStatus::Initializing;
        let result = move_market_to_inplay(&mut market, &mut market_liquidities);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("market not open to allow transition to inplay"));
    }

    #[test]
    fn test_market_move_to_inplay_failure_market_not_open_settled() {
        let mut market: Market = market_setup();
        let mut market_liquidities = liquidities_setup();
        market.market_status = MarketStatus::Settled;
        let result = move_market_to_inplay(&mut market, &mut market_liquidities);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("market not open to allow transition to inplay"));
    }
}
