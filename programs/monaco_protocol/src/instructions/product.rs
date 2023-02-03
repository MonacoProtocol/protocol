use crate::{CoreError, ProductConfig};
use anchor_lang::prelude::*;

// create product/protocol configuration account
pub fn create_product_config(
    product_config: &mut ProductConfig,
    authority: &Pubkey,
    payer: &Pubkey,
    product_title: String,
    commission_rate: f32,
    commission_escrow: Pubkey,
) -> Result<()> {
    require!(
        (0.0..=100.0).contains(&commission_rate),
        CoreError::InvalidCommissionRate
    );
    require!(
        (1..=50).contains(&product_title.len()),
        CoreError::ProductConfigTitleLen
    );
    require!(
        format!("{commission_rate}") <= format!("{commission_rate:.3}"),
        CoreError::CommissionPrecisionTooLarge
    );

    product_config.authority = *authority;
    product_config.payer = *payer;
    product_config.product_title = product_title;
    product_config.commission_rate = commission_rate;
    product_config.commission_escrow = commission_escrow;
    Ok(())
}

pub fn update_product_commission_escrow(
    product_config: &mut ProductConfig,
    updated_commission_escrow: Pubkey,
) -> Result<()> {
    product_config.commission_escrow = updated_commission_escrow;
    Ok(())
}

pub fn update_product_commission_rate(
    product_config: &mut ProductConfig,
    updated_commission_rate: f32,
) -> Result<()> {
    require!(
        (0.0..=100.0).contains(&updated_commission_rate),
        CoreError::InvalidCommissionRate
    );

    product_config.commission_rate = updated_commission_rate;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ok_response() {
        let mut empty_product_config_account = ProductConfig {
            authority: Default::default(),
            payer: Default::default(),
            commission_escrow: Default::default(),
            product_title: "".to_string(),
            commission_rate: 0.0,
        };

        let result = create_product_config(
            &mut empty_product_config_account,
            &Pubkey::new_unique(),
            &Pubkey::new_unique(),
            "TITLE".to_string(),
            1.1,
            Pubkey::new_unique(),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_invalid_commission_rate() {
        let mut empty_product_config_account = ProductConfig {
            authority: Default::default(),
            payer: Default::default(),
            commission_escrow: Default::default(),
            product_title: "".to_string(),
            commission_rate: 0.0,
        };

        let result = create_product_config(
            &mut empty_product_config_account,
            &Pubkey::new_unique(),
            &Pubkey::new_unique(),
            "TITLE".to_string(),
            99.9999,
            Pubkey::new_unique(),
        );
        let expected_error = Err(error!(CoreError::CommissionPrecisionTooLarge));
        assert_eq!(expected_error, result);
    }

    #[test]
    fn test_invalid_commission_rate_precision_too_large() {
        let mut empty_product_config_account = ProductConfig {
            authority: Default::default(),
            payer: Default::default(),
            commission_escrow: Default::default(),
            product_title: "".to_string(),
            commission_rate: 0.0,
        };

        let result = create_product_config(
            &mut empty_product_config_account,
            &Pubkey::new_unique(),
            &Pubkey::new_unique(),
            "TITLE".to_string(),
            101.11,
            Pubkey::new_unique(),
        );
        let expected_error = Err(error!(CoreError::InvalidCommissionRate));
        assert_eq!(expected_error, result);
    }

    #[test]
    fn test_title_length_validation() {
        let mut empty_product_config_account = ProductConfig {
            authority: Default::default(),
            payer: Default::default(),
            commission_escrow: Default::default(),
            product_title: "".to_string(),
            commission_rate: 0.0,
        };

        let result = create_product_config(
            &mut empty_product_config_account,
            &Pubkey::new_unique(),
            &Pubkey::new_unique(),
            "123456789012345678901234567890123456789012345678901".to_string(),
            99.99,
            Pubkey::new_unique(),
        );
        let expected_error = Err(error!(CoreError::ProductConfigTitleLen));
        assert_eq!(expected_error, result);

        let result = create_product_config(
            &mut empty_product_config_account,
            &Pubkey::new_unique(),
            &Pubkey::new_unique(),
            "".to_string(),
            99.99,
            Pubkey::new_unique(),
        );
        let expected_error = Err(error!(CoreError::ProductConfigTitleLen));
        assert_eq!(expected_error, result);
    }

    #[test]
    fn test_update_commission_rate_ok_result() {
        let mut product_config = ProductConfig {
            authority: Default::default(),
            payer: Default::default(),
            commission_escrow: Default::default(),
            product_title: "".to_string(),
            commission_rate: 0.0,
        };

        let result = update_product_commission_rate(&mut product_config, 99.99);

        assert!(result.is_ok());
        assert_eq!(product_config.commission_rate, 99.99)
    }

    #[test]
    fn test_update_commission_rate_invalid_commission_rate() {
        let mut product_config = ProductConfig {
            authority: Default::default(),
            payer: Default::default(),
            commission_escrow: Default::default(),
            product_title: "".to_string(),
            commission_rate: 0.0,
        };

        let result = update_product_commission_rate(&mut product_config, 199.99);

        let expected_error = Err(error!(CoreError::InvalidCommissionRate));
        assert_eq!(expected_error, result);
    }

    #[test]
    fn test_update_commission_escrow_ok_result() {
        let mut product_config = ProductConfig {
            authority: Default::default(),
            payer: Default::default(),
            commission_escrow: Default::default(),
            product_title: "".to_string(),
            commission_rate: 0.0,
        };

        let new_escrow = Pubkey::new_unique();
        let result = update_product_commission_escrow(&mut product_config, new_escrow);

        assert!(result.is_ok());
        assert_eq!(product_config.commission_escrow, new_escrow)
    }
}
