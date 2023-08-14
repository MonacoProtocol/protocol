use anchor_lang::prelude::*;

use crate::context::MatchOrders;
use crate::error::CoreError;
use crate::instructions::matching::create_trade::initialize_trade;
use crate::instructions::{
    calculate_risk_from_stake, current_timestamp, matching, order, transfer,
};
use crate::state::market_account::MarketStatus::Open;
use crate::state::market_position_account::{MarketPosition, ProductMatchedRiskAndRate};
use crate::state::order_account::Order;

pub fn match_orders(ctx: &mut Context<MatchOrders>) -> Result<()> {
    let order_for = &mut ctx.accounts.order_for;
    let order_against = &mut ctx.accounts.order_against;

    // validate market
    require!(
        Open.eq(&ctx.accounts.market.market_status),
        CoreError::MarketNotOpen,
    );

    let now = current_timestamp();
    require!(
        ctx.accounts.market.market_lock_timestamp > now,
        CoreError::MarketLocked
    );

    // validate orders market-outcome-price
    require!(
        order_for.market_outcome_index == order_against.market_outcome_index,
        CoreError::MatchingMarketOutcomeMismatch
    );

    require!(
        order_for.expected_price <= order_against.expected_price,
        CoreError::MatchingMarketPriceMismatch
    );

    // validate that status is open or matched (for partial matches)
    require!(!order_for.is_completed(), CoreError::StatusClosed);
    require!(!order_against.is_completed(), CoreError::StatusClosed);

    // validate that both orders are not within their inplay delay
    require!(
        order_for.delay_expiration_timestamp < now
            && order_against.delay_expiration_timestamp < now,
        CoreError::InplayDelay
    );

    let selected_price = if order_for.creation_timestamp < order_against.creation_timestamp {
        order_for.expected_price
    } else {
        order_against.expected_price
    };

    // determine the matchable stake
    let stake_matched = order_for.stake_unmatched.min(order_against.stake_unmatched);

    let market_position_against = &mut ctx.accounts.market_position_against;
    let market_position_for = &mut ctx.accounts.market_position_for;
    // for orders from the same purchaser market-position passed is the same account
    let market_position_identical = market_position_against.key() == market_position_for.key();

    let change_in_exposure_refund_against;
    let change_in_exposure_refund_for;

    if order_against.creation_timestamp <= order_for.creation_timestamp {
        // 1. match against
        // -----------------------------
        change_in_exposure_refund_against = order::match_order(
            order_against,
            market_position_against,
            stake_matched,
            selected_price,
        )?;
        if market_position_identical {
            copy_market_position(market_position_against, market_position_for);
        }

        // 2. match for
        // -----------------------------
        change_in_exposure_refund_for = order::match_order(
            order_for,
            market_position_for,
            stake_matched,
            selected_price,
        )?;
        if market_position_identical {
            copy_market_position(market_position_for, market_position_against);
        }
    } else {
        // 1. match for
        // -----------------------------
        change_in_exposure_refund_for = order::match_order(
            order_for,
            market_position_for,
            stake_matched,
            selected_price,
        )?;
        if market_position_identical {
            copy_market_position(market_position_for, market_position_against);
        }
        // 2. match against
        // -----------------------------
        change_in_exposure_refund_against = order::match_order(
            order_against,
            market_position_against,
            stake_matched,
            selected_price,
        )?;
        if market_position_identical {
            copy_market_position(market_position_against, market_position_for);
        }
    };

    // update product commission tracking for matched risk
    update_product_commission_contributions(order_for, market_position_for, stake_matched)?;
    update_product_commission_contributions(
        order_against,
        market_position_against,
        calculate_risk_from_stake(stake_matched, selected_price),
    )?;

    // 3. market update
    // -----------------------------
    matching::update_on_match(
        &mut ctx.accounts.market_outcome,
        &mut ctx.accounts.market_matching_pool_against,
        &mut ctx.accounts.market_matching_pool_for,
        &ctx.accounts.market.key(),
        stake_matched,
        order_for,
        order_against,
    )?;

    // 4. if any refunds are due to change in exposure, transfer them
    if change_in_exposure_refund_against > 0_u64 {
        transfer::order_against_matching_refund(ctx, change_in_exposure_refund_against)?;
    }
    if change_in_exposure_refund_for > 0_u64 {
        transfer::order_for_matching_refund(ctx, change_in_exposure_refund_for)?;
    }

    // 5. Initialize the trade accounts
    let now = current_timestamp();
    initialize_trade(
        &mut ctx.accounts.trade_against,
        &ctx.accounts.order_against,
        &ctx.accounts.trade_for,
        stake_matched,
        selected_price,
        now,
        ctx.accounts.crank_operator.key(),
    );
    ctx.accounts.market.increment_unclosed_accounts_count()?;
    initialize_trade(
        &mut ctx.accounts.trade_for,
        &ctx.accounts.order_for,
        &ctx.accounts.trade_against,
        stake_matched,
        selected_price,
        now,
        ctx.accounts.crank_operator.key(),
    );
    ctx.accounts.market.increment_unclosed_accounts_count()?;

    Ok(())
}

fn copy_market_position(from: &MarketPosition, to: &mut MarketPosition) {
    for index in 0..from.market_outcome_sums.len() {
        to.market_outcome_sums[index] = from.market_outcome_sums[index];
        to.unmatched_exposures[index] = from.unmatched_exposures[index];
    }
}

fn update_product_commission_contributions(
    order: &Order,
    market_position: &mut MarketPosition,
    risk_matched: u64,
) -> Result<()> {
    market_position.matched_risk = market_position
        .matched_risk
        .checked_add(risk_matched)
        .unwrap();

    let order_product = order.product;
    if order_product.is_none() {
        return Ok(());
    }

    let order_product_commission_rate = order.product_commission_rate;
    let matched_risk_per_product = &mut market_position.matched_risk_per_product;

    // if rate has already been recorded for this product, increment matched risk, else push new value
    match matched_risk_per_product
        .iter_mut()
        .find(|p| p.product == order_product.unwrap() && p.rate == order_product_commission_rate)
    {
        Some(product_matched_risk_and_rate) => {
            product_matched_risk_and_rate.risk = product_matched_risk_and_rate
                .risk
                .checked_add(risk_matched)
                .unwrap();
        }
        None => {
            if matched_risk_per_product.len() < ProductMatchedRiskAndRate::MAX_LENGTH {
                matched_risk_per_product.push(ProductMatchedRiskAndRate {
                    product: order_product.unwrap(),
                    rate: order_product_commission_rate,
                    risk: risk_matched,
                });
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use solana_program::pubkey::Pubkey;

    use crate::instructions::matching::matching_one_to_one::update_product_commission_contributions;
    use crate::state::market_position_account::{MarketPosition, ProductMatchedRiskAndRate};
    use crate::state::order_account::{Order, OrderStatus};

    #[test]
    fn update_product_commissions_empty_vec() {
        let product = Some(Pubkey::new_unique());
        let product_commission_rate = 1.0;
        let stake_matched = 10;

        let order = Order {
            product,
            product_commission_rate: product_commission_rate,

            purchaser: Default::default(),
            market: Default::default(),
            market_outcome_index: 0,
            for_outcome: false,
            order_status: OrderStatus::Open,
            stake: 0,
            voided_stake: 0,
            expected_price: 0.0,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 0,
            payout: 0,
            payer: Default::default(),
        };

        let mut market_position = MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            unmatched_exposures: vec![],
            payer: Default::default(),
            matched_risk: 0,
            matched_risk_per_product: vec![],
        };

        update_product_commission_contributions(&order, &mut market_position, stake_matched)
            .unwrap();

        assert_eq!(
            market_position.matched_risk_per_product,
            vec![ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: product_commission_rate,
                risk: stake_matched,
            }]
        );
        assert_eq!(market_position.matched_risk, stake_matched);
    }

    #[test]
    fn update_product_commissions_rate_limit_reached_new_rate_not_tracked() {
        let product = Some(Pubkey::new_unique());
        let product_commission_rate = 7.0;
        let stake_matched = 10;

        let order = Order {
            product,
            product_commission_rate,

            purchaser: Default::default(),
            market: Default::default(),
            market_outcome_index: 0,
            for_outcome: false,
            order_status: OrderStatus::Open,
            stake: 0,
            voided_stake: 0,
            expected_price: 0.0,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 0,
            payout: 0,
            payer: Default::default(),
        };

        let matched_stake_per_rate = vec![
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 1.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 2.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 3.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 4.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 5.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 1.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 2.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 3.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 4.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 5.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 1.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 2.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 3.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 4.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 5.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 1.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 2.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 3.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 4.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 5.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 1.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 2.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 3.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 4.0,
                risk: 1,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 5.0,
                risk: 1,
            },
        ];

        let mut market_position = MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            unmatched_exposures: vec![],
            payer: Default::default(),
            matched_risk: 0,
            matched_risk_per_product: matched_stake_per_rate.clone(),
        };

        update_product_commission_contributions(&order, &mut market_position, stake_matched)
            .unwrap();

        assert_eq!(
            market_position.matched_risk_per_product,
            matched_stake_per_rate.clone()
        );
        assert_eq!(market_position.matched_risk, stake_matched);
    }

    #[test]
    fn update_product_commissions_product_already_stored_new_rate() {
        let product = Some(Pubkey::new_unique());
        let stake_matched = 10;
        let old_product_commission_rate = 1.0;
        let product_stake_rates = vec![ProductMatchedRiskAndRate {
            product: product.unwrap(),
            rate: old_product_commission_rate,
            risk: stake_matched,
        }];
        let new_product_commission_rate = 2.0;

        let order = Order {
            product,
            product_commission_rate: new_product_commission_rate,

            purchaser: Default::default(),
            market: Default::default(),
            market_outcome_index: 0,
            for_outcome: false,
            order_status: OrderStatus::Open,
            stake: 0,
            voided_stake: 0,
            expected_price: 0.0,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 0,
            payout: 0,
            payer: Default::default(),
        };

        let mut market_position = MarketPosition {
            matched_risk_per_product: product_stake_rates,
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            unmatched_exposures: vec![],
            payer: Default::default(),
            matched_risk: 0,
        };

        update_product_commission_contributions(&order, &mut market_position, stake_matched)
            .unwrap();

        assert_eq!(
            market_position.matched_risk_per_product,
            vec![
                ProductMatchedRiskAndRate {
                    product: product.unwrap(),
                    rate: old_product_commission_rate,
                    risk: stake_matched,
                },
                ProductMatchedRiskAndRate {
                    product: product.unwrap(),
                    rate: new_product_commission_rate,
                    risk: stake_matched,
                }
            ]
        );
        assert_eq!(market_position.matched_risk, stake_matched);
    }

    #[test]
    fn update_product_commissions_product_already_stored_existing_rate() {
        let product = Some(Pubkey::new_unique());
        let existing_stake_matched = 10;
        let product_commission_rate_1 = 1.0;
        let product_commission_rate_2 = 2.0;
        let product_stake_rates = vec![
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: product_commission_rate_1,
                risk: existing_stake_matched,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: product_commission_rate_2,
                risk: existing_stake_matched,
            },
        ];
        let new_stake_matched = 15;

        let expected_stake_matched_at_rate_2 = existing_stake_matched + new_stake_matched;

        let order = Order {
            product,
            product_commission_rate: product_commission_rate_2,

            purchaser: Default::default(),
            market: Default::default(),
            market_outcome_index: 0,
            for_outcome: false,
            order_status: OrderStatus::Open,
            stake: 0,
            voided_stake: 0,
            expected_price: 0.0,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 0,
            payout: 0,
            payer: Default::default(),
        };

        let mut market_position = MarketPosition {
            matched_risk_per_product: product_stake_rates,
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            unmatched_exposures: vec![],
            payer: Default::default(),
            matched_risk: 0,
        };

        update_product_commission_contributions(&order, &mut market_position, new_stake_matched)
            .unwrap();

        assert_eq!(
            market_position.matched_risk_per_product,
            vec![
                ProductMatchedRiskAndRate {
                    product: product.unwrap(),
                    rate: product_commission_rate_1,
                    risk: existing_stake_matched,
                },
                ProductMatchedRiskAndRate {
                    product: product.unwrap(),
                    rate: product_commission_rate_2,
                    risk: expected_stake_matched_at_rate_2,
                }
            ]
        );
        assert_eq!(market_position.matched_risk, new_stake_matched);
    }

    #[test]
    fn update_product_commissions_multiple_products() {
        let product = Some(Pubkey::new_unique());
        let product_2 = Some(Pubkey::new_unique());
        let product_commission_rate_2 = 5.0;
        let product_2_stake_matched = 42;

        let product_stake_rates = vec![
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 1.0,
                risk: 10,
            },
            ProductMatchedRiskAndRate {
                product: product.unwrap(),
                rate: 2.0,
                risk: 10,
            },
        ];

        let order = Order {
            product: product_2,
            product_commission_rate: product_commission_rate_2,

            purchaser: Default::default(),
            market: Default::default(),
            market_outcome_index: 0,
            for_outcome: false,
            order_status: OrderStatus::Open,
            stake: 0,
            voided_stake: 0,
            expected_price: 0.0,
            creation_timestamp: 0,
            delay_expiration_timestamp: 0,
            stake_unmatched: 0,
            payout: 0,
            payer: Default::default(),
        };

        let mut market_position = MarketPosition {
            matched_risk_per_product: product_stake_rates,

            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            unmatched_exposures: vec![],
            payer: Default::default(),
            matched_risk: 0,
        };

        update_product_commission_contributions(
            &order,
            &mut market_position,
            product_2_stake_matched,
        )
        .unwrap();

        assert_eq!(
            market_position.matched_risk_per_product,
            vec![
                ProductMatchedRiskAndRate {
                    product: product.unwrap(),
                    rate: 1.0,
                    risk: 10,
                },
                ProductMatchedRiskAndRate {
                    product: product.unwrap(),

                    rate: 2.0,
                    risk: 10,
                },
                ProductMatchedRiskAndRate {
                    product: product_2.unwrap(),
                    rate: product_commission_rate_2,
                    risk: product_2_stake_matched,
                },
            ]
        );
        assert_eq!(market_position.matched_risk, product_2_stake_matched);
    }
}
