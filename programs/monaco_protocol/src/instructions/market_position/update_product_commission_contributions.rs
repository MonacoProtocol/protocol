use anchor_lang::prelude::*;

use crate::state::market_position_account::{MarketPosition, ProductMatchedRiskAndRate};
use crate::state::order_account::Order;

pub fn update_product_commission_contributions(
    market_position: &mut MarketPosition,
    order: &Order,
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

    use crate::instructions::market_position::update_product_commission_contributions;
    use crate::state::market_position_account::{MarketPosition, ProductMatchedRiskAndRate};
    use crate::state::order_account::mock_order_default;

    #[test]
    fn update_product_commissions_empty_vec() {
        let product = Some(Pubkey::new_unique());
        let product_commission_rate = 1.0;
        let stake_matched = 10;

        let mut order = mock_order_default();
        order.product = product;
        order.product_commission_rate = product_commission_rate;

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

        update_product_commission_contributions(&mut market_position, &order, stake_matched)
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

        let mut order = mock_order_default();
        order.product = product;
        order.product_commission_rate = product_commission_rate;

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

        update_product_commission_contributions(&mut market_position, &order, stake_matched)
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

        let mut order = mock_order_default();
        order.product = product;
        order.product_commission_rate = new_product_commission_rate;

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

        update_product_commission_contributions(&mut market_position, &order, stake_matched)
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

        let mut order = mock_order_default();
        order.product = product;
        order.product_commission_rate = product_commission_rate_2;

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

        update_product_commission_contributions(&mut market_position, &order, new_stake_matched)
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

        let mut order = mock_order_default();
        order.product = product_2;
        order.product_commission_rate = product_commission_rate_2;

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
            &mut market_position,
            &order,
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
