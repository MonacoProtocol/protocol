use anchor_lang::prelude::*;
use solana_program::clock::UnixTimestamp;

use crate::context::CreateOrder;
use crate::error::CoreError;
use crate::instructions::math::stake_precision_is_within_range;
use crate::instructions::{calculate_risk_from_stake, market, market_position, matching, transfer};
use crate::state::market_account::*;
use crate::state::order_account::*;

pub fn create_order(ctx: Context<CreateOrder>, data: OrderData) -> Result<()> {
    initialize_order(
        &mut ctx.accounts.order,
        &ctx.accounts.market,
        &ctx.accounts.purchaser,
        &ctx.accounts.market_outcome,
        &data,
    )?;

    // initialize market position
    market_position::create_market_position(
        &ctx.accounts.purchaser,
        &ctx.accounts.market,
        &mut ctx.accounts.market_position,
    )?;

    let matching_pool = &mut ctx.accounts.market_matching_pool;

    // queues are always initialized with default items, so if this queue is new, initialize it
    if matching_pool.orders.size() == 0 {
        market::initialize_market_matching_pool(matching_pool, ctx.accounts.purchaser.key())?;
    }
    matching::update_matching_queue_with_new_order(matching_pool, &ctx.accounts.order)?;

    // expected payment
    let order = &ctx.accounts.order;
    let order_exposure = match order.for_outcome {
        true => order.stake,
        false => calculate_risk_from_stake(order.stake, order.expected_price),
    };

    // calculate payment
    let payment = ctx.accounts.market_position.update_on_creation(
        order.market_outcome_index as usize,
        order.for_outcome,
        order_exposure,
    )?;
    transfer::order_creation_payment(ctx, payment)?;

    Ok(())
}

fn initialize_order(
    order: &mut Account<Order>,
    market: &Account<Market>,
    purchaser: &Signer,
    market_outcome: &Account<MarketOutcome>,
    data: &OrderData,
) -> Result<()> {
    let now: UnixTimestamp = Clock::get().unwrap().unix_timestamp;
    validate_market_for_order(market, now)?;

    // validate
    msg!(
        "{} {}: {} @ {} ",
        if data.for_outcome { "for" } else { "against" },
        data.market_outcome_index,
        data.stake,
        data.price,
    );
    require!(data.stake > 0_u64, CoreError::CreationStakeZeroOrLess);
    require!(data.price > 1_f64, CoreError::CreationPriceOneOrLess);
    require!(
        stake_precision_is_within_range(data.stake, market.decimal_limit),
        CoreError::CreationStakePrecisionIsTooHigh
    );
    require!(
        market_outcome.price_ladder.contains(&data.price),
        CoreError::CreationInvalidPrice
    );

    // update the order account with data we have received from the caller
    order.market = market.key();
    order.market_outcome_index = data.market_outcome_index;
    order.for_outcome = data.for_outcome;

    order.purchaser = purchaser.key();

    order.order_status = OrderStatus::Open;
    order.stake = data.stake;
    order.expected_price = data.price;
    order.creation_timestamp = now;

    order.stake_unmatched = data.stake;
    order.payout = 0_u64;

    Ok(())
}

fn validate_market_for_order(market: &Market, now: UnixTimestamp) -> Result<()> {
    let market_lock_timestamp = &market.market_lock_timestamp;
    let status = &market.market_status;

    require!(
        status == &MarketStatus::Open,
        CoreError::CreationMarketNotOpen
    );

    require!(
        market.market_winning_outcome_index.is_none(),
        CoreError::CreationMarketHasWinningOutcome
    );

    require!(!market.suspended, CoreError::CreationMarketSuspended);

    require!(
        *market_lock_timestamp > now,
        CoreError::CreationMarketLocked
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::market_type::EVENT_RESULT_WINNER;

    #[test]
    fn test_market_valid() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, false, MarketStatus::Open, None);

        let result = validate_market_for_order(&market, now);
        assert!(result.is_ok());
    }

    #[test]
    fn market_lock_time_in_past() {
        let time_in_past: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_past, false, MarketStatus::Open, None);

        let result = validate_market_for_order(&market, time_in_future);

        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("CreationMarketLocked"));
    }

    #[test]
    fn market_not_open() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, false, MarketStatus::Settled, None);

        let result = validate_market_for_order(&market, now);

        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("CreationMarketNotOpen"));
    }

    #[test]
    fn market_suspended() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, true, MarketStatus::Open, None);

        let result = validate_market_for_order(&market, now);

        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("CreationMarketSuspended"));
    }

    #[test]
    fn winning_outcome_set() {
        let now: i64 = 1575975177;
        let time_in_future: i64 = 43041841910;

        let market = create_test_market(time_in_future, false, MarketStatus::Open, Some(1));

        let result = validate_market_for_order(&market, now);

        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("CreationMarketHasWinningOutcome"));
    }

    fn create_test_market(
        market_lock_timestamp: UnixTimestamp,
        suspended: bool,
        market_status: MarketStatus,
        market_winning_outcome_index: Option<u16>,
    ) -> Market {
        Market {
            authority: Pubkey::new_unique(),
            event_account: Pubkey::new_unique(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index,
            market_type: String::from(EVENT_RESULT_WINNER),
            market_lock_timestamp,
            market_settle_timestamp: None,
            title: String::from("META"),
            market_status,
            escrow_account_bump: 0,
            published: true,
            suspended,
        }
    }
}
