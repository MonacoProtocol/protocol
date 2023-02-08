use anchor_lang::prelude::*;

use crate::context::{CreateMarket, InitializeMarketOutcome};
use crate::monaco_protocol::PRICE_SCALE;
use crate::state::market_account::{
    Cirque, Market, MarketMatchingPool, MarketOutcome, MarketStatus,
};
use crate::CoreError;

pub fn create(
    ctx: Context<CreateMarket>,
    event_account: Pubkey,
    market_type: String,
    market_lock_timestamp: i64,
    title: String,
    max_decimals: u8,
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

fn verify_prices_precision(prices: &[f64]) -> Result<()> {
    require!(
        prices
            .iter()
            .all(|&value| format!("{value}") <= format!("{value:.3}")),
        CoreError::MarketPricePrecisionTooLarge
    );
    Ok(())
}

pub fn initialize_market_matching_pool(
    matching_pool: &mut Account<MarketMatchingPool>,
    purchaser: Pubkey,
) -> Result<()> {
    matching_pool.purchaser = purchaser;
    matching_pool.liquidity_amount = 0_u64;
    matching_pool.matched_amount = 0_u64;
    matching_pool.orders = Cirque::new(MarketMatchingPool::QUEUE_LENGTH);
    Ok(())
}

pub fn add_prices_to_market_outcome(
    market_outcome: &mut MarketOutcome,
    new_prices: Vec<f64>,
) -> Result<()> {
    verify_prices_precision(&new_prices)?;

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
        add_prices_to_market_outcome, verify_prices_precision,
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
    fn test_verify_prices_precision() {
        let ok = verify_prices_precision(&vec![1.111, 1.11, 1.1, 1_f64]);
        assert!(ok.is_ok());

        let not_ok_0 = verify_prices_precision(&vec![1.1111, 1.111, 1.11, 1.1, 1_f64]);
        assert!(not_ok_0.is_err());

        let not_ok_1 = verify_prices_precision(&vec![1.111, 1.1111, 1.11, 1.1, 1_f64]);
        assert!(not_ok_1.is_err());

        let not_ok_2 = verify_prices_precision(&vec![1.111, 1.11, 1.1111, 1.1, 1_f64]);
        assert!(not_ok_2.is_err());

        let not_ok_3 = verify_prices_precision(&vec![1.111, 1.11, 1.1, 1_f64, 1.1111]);
        assert!(not_ok_3.is_err());
    }
}
