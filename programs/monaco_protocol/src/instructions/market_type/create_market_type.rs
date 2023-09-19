use crate::state::market_type::MarketType;
use crate::CoreError;
use anchor_lang::{require, Result};

pub fn create_market_type(
    market_type: &mut MarketType,
    name: String,
    requires_discriminator: bool,
    requires_value: bool,
) -> Result<()> {
    require!(
        name.len() <= MarketType::NAME_MAX_LENGTH,
        CoreError::MarketTypeNameTooLong
    );
    market_type.name = name;
    market_type.requires_discriminator = requires_discriminator;
    market_type.requires_value = requires_value;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::error;

    #[test]
    fn test_create_market_type_success() {
        let expected_name = String::from("EventResultFullTime");
        let mut market_type = test_market_type();
        let mut result = create_market_type(&mut market_type, expected_name.clone(), false, false);
        assert!(result.is_ok());
        assert_eq!(market_type.name, expected_name);
        assert!(!market_type.requires_discriminator);
        assert!(!market_type.requires_value);

        result = create_market_type(&mut market_type, expected_name.clone(), true, false);
        assert!(result.is_ok());
        assert!(market_type.requires_discriminator);
        assert!(!market_type.requires_value);

        result = create_market_type(&mut market_type, expected_name.clone(), false, true);
        assert!(result.is_ok());
        assert!(!market_type.requires_discriminator);
        assert!(market_type.requires_value);

        result = create_market_type(&mut market_type, expected_name.clone(), true, true);
        assert!(result.is_ok());
        assert!(market_type.requires_discriminator);
        assert!(market_type.requires_value);
    }

    #[test]
    fn test_create_market_type_name_too_long() {
        let expected_name = "a".repeat(MarketType::NAME_MAX_LENGTH + 1).to_string();
        let mut market_type = test_market_type();
        let result = create_market_type(&mut market_type, expected_name.clone(), false, false);
        assert!(result.is_err());
        assert_eq!(
            result.err().unwrap(),
            error!(CoreError::MarketTypeNameTooLong)
        );
    }

    fn test_market_type() -> MarketType {
        MarketType {
            name: "".to_string(),
            requires_discriminator: false,
            requires_value: false,
        }
    }
}
