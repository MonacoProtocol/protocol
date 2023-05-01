use crate::instructions::{calculate_commission, transfer};
use crate::SettleMarketPosition;
use anchor_lang::prelude::*;
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use solana_program::log;
use std::convert::TryFrom;
use std::ops::{Div, Mul};

use crate::error::CoreError;
use crate::state::market_position_account::{MarketPosition, MatchedRiskAtRate};
use crate::state::payments_queue::{PaymentInfo, PaymentQueue};

pub fn settle_market_position(ctx: Context<SettleMarketPosition>) -> Result<()> {
    let market_position = &mut ctx.accounts.market_position;
    if market_position.paid {
        log::sol_log("market position has already been paid out");
        return Ok(());
    }

    let market_account = &ctx.accounts.market;
    // validate the market is settled
    require!(
        market_account.market_winning_outcome_index.is_some(),
        CoreError::SettlementMarketNotSettled
    );

    let payment_queue = &mut ctx.accounts.commission_payment_queue.payment_queue;
    let position_profit = market_position.market_outcome_sums
        [market_account.market_winning_outcome_index.unwrap() as usize];
    let max_exposure = market_position.max_exposure();

    let protocol_commission = calculate_commission(
        ctx.accounts.protocol_config.commission_rate,
        position_profit,
    );
    enqueue_payment(
        payment_queue,
        &PaymentInfo {
            to: ctx.accounts.protocol_config.key(),
            from: ctx.accounts.market_escrow.key(),
            amount: protocol_commission,
        },
    )?;

    let (total_product_commission, product_commission_payments) =
        calculate_product_commission_payments(
            ctx.accounts.protocol_config.commission_rate,
            ctx.accounts.market_escrow.key(),
            market_position,
            position_profit,
        );
    product_commission_payments
        .iter()
        .try_for_each(|p| -> Result<()> { enqueue_payment(payment_queue, p) })?;

    let total_payout = position_profit
        // protocol_commission > 0 only if position_profit > 0
        .checked_sub(i128::from(protocol_commission))
        .ok_or(CoreError::SettlementPaymentCalculation)?
        .checked_sub(i128::from(total_product_commission))
        .ok_or(CoreError::SettlementPaymentCalculation)?
        .checked_add(i128::from(max_exposure))
        .ok_or(CoreError::SettlementPaymentCalculation)?;
    let total_payout_u64 =
        u64::try_from(total_payout).map_err(|_| CoreError::SettlementPaymentCalculation)?;

    market_position.paid = true;

    transfer::transfer_protocol_commission(&ctx, protocol_commission)?;
    transfer::transfer_market_position(&ctx, total_payout_u64)?;

    Ok(())
}

fn enqueue_payment(payment_queue: &mut PaymentQueue, payment: &PaymentInfo) -> Result<()> {
    if payment.amount > 0 {
        payment_queue
            .enqueue(*payment)
            .ok_or(CoreError::SettlementPaymentQueueFull)?;
    }
    Ok(())
}

fn calculate_product_commission_payments(
    protocol_commission_rate: f64,
    market_escrow: Pubkey,
    market_position: &MarketPosition,
    position_profit: i128,
) -> (u64, Vec<PaymentInfo>) {
    if position_profit <= 0 {
        return (0, vec![]);
    }

    let mut payments = vec![];
    let mut total_product_commissions = 0_u64;

    for risk_per_product in &market_position.matched_risk_per_product {
        let mut product_commission = 0_u64;
        for risk_per_rate in &risk_per_product.matched_risk_per_rate {
            let product_commission_at_rate = calculate_commission_for_risk_at_rate(
                protocol_commission_rate,
                market_position.total_matched_risk,
                position_profit,
                risk_per_rate,
            );
            product_commission = product_commission
                .checked_add(product_commission_at_rate)
                .unwrap();
        }

        payments.push(PaymentInfo {
            to: risk_per_product.product,
            from: market_escrow,
            amount: product_commission,
        });

        total_product_commissions = total_product_commissions
            .checked_add(product_commission)
            .unwrap();
    }

    (total_product_commissions, payments)
}

fn calculate_commission_for_risk_at_rate(
    protocol_commission_rate: f64,
    total_risked: u64,
    position_profit: i128,
    risk_per_rate: &MatchedRiskAtRate,
) -> u64 {
    if risk_per_rate.risk == 0 || total_risked == 0 {
        return 0;
    }

    let profit = available_profit_for_commission(total_risked, position_profit, risk_per_rate.risk);

    if (protocol_commission_rate + risk_per_rate.rate) <= 100.0 {
        return calculate_commission(risk_per_rate.rate, profit as i128);
    }

    // where product + protocol commission rates > 100%, protocol commission will be deducted before
    // returning remaining profit as product commission
    let protocol_commission = calculate_commission(protocol_commission_rate, profit as i128);
    profit.saturating_sub(protocol_commission)
}

fn available_profit_for_commission(
    total_matched: u64,
    position_profit: i128,
    matched_risk_portion: u64,
) -> u64 {
    let percent_of_total = Decimal::from(matched_risk_portion).div(Decimal::from(total_matched));
    Decimal::from(position_profit)
        .mul(percent_of_total)
        .to_u64()
        .unwrap()
}

#[cfg(test)]
mod tests {
    use crate::instructions::market_position::settle_market_position::{
        calculate_commission_for_risk_at_rate, calculate_product_commission_payments,
    };
    use crate::state::market_position_account::{
        MarketPosition, MatchedRiskAtRate, ProductMatchedRisk,
    };
    use crate::state::payments_queue::PaymentInfo;
    use protocol_product::state::product::Product;
    use solana_program::pubkey::Pubkey;

    //  calculate_commission_at_rate

    #[test]
    fn low_rate() {
        let protocol_commission_rate = 10.0;
        let total_matched = 10;
        let position_profit = 100;
        let risk_per_rate = MatchedRiskAtRate {
            risk: 10,
            rate: 1.0,
        };

        let product_commission = calculate_commission_for_risk_at_rate(
            protocol_commission_rate,
            total_matched,
            position_profit,
            &risk_per_rate,
        );

        assert_eq!(product_commission, 1);
    }

    #[test]
    fn high_rate_product_commission_is_reduced() {
        let protocol_commission_rate = 10.0;
        let total_matched = 10;
        let position_profit = 100;
        let risk_per_rate = MatchedRiskAtRate {
            risk: 10,
            rate: 100.0,
        };

        let product_commission = calculate_commission_for_risk_at_rate(
            protocol_commission_rate,
            total_matched,
            position_profit,
            &risk_per_rate,
        );

        // where high product commissions are charged, the product commission will be the min of either:
        // - its share of the profit pool ($100)
        // - its share of the profit pool AFTER protocol commission has been taken ($100 - $10)
        assert_eq!(product_commission, 90);
    }

    #[test]
    fn zero_product_commission_protocol_commission_calculated() {
        let protocol_commission_rate = 10.0;
        let total_matched = 10;
        let position_profit = 100;
        let risk_per_rate = MatchedRiskAtRate {
            risk: 10,
            rate: 0.0,
        };

        let product_commission = calculate_commission_for_risk_at_rate(
            protocol_commission_rate,
            total_matched,
            position_profit,
            &risk_per_rate,
        );

        assert_eq!(product_commission, 0);
    }

    #[test]
    fn zero_commissions() {
        let protocol_commission_rate = 00.0;
        let total_matched = 10;
        let position_profit = 100;
        let risk_per_rate = MatchedRiskAtRate {
            risk: 10,
            rate: 0.0,
        };

        let product_commission = calculate_commission_for_risk_at_rate(
            protocol_commission_rate,
            total_matched,
            position_profit,
            &risk_per_rate,
        );

        assert_eq!(product_commission, 0);
    }

    #[test]
    fn high_product_rate_no_protocol_commission() {
        let protocol_commission_rate = 0.0;
        let total_matched = 10;
        let position_profit = 100;
        let risk_per_rate = MatchedRiskAtRate {
            risk: 10,
            rate: 100.0,
        };

        let product_commission = calculate_commission_for_risk_at_rate(
            protocol_commission_rate,
            total_matched,
            position_profit,
            &risk_per_rate,
        );

        assert_eq!(product_commission, 100);
    }

    #[test]
    fn low_profit_round_in_favor_of_user_profit() {
        let protocol_commission_rate = 33.99;
        let total_matched = 10;
        let position_profit = 10;
        let risk_per_rate = MatchedRiskAtRate {
            risk: 10,
            rate: 33.99,
        };

        let product_commission = calculate_commission_for_risk_at_rate(
            protocol_commission_rate,
            total_matched,
            position_profit,
            &risk_per_rate,
        );

        assert_eq!(product_commission, 3);
    }

    #[test]
    fn high_profit_round_in_favor_of_user_profit() {
        let protocol_commission_rate = 33.99;
        let total_matched = 10;
        let position_profit = 1000;
        let risk_per_rate = MatchedRiskAtRate {
            risk: 10,
            rate: 33.99,
        };

        let product_commission = calculate_commission_for_risk_at_rate(
            protocol_commission_rate,
            total_matched,
            position_profit,
            &risk_per_rate,
        );

        assert_eq!(product_commission, 339);
    }

    #[test]
    fn zero_total_matched() {
        let protocol_commission_rate = 1.0;
        let total_matched = 0;
        let position_profit = 0;
        let risk_per_rate = MatchedRiskAtRate {
            risk: 10,
            rate: 1.0,
        };

        let product_commission = calculate_commission_for_risk_at_rate(
            protocol_commission_rate,
            total_matched,
            position_profit,
            &risk_per_rate,
        );

        assert_eq!(product_commission, 0);
    }

    #[test]
    fn zero_matched_at_rate() {
        let protocol_commission_rate = 1.0;
        let total_matched = 10;
        let position_profit = 0;
        let risk_per_rate = MatchedRiskAtRate { risk: 0, rate: 1.0 };

        let product_commission = calculate_commission_for_risk_at_rate(
            protocol_commission_rate,
            total_matched,
            position_profit,
            &risk_per_rate,
        );

        assert_eq!(product_commission, 0);
    }

    // calculate_commission_payments

    #[test]
    fn calculate_commission_payments_single_product_single_rate() {
        let protocol_product = Product {
            authority: Default::default(),
            payer: Default::default(),
            commission_escrow: Pubkey::new_unique(),
            product_title: "".to_string(),
            commission_rate: 10.0,
        };
        let market_escrow = Pubkey::new_unique();

        let product_pk = Pubkey::new_unique();
        let product_matched_risk = ProductMatchedRisk {
            product: product_pk,
            matched_risk_per_rate: vec![MatchedRiskAtRate {
                risk: 10,
                rate: 5.0,
            }],
        };
        let market_position = MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            outcome_max_exposure: vec![],
            total_matched_risk: 10,
            matched_risk_per_product: vec![product_matched_risk],
        };
        let position_profit = 100;

        let (product_commissions, payments) = calculate_product_commission_payments(
            protocol_product.commission_rate,
            market_escrow,
            &market_position,
            position_profit,
        );
        assert_eq!(product_commissions, 5);
        assert_eq!(
            payments,
            vec![PaymentInfo {
                to: product_pk,
                from: market_escrow,
                amount: 5,
            }]
        )
    }

    #[test]
    fn calculate_commission_payments_one_product_multiple_rates() {
        let protocol_product = Product {
            authority: Default::default(),
            payer: Default::default(),
            commission_escrow: Pubkey::new_unique(),
            product_title: "".to_string(),
            commission_rate: 10.0,
        };
        let market_escrow = Pubkey::new_unique();

        let product_pk = Pubkey::new_unique();
        let matched_risk_for_product = vec![
            MatchedRiskAtRate {
                risk: 5,
                rate: 10.0,
            },
            MatchedRiskAtRate {
                risk: 5,
                rate: 20.0,
            },
        ];
        let product_matched_risk = ProductMatchedRisk {
            product: product_pk,
            matched_risk_per_rate: matched_risk_for_product,
        };

        let market_position = MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            outcome_max_exposure: vec![],
            total_matched_risk: 10,
            matched_risk_per_product: vec![product_matched_risk],
        };
        let position_profit = 100;

        let (product_commissions, payments) = calculate_product_commission_payments(
            protocol_product.commission_rate,
            market_escrow,
            &market_position,
            position_profit,
        );

        // 10 % of (50% of $100) + 20% of (50% of $100)
        let expected_product_commissions = 15;

        assert_eq!(product_commissions, expected_product_commissions);
        assert_eq!(
            payments,
            vec![PaymentInfo {
                to: product_pk,
                from: market_escrow,
                amount: expected_product_commissions,
            }]
        )
    }

    #[test]
    fn calculate_commission_payments_multiple_product_multiple_rates() {
        let protocol_product = Product {
            authority: Default::default(),
            payer: Default::default(),
            commission_escrow: Pubkey::new_unique(),
            product_title: "".to_string(),
            commission_rate: 10.0,
        };
        let market_escrow = Pubkey::new_unique();

        let product_pk = Pubkey::new_unique();
        let matched_risk_product = vec![
            MatchedRiskAtRate {
                risk: 5,
                rate: 10.0,
            },
            MatchedRiskAtRate {
                risk: 5,
                rate: 20.0,
            },
        ];
        let product_matched_risk = ProductMatchedRisk {
            product: product_pk,
            matched_risk_per_rate: matched_risk_product,
        };

        let matched_risk_product2 = vec![
            MatchedRiskAtRate {
                risk: 5,
                rate: 30.0,
            },
            MatchedRiskAtRate {
                risk: 5,
                rate: 40.0,
            },
        ];
        let product2_pk = Pubkey::new_unique();
        let product2_matched_risk = ProductMatchedRisk {
            product: product2_pk,
            matched_risk_per_rate: matched_risk_product2,
        };

        let market_position = MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            outcome_max_exposure: vec![],
            total_matched_risk: 20,
            matched_risk_per_product: vec![product_matched_risk, product2_matched_risk],
        };
        let position_profit = 400;

        let (product_commissions, payments) = calculate_product_commission_payments(
            protocol_product.commission_rate,
            market_escrow,
            &market_position,
            position_profit,
        );

        // each portion of matched risk represents 25% of the total matched risk
        // 25% of 400 = 100
        // commissions = (10%  of 100) + (20% of 100) + (30% of 100) + (40% of 100)
        let product1_expected_commissions = 30;
        let product2_expected_commissions = 70;
        let expected_total_product_commissions =
            product1_expected_commissions + product2_expected_commissions;

        assert_eq!(product_commissions, expected_total_product_commissions);
        assert_eq!(
            payments,
            vec![
                PaymentInfo {
                    to: product_pk,
                    from: market_escrow,
                    amount: product1_expected_commissions,
                },
                PaymentInfo {
                    to: product2_pk,
                    from: market_escrow,
                    amount: product2_expected_commissions,
                }
            ]
        )
    }
}
