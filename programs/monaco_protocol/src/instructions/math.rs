use std::ops::{Div, Mul, Sub};

use rust_decimal::prelude::{FromPrimitive, One, ToPrimitive};
use rust_decimal::Decimal;

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

pub fn stake_precision_is_within_range(stake: u64, decimal_limit: u8) -> bool {
    Decimal::new(stake as i64, decimal_limit as u32)
        .fract()
        .is_zero()
}

pub fn calculate_commission(commission_rate: f64, profit: i128) -> u64 {
    let commission_rate_decimal = Decimal::from_f64(commission_rate).unwrap();
    Decimal::from(profit)
        .max(Decimal::ZERO)
        .mul(commission_rate_decimal)
        .div(Decimal::ONE_HUNDRED)
        .to_u64()
        .unwrap()
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
    fn test_stake_precision_is_within_range_failure() {
        assert!(!stake_precision_is_within_range(1, 3));
        assert!(!stake_precision_is_within_range(1001, 3));
        assert!(!stake_precision_is_within_range(1010, 3));
        assert!(!stake_precision_is_within_range(1100, 3));
    }

    #[test]
    fn test_stake_precision_is_within_range_success() {
        assert!(stake_precision_is_within_range(0, 3));
        assert!(stake_precision_is_within_range(1000, 3));
        assert!(stake_precision_is_within_range(10000, 3));
        assert!(stake_precision_is_within_range(100000, 3));
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
}
