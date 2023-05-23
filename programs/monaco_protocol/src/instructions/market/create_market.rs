use anchor_lang::prelude::*;
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;

use crate::context::{CreateMarket, InitializeMarketOutcome};
use crate::monaco_protocol::PRICE_SCALE;
use crate::state::market_account::{
    Cirque, Market, MarketMatchingPool, MarketOrderBehaviour, MarketOutcome, MarketStatus,
};
use crate::CoreError;

pub fn create(
    ctx: Context<CreateMarket>,
    event_account: Pubkey,
    market_type: String,
    market_lock_timestamp: i64,
    title: String,
    max_decimals: u8,
    event_start_timestamp: i64,
    inplay_enabled: bool,
    inplay_order_delay: u8,
    event_start_order_behaviour: MarketOrderBehaviour,
    market_lock_order_behaviour: MarketOrderBehaviour,
) -> Result<()> {
    require!(
        title.len() <= Market::TITLE_MAX_LENGTH,
        CoreError::MarketTitleTooLong
    );
    require!(
        market_lock_timestamp > Clock::get().unwrap().unix_timestamp,
        CoreError::MarketLockTimeNotInTheFuture
    );
    require!(
        inplay_enabled || market_lock_timestamp <= event_start_timestamp,
        CoreError::MarketLockTimeAfterEventStartTime
    );
    require!(
        ctx.accounts.mint.decimals >= PRICE_SCALE,
        CoreError::MintDecimalsUnsupported
    );
    let decimal_limit = ctx.accounts.mint.decimals.saturating_sub(max_decimals);
    require!(PRICE_SCALE <= decimal_limit, CoreError::MaxDecimalsTooLarge);

    ctx.accounts.market.authority = ctx.accounts.market_operator.key();

    ctx.accounts.market.event_account = event_account;
    ctx.accounts.market.market_type = market_type;
    ctx.accounts.market.market_outcomes_count = 0_u16;
    ctx.accounts.market.market_winning_outcome_index = None;
    ctx.accounts.market.market_lock_timestamp = market_lock_timestamp;
    ctx.accounts.market.market_settle_timestamp = None;
    ctx.accounts.market.title = title;
    ctx.accounts.market.mint_account = ctx.accounts.mint.key();
    ctx.accounts.market.decimal_limit = decimal_limit;
    ctx.accounts.market.escrow_account_bump = *ctx.bumps.get("escrow").unwrap();
    ctx.accounts.market.market_status = MarketStatus::Initializing;
    ctx.accounts.market.published = false;
    ctx.accounts.market.suspended = false;
    ctx.accounts.market.event_start_timestamp = event_start_timestamp;
    ctx.accounts.market.inplay_enabled = inplay_enabled;
    ctx.accounts.market.event_start_order_behaviour = event_start_order_behaviour;
    ctx.accounts.market.market_lock_order_behaviour = market_lock_order_behaviour;
    ctx.accounts.market.inplay_order_delay = if inplay_enabled {
        inplay_order_delay
    } else {
        0
    };
    ctx.accounts.market.inplay = if inplay_enabled {
        event_start_timestamp <= Clock::get().unwrap().unix_timestamp
    } else {
        false
    };

    Ok(())
}

pub fn initialize_outcome(ctx: Context<InitializeMarketOutcome>, title: String) -> Result<()> {
    require!(
        ctx.accounts.market.market_status == MarketStatus::Initializing,
        CoreError::MarketOutcomeMarketInvalidStatus
    );

    ctx.accounts.outcome.market = ctx.accounts.market.key();
    ctx.accounts.outcome.index = ctx.accounts.market.market_outcomes_count;
    ctx.accounts.outcome.title = title;
    ctx.accounts.outcome.latest_matched_price = 0_f64;
    ctx.accounts.outcome.matched_total = 0_u64;
    ctx.accounts.outcome.price_ladder = vec![];

    ctx.accounts
        .market
        .increment_market_outcomes_count()
        .map_err(|_| CoreError::MarketOutcomeInitError)?;

    Ok(())
}

fn validate_prices(prices: &[f64]) -> Result<()> {
    let prices_iter = prices.iter();
    for price in prices_iter {
        let decimal = Decimal::from_f64(*price).unwrap();
        let decimal_with_scale = decimal.trunc_with_scale(3);

        require!(
            decimal.eq(&decimal_with_scale),
            CoreError::MarketPricePrecisionTooLarge
        );
        require!(*price > 1_f64, CoreError::MarketPriceOneOrLess);
    }
    Ok(())
}

pub fn initialize_market_matching_pool(
    matching_pool: &mut Account<MarketMatchingPool>,
    market: &Account<Market>,
    purchaser: Pubkey,
) -> Result<()> {
    matching_pool.market = market.key();
    matching_pool.purchaser = purchaser;
    matching_pool.liquidity_amount = 0_u64;
    matching_pool.matched_amount = 0_u64;
    matching_pool.orders = Cirque::new(MarketMatchingPool::QUEUE_LENGTH);
    matching_pool.inplay = market.inplay;
    Ok(())
}

pub fn add_prices_to_market_outcome(
    market_outcome: &mut MarketOutcome,
    new_prices: Vec<f64>,
) -> Result<()> {
    validate_prices(&new_prices)?;

    let mut ladder = market_outcome.price_ladder.clone();

    ladder.extend(new_prices.into_iter());
    ladder.sort_by(|a, b| a.partial_cmp(b).unwrap());
    ladder.dedup();

    market_outcome.price_ladder = ladder;

    require!(
        market_outcome.price_ladder.len() < MarketOutcome::PRICE_LADDER_LENGTH,
        CoreError::MarketPriceListIsFull
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::instructions::market::create_market::{
        add_prices_to_market_outcome, validate_prices,
    };
    use crate::MarketOutcome;

    #[test]
    fn test_add_prices_to_market_outcome() {
        let new_prices = vec![1.11, 1.12, 1.13, 1.4];
        let existing_prices = vec![1.2, 1.3, 1.4, 1.4];

        let mut outcome = MarketOutcome {
            market: Default::default(),
            index: 0_u16,
            title: "".to_string(),
            latest_matched_price: 0.0,
            matched_total: 0,
            price_ladder: existing_prices,
        };

        let result = add_prices_to_market_outcome(&mut outcome, new_prices);
        assert!(result.is_ok());
        assert_eq!(outcome.price_ladder.len(), 6);
        assert_eq!(outcome.price_ladder, vec![1.11, 1.12, 1.13, 1.2, 1.3, 1.4]);
    }

    #[test]
    fn test_validate_prices() {
        let precision_ok = validate_prices(&vec![1.111, 1.11, 1.1]);
        assert!(precision_ok.is_ok());

        let precision_not_ok_0 = validate_prices(&vec![1.1111, 1.111, 1.11, 1.1]);
        assert!(precision_not_ok_0.is_err());

        let precision_not_ok_1 = validate_prices(&vec![1.111, 1.1111, 1.11, 1.1]);
        assert!(precision_not_ok_1.is_err());

        let precision_not_ok_2 = validate_prices(&vec![1.111, 1.11, 1.1111, 1.1]);
        assert!(precision_not_ok_2.is_err());

        let precision_not_ok_3 = validate_prices(&vec![1.111, 1.11, 1.1, 1_f64, 1.1111]);
        assert!(precision_not_ok_3.is_err());

        let attempting_to_round_not_ok = validate_prices(&vec![1.1118]);
        assert!(attempting_to_round_not_ok.is_err());

        let attempting_to_round_2_not_ok = validate_prices(&vec![9.9999]);
        assert!(attempting_to_round_2_not_ok.is_err());

        let one_not_ok = validate_prices(&vec![1_f64]);
        assert!(one_not_ok.is_err());

        let fraction_not_ok = validate_prices(&vec![0.5_f64]);
        assert!(fraction_not_ok.is_err());

        let zero_not_ok = validate_prices(&vec![0_f64]);
        assert!(zero_not_ok.is_err());

        let neg_not_ok = validate_prices(&vec![-1_f64]);
        assert!(neg_not_ok.is_err());
    }
}
