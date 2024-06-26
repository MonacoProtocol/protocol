use crate::error::CoreError;
use anchor_lang::{require, Result};
use rust_decimal::prelude::*;
use rust_decimal::Decimal;
use std::ops::{Div, Mul, Sub};

/// Converts at most precision 3 float to an equivalent Decimal - e.g., converting price (f64) to Decimal
fn price_to_decimal(price: f64) -> Decimal {
    let mut decimal = Decimal::from_f64(price).unwrap();
    decimal.rescale(3);
    decimal
}

/// risk = stake * (price - 1)
pub fn calculate_risk_from_stake(stake: u64, price: f64) -> u64 {
    let price_decimal = price_to_decimal(price);
    Decimal::from(stake)
        .mul(price_decimal.sub(Decimal::one()))
        .to_u64()
        .unwrap()
}

/// payout = stake * price
pub fn calculate_for_payout(stake: u64, price: f64) -> u64 {
    let price_decimal = price_to_decimal(price);
    Decimal::from(stake).mul(price_decimal).to_u64().unwrap()
}

/// stake = payout / price
pub fn calculate_stake_from_payout(payout: u64, price: f64) -> u64 {
    let price_decimal = price_to_decimal(price);
    Decimal::from(payout).div(price_decimal).to_u64().unwrap()
}

/// stake_cross = stake * price / price_cross
pub fn calculate_stake_cross(stake: u64, price: f64, price_cross: f64) -> u64 {
    let stake_matched_decimal = Decimal::from_u64(stake).unwrap();
    let price_matched_decimal = price_to_decimal(price);
    let price_cross_decimal = price_to_decimal(price_cross);

    let stake_cross_decimal = stake_matched_decimal
        .mul(price_matched_decimal)
        .div(price_cross_decimal);

    stake_cross_decimal.to_u64().unwrap()
}

/// 2ways: price_cross = price_a / (price_a - 1)
/// 3ways: price_cross = price_ab / (price_ab - price_a - price_b)
/// 4ways: price_cross = price_abc / (price_abc - price_ab - price_bc - price_ac)
pub fn calculate_price_cross(prices: &[f64]) -> Option<f64> {
    let mut full = Decimal::ONE;
    let mut partials = vec![Decimal::ONE; prices.len()];

    for (price_index, price) in prices.iter().enumerate() {
        let price_decimal = price_to_decimal(*price);

        full = full.mul(price_decimal);
        for (index, partial) in partials.iter_mut().enumerate() {
            if index != price_index {
                *partial = partial.mul(price_decimal);
            }
        }
    }
    let mut full_sub_partials = full;
    for partial in partials {
        full_sub_partials = full_sub_partials.sub(partial);
    }

    let result = full.div(full_sub_partials);
    let result_truncated = result.trunc_with_scale(3);

    if result.ne(&result_truncated) {
        None // it needs to fit in 3 decimals
    } else {
        result_truncated.to_f64()
    }
}

pub fn price_precision_is_within_range(price: f64) -> Result<()> {
    let decimal = Decimal::from_f64(price).ok_or(CoreError::ArithmeticError)?;
    let decimal_with_scale = decimal.trunc_with_scale(3);
    require!(
        decimal.eq(&decimal_with_scale),
        CoreError::PricePrecisionTooLarge
    );
    Ok(())
}

pub fn stake_precision_is_within_range(stake: u64, decimal_limit: u8) -> Result<bool> {
    let mut stake_decimal = Decimal::from_u64(stake).unwrap();
    require!(
        stake_decimal.set_scale(decimal_limit as u32).is_ok(),
        CoreError::ArithmeticError
    );
    Ok(stake_decimal.fract().is_zero())
}

pub fn calculate_commission(commission_rate: f64, profit: i128) -> u64 {
    if profit <= 0 || commission_rate == 0.0 {
        return 0;
    }

    let commission_rate_decimal = Decimal::from_f64(commission_rate).unwrap();
    Decimal::from(profit)
        .mul(commission_rate_decimal)
        .div(Decimal::ONE_HUNDRED)
        .to_u64()
        .unwrap()
}

pub fn calculate_post_commission_remainder(commission_rate: f64, profit: i128) -> u64 {
    if profit <= 0 {
        return 0;
    }

    let commission_rate_decimal = Decimal::from_f64(commission_rate).unwrap();
    let profit_decimal = Decimal::from(profit);
    let commission_decimal = profit_decimal
        .mul(commission_rate_decimal)
        .div(Decimal::ONE_HUNDRED);
    profit_decimal.sub(commission_decimal).to_u64().unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_price_to_decimal() {
        let floats = vec![
            1.001, 1.002, 1.003, 1.004, 1.005, 1.006, 1.007, 1.008, 1.009, 1.01, 1.02, 1.03, 1.04,
            1.05, 1.06, 1.07, 1.08, 1.09, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5, 1.55,
            1.6, 1.65, 1.7, 1.75, 1.8, 1.85, 1.9, 1.95, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7,
            2.8, 2.9, 3.0, 3.1, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 15.0, 20.0, 30.0, 40.0, 50.0,
            60.0, 70.0, 80.0, 90.0, 100.0, 200.0, 300.0, 400.0, 500.0, 600.0, 700.0, 800.0, 900.0,
            1000.0,
        ];
        for x in floats {
            assert_eq!(price_to_decimal(x).to_string(), format!("{:.3}", x));
        }
    }

    #[test]
    fn test_calculate_for_payout() {
        assert_eq!(calculate_for_payout(100, 3.00), 300);
        assert_eq!(calculate_for_payout(100, 3.22), 322);
        assert_eq!(calculate_for_payout(100, 3.44), 344);
        assert_eq!(calculate_for_payout(100, 3.66), 366);
        assert_eq!(calculate_for_payout(1000, 3.00), 3000);
        assert_eq!(calculate_for_payout(1000, 3.22), 3220);
        assert_eq!(calculate_for_payout(1000, 3.44), 3440);
        assert_eq!(calculate_for_payout(1000, 3.66), 3660);
        assert_eq!(calculate_for_payout(10000, 3.00), 30000);
        assert_eq!(calculate_for_payout(10000, 3.22), 32200);
        assert_eq!(calculate_for_payout(10000, 3.44), 34400);
        assert_eq!(calculate_for_payout(10000, 3.66), 36600);
    }

    #[test]
    fn test_calculate_price_cross() {
        let cross_price_2way = calculate_price_cross(&vec![3.0_f64]);
        assert!(cross_price_2way.is_some());
        assert_eq!(1.5_f64, cross_price_2way.unwrap());

        assert!(calculate_price_cross(&vec![3.1_f64]).is_none());

        let cross_price_3way = calculate_price_cross(&vec![2.0_f64, 3.0_f64]);
        assert!(cross_price_3way.is_some());
        assert_eq!(6.0_f64, cross_price_3way.unwrap());

        let cross_price_4way_1 = calculate_price_cross(&vec![4.0_f64, 4.0_f64, 4.0_f64]);
        assert!(cross_price_4way_1.is_some());
        assert_eq!(4.0_f64, cross_price_4way_1.unwrap());

        assert!(calculate_price_cross(&vec![4.0_f64, 4.0_f64, 5.0_f64]).is_none());
    }

    #[test]
    fn test_stake_precision_is_within_range_failure() {
        assert!(!stake_precision_is_within_range(1, 3).unwrap());
        assert!(!stake_precision_is_within_range(1001, 3).unwrap());
        assert!(!stake_precision_is_within_range(1010, 3).unwrap());
        assert!(!stake_precision_is_within_range(1100, 3).unwrap());
        assert!(!stake_precision_is_within_range(u64::MAX, 3).unwrap());
    }

    #[test]
    fn test_stake_precision_is_within_range_success() {
        assert!(stake_precision_is_within_range(0, 3).unwrap());
        assert!(stake_precision_is_within_range(1000, 3).unwrap());
        assert!(stake_precision_is_within_range(10000, 3).unwrap());
        assert!(stake_precision_is_within_range(100000, 3).unwrap());

        let test_case = (u64::MAX / 1000) * 1000;
        assert!(stake_precision_is_within_range(test_case, 3).unwrap());
    }

    #[test]
    fn test_price_precision_is_within_range() {
        assert!(price_precision_is_within_range(1_f64).is_ok());
        assert!(price_precision_is_within_range(1.1_f64).is_ok());
        assert!(price_precision_is_within_range(1.11_f64).is_ok());
        assert!(price_precision_is_within_range(1.111_f64).is_ok());
        assert!(price_precision_is_within_range(1.1111_f64).is_err());
    }

    #[test]
    fn test_calculate_commission() {
        assert_eq!(calculate_commission(5.00, 100), 5);
        assert_eq!(calculate_commission(1.5, 100), 1);
        assert_eq!(calculate_commission(33.33, 100), 33);
        assert_eq!(calculate_commission(0.00, 100), 0);
        assert_eq!(calculate_commission(10.00, 1), 0);

        // 1000000 = 1 @ 6 mint decimals
        assert_eq!(calculate_commission(1.00, 1000000), 10000);
        assert_eq!(calculate_commission(33.33, 1000000), 333300);
    }

    #[test]
    fn calculate_post_commission_remainder_zero_protocol_commission() {
        let profit = 100;
        let commission_rate = 0.0;

        assert_eq!(
            profit as u64,
            calculate_post_commission_remainder(commission_rate, profit)
        );
    }
}
