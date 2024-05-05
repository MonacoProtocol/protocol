use crate::error::CoreError;
use crate::state::type_size::*;
use anchor_lang::prelude::*;
use std::string::ToString;

#[account]
pub struct MarketOutcome {
    pub market: Pubkey,
    pub index: u16,
    pub title: String,
    pub latest_matched_price: f64,
    pub matched_total: u64,
    pub prices: Option<Pubkey>,
    pub price_ladder: Vec<f64>,
}

impl MarketOutcome {
    pub const TITLE_MAX_LENGTH: usize = 100;
    pub const PRICE_LADDER_LENGTH: usize = 320;

    pub const SIZE: usize = DISCRIMINATOR_SIZE
        + PUB_KEY_SIZE // market
        + U16_SIZE // index
        + vec_size(CHAR_SIZE, MarketOutcome::TITLE_MAX_LENGTH) // title
        + F64_SIZE // latest_matched_price
        + U64_SIZE // matched_total
        + option_size(PUB_KEY_SIZE) // price ladder account
        + vec_size(F64_SIZE, MarketOutcome::PRICE_LADDER_LENGTH); // price_ladder

    pub fn on_match(&mut self, stake_matched: u64, price_matched: f64) -> Result<()> {
        if stake_matched > 0_u64 {
            self.matched_total = self
                .matched_total
                .checked_add(stake_matched)
                .ok_or(CoreError::MarketOutcomeUpdateError)?;
            self.latest_matched_price = price_matched;
        }
        Ok(())
    }
}

#[cfg(test)]
pub fn mock_market_outcome(market_pk: Pubkey, outcome: u16) -> MarketOutcome {
    MarketOutcome {
        market: market_pk,
        index: outcome,
        title: market_pk.to_string(),
        latest_matched_price: 0_f64,
        matched_total: 0_u64,
        prices: None,
        price_ladder: vec![],
    }
}

#[cfg(test)]
mod test {
    use crate::state::market_outcome_account::mock_market_outcome;

    use super::*;

    #[test]
    fn test_on_match() {
        let market_pk = Pubkey::new_unique();
        let mut market_outcome = mock_market_outcome(market_pk, 0);

        let result_1 = market_outcome.on_match(0, 1.5);

        assert!(result_1.is_ok());
        assert_eq!(market_outcome.latest_matched_price, 0_f64);
        assert_eq!(market_outcome.matched_total, 0);

        let result_2 = market_outcome.on_match(1, 1.5);

        assert!(result_2.is_ok());
        assert_eq!(market_outcome.latest_matched_price, 1.5_f64);
        assert_eq!(market_outcome.matched_total, 1);

        let result_3 = market_outcome.on_match(u64::MAX, 1.5);

        assert!(result_3.is_err());
        assert_eq!(market_outcome.latest_matched_price, 1.5_f64);
        assert_eq!(market_outcome.matched_total, 1);
    }
}
