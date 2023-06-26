use crate::instructions::{calculate_commission, calculate_post_commission_remainder, transfer};
use crate::SettleMarketPosition;
use anchor_lang::prelude::*;
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use solana_program::log;
use std::convert::TryFrom;
use std::ops::{Div, Mul};

use crate::error::CoreError;
use crate::state::market_position_account::{MarketPosition, ProductMatchedRiskAndRate};
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

    transfer::transfer_market_position(&ctx, total_payout_u64)
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

    for product_risk_and_rate in &market_position.matched_risk_per_product {
        let product_commission_at_rate = calculate_commission_for_risk_at_rate(
            protocol_commission_rate,
            market_position.matched_risk,
            position_profit,
            product_risk_and_rate,
        );

        payments.push(PaymentInfo {
            to: product_risk_and_rate.product,
            from: market_escrow,
            amount: product_commission_at_rate,
        });

        total_product_commissions = total_product_commissions
            .checked_add(product_commission_at_rate)
            .unwrap();
    }

    (total_product_commissions, payments)
}

fn calculate_commission_for_risk_at_rate(
    protocol_commission_rate: f64,
    position_matched_risk: u64,
    position_profit: i128,
    product_risk_and_rate: &ProductMatchedRiskAndRate,
) -> u64 {
    if product_risk_and_rate.risk == 0 || position_matched_risk == 0 {
        return 0;
    }

    let product_profit = available_profit_for_commission(
        position_matched_risk,
        position_profit,
        product_risk_and_rate.risk,
    );

    if (protocol_commission_rate + product_risk_and_rate.rate) <= 100.0 {
        return calculate_commission(product_risk_and_rate.rate, product_profit as i128);
    }

    // where product + protocol commission rates > 100%, protocol commission will be deducted before
    // returning remaining profit as product commission
    calculate_post_commission_remainder(protocol_commission_rate, product_profit as i128)
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
    use crate::state::market_position_account::{MarketPosition, ProductMatchedRiskAndRate};
    use crate::state::payments_queue::PaymentInfo;
    use protocol_product::state::product::Product;
    use solana_program::pubkey::Pubkey;

    //  calculate_commission_at_rate

    #[test]
    fn low_rate() {
        let protocol_commission_rate = 10.0;
        let total_matched = 10;
        let position_profit = 100;
        let risk_per_rate = ProductMatchedRiskAndRate {
            product: Pubkey::new_unique(),
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
        let risk_per_rate = ProductMatchedRiskAndRate {
            product: Pubkey::new_unique(),
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
        let risk_per_rate = ProductMatchedRiskAndRate {
            product: Pubkey::new_unique(),
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
        let risk_per_rate = ProductMatchedRiskAndRate {
            product: Pubkey::new_unique(),
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
        let risk_per_rate = ProductMatchedRiskAndRate {
            product: Pubkey::new_unique(),
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
        let risk_per_rate = ProductMatchedRiskAndRate {
            product: Pubkey::new_unique(),
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
        let risk_per_rate = ProductMatchedRiskAndRate {
            product: Pubkey::new_unique(),
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
        let risk_per_rate = ProductMatchedRiskAndRate {
            product: Pubkey::new_unique(),
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
        let risk_per_rate = ProductMatchedRiskAndRate {
            product: Pubkey::new_unique(),
            risk: 0,
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
    fn total_commission_over_100_product_commission_reduced() {
        let protocol_commission_rate = 45.0;
        let total_matched = 10;
        let position_profit = 100;
        let risk_per_rate = ProductMatchedRiskAndRate {
            product: Pubkey::new_unique(),
            risk: 5,
            rate: 62.0,
        };

        let product_commission = calculate_commission_for_risk_at_rate(
            protocol_commission_rate,
            total_matched,
            position_profit,
            &risk_per_rate,
        );

        assert_eq!(product_commission, 27);
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
        let product_matched_risk = vec![ProductMatchedRiskAndRate {
            product: product_pk,
            risk: 10,
            rate: 5.0,
        }];
        let market_position = MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            outcome_max_exposure: vec![],
            payer: Default::default(),
            matched_risk: 10,
            matched_risk_per_product: product_matched_risk,
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
            ProductMatchedRiskAndRate {
                product: product_pk,
                risk: 5,
                rate: 10.0,
            },
            ProductMatchedRiskAndRate {
                product: product_pk,
                risk: 5,
                rate: 20.0,
            },
        ];

        let market_position = MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            outcome_max_exposure: vec![],
            payer: Default::default(),
            matched_risk: 10,
            matched_risk_per_product: matched_risk_for_product,
        };
        let position_profit = 100;

        let (product_commissions, payments) = calculate_product_commission_payments(
            protocol_product.commission_rate,
            market_escrow,
            &market_position,
            position_profit,
        );

        // 10 % of (50% of $100) + 20% of (50% of $100)
        let expected_payment_1 = 5;
        let expected_payment_2 = 10;
        let expected_product_commissions = expected_payment_1 + expected_payment_2;

        assert_eq!(product_commissions, expected_product_commissions);
        assert_eq!(
            payments,
            vec![
                PaymentInfo {
                    to: product_pk,
                    from: market_escrow,
                    amount: expected_payment_1,
                },
                PaymentInfo {
                    to: product_pk,
                    from: market_escrow,
                    amount: expected_payment_2,
                },
            ]
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
        let product2_pk = Pubkey::new_unique();

        let product_matched_risks = vec![
            ProductMatchedRiskAndRate {
                product: product_pk,
                risk: 5,
                rate: 10.0,
            },
            ProductMatchedRiskAndRate {
                product: product_pk,
                risk: 5,
                rate: 20.0,
            },
            ProductMatchedRiskAndRate {
                product: product2_pk,
                risk: 5,
                rate: 30.0,
            },
            ProductMatchedRiskAndRate {
                product: product2_pk,
                risk: 5,
                rate: 40.0,
            },
        ];

        let market_position = MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            outcome_max_exposure: vec![],
            payer: Default::default(),
            matched_risk: 20,
            matched_risk_per_product: product_matched_risks,
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
        let product1_expected_payment_1 = 10;
        let product1_expected_payment_2 = 20;
        let product1_expected_commissions =
            product1_expected_payment_1 + product1_expected_payment_2;

        let product2_expected_payment_1 = 30;
        let product2_expected_payment_2 = 40;
        let product2_expected_commissions =
            product2_expected_payment_1 + product2_expected_payment_2;

        let expected_total_product_commissions =
            product1_expected_commissions + product2_expected_commissions;

        assert_eq!(product_commissions, expected_total_product_commissions);
        assert_eq!(
            payments,
            vec![
                PaymentInfo {
                    to: product_pk,
                    from: market_escrow,
                    amount: product1_expected_payment_1,
                },
                PaymentInfo {
                    to: product_pk,
                    from: market_escrow,
                    amount: product1_expected_payment_2,
                },
                PaymentInfo {
                    to: product2_pk,
                    from: market_escrow,
                    amount: product2_expected_payment_1,
                },
                PaymentInfo {
                    to: product2_pk,
                    from: market_escrow,
                    amount: product2_expected_payment_2,
                }
            ]
        )
    }

    #[test]
    fn calculate_commission_payments_multiple_rates_commission_over_100() {
        let protocol_product = Product {
            authority: Default::default(),
            payer: Default::default(),
            commission_escrow: Pubkey::new_unique(),
            product_title: "".to_string(),
            commission_rate: 45.0,
        };
        let market_escrow = Pubkey::new_unique();
        let product_pk = Pubkey::new_unique();
        let product_pk2 = Pubkey::new_unique();
        let matched_risk_for_product = vec![
            ProductMatchedRiskAndRate {
                product: product_pk,
                risk: 5,
                rate: 62.0,
            },
            ProductMatchedRiskAndRate {
                product: product_pk2,
                risk: 5,
                rate: 62.0,
            },
        ];
        let market_position = MarketPosition {
            purchaser: Default::default(),
            market: Default::default(),
            paid: false,
            market_outcome_sums: vec![],
            outcome_max_exposure: vec![],
            payer: Default::default(),
            matched_risk: 10,
            matched_risk_per_product: matched_risk_for_product,
        };
        let position_profit = 100;
        let (total_product_commission, payments) = calculate_product_commission_payments(
            protocol_product.commission_rate,
            market_escrow,
            &market_position,
            position_profit,
        );
        let expected_product_commission = 54;

        assert_eq!(total_product_commission, expected_product_commission);
        assert_eq!(
            payments,
            vec![
                PaymentInfo {
                    to: product_pk,
                    from: market_escrow,
                    amount: 27,
                },
                PaymentInfo {
                    to: product_pk2,
                    from: market_escrow,
                    amount: 27,
                },
            ]
        )
    }
}
