use crate::state::price_ladder::PriceLadder;
use crate::CoreError;
use anchor_lang::{require, Result};

pub fn increase_price_ladder_size(
    price_ladder: &mut PriceLadder,
    max_number_of_prices: u16,
) -> Result<()> {
    require!(
        price_ladder.max_number_of_prices < max_number_of_prices,
        CoreError::PriceLadderSizeCanOnlyBeIncreased
    );
    price_ladder.max_number_of_prices = max_number_of_prices;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::error;
    use solana_program::pubkey::Pubkey;

    #[test]
    fn increase_size() {
        let price_ladder = &mut price_ladder();
        let result = increase_price_ladder_size(price_ladder, 4);
        assert!(result.is_ok());
        assert_eq!(price_ladder.max_number_of_prices, 4);
    }

    #[test]
    fn decrease_size() {
        let price_ladder = &mut price_ladder();
        let result = increase_price_ladder_size(price_ladder, 2);
        assert!(result.is_err());
        assert_eq!(
            result.err(),
            Some(error!(CoreError::PriceLadderSizeCanOnlyBeIncreased))
        );
        assert_eq!(price_ladder.max_number_of_prices, 3);
    }

    #[test]
    fn same_size() {
        let price_ladder = &mut price_ladder();
        let result = increase_price_ladder_size(price_ladder, price_ladder.max_number_of_prices);
        assert!(result.is_err());
        assert_eq!(
            result.err(),
            Some(error!(CoreError::PriceLadderSizeCanOnlyBeIncreased))
        );
        assert_eq!(price_ladder.max_number_of_prices, 3);
    }

    fn price_ladder() -> PriceLadder {
        PriceLadder {
            prices: vec![2.0, 3.0, 4.0],
            max_number_of_prices: 3,
            authority: Pubkey::new_unique(),
        }
    }
}
