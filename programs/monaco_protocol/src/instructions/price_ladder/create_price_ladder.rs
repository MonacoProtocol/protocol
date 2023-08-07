use crate::state::price_ladder::PriceLadder;
use anchor_lang::Result;
use solana_program::pubkey::Pubkey;

pub fn create_price_ladder(
    price_ladder: &mut PriceLadder,
    max_number_of_prices: u16,
    authority: &Pubkey,
) -> Result<()> {
    price_ladder.authority = *authority;
    price_ladder.max_number_of_prices = max_number_of_prices;
    price_ladder.prices = vec![];
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_price_ladder() {
        let price_ladder = &mut price_ladder();
        let authority = Pubkey::new_unique();
        let result = create_price_ladder(price_ladder, 3, &authority);
        assert!(result.is_ok());
        assert_eq!(price_ladder.authority, authority);
        assert_eq!(price_ladder.max_number_of_prices, 3);
        assert_eq!(price_ladder.prices, vec![] as Vec<f64>);
    }

    fn price_ladder() -> PriceLadder {
        PriceLadder {
            prices: vec![1.0],
            max_number_of_prices: 0,
            authority: Pubkey::new_unique(),
        }
    }
}
