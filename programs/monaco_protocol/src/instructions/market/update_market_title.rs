use anchor_lang::prelude::*;

use crate::context::UpdateMarket;
use crate::state::market_account::Market;
use crate::CoreError;

pub fn update_title(ctx: Context<UpdateMarket>, title: String) -> Result<()> {
    let market = &mut ctx.accounts.market;

    update_market_title(market, title)
}

fn update_market_title(market: &mut Market, title: String) -> Result<()> {
    require!(
        title.len() <= Market::TITLE_MAX_LENGTH,
        CoreError::MarketTitleTooLong
    );
    if !title.is_empty() && !market.title.eq(&title) {
        market.title = title;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::instructions::market::update_market_title::update_market_title;
    use crate::state::market_account::{Market, MarketOrderBehaviour, MarketStatus};

    #[test]
    fn test_market_update_success_100_char_title() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(1),
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            market_status: MarketStatus::ReadyForSettlement,
            escrow_account_bump: 0,
            published: false,
            suspended: false,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            unclosed_accounts_count: 0,
        };

        let result = update_market_title(&mut market, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string());
        assert!(result.is_ok());
    }

    #[test]
    fn test_title_length_invalid_101_char() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            decimal_limit: 2,
            market_outcomes_count: 3_u16,
            market_winning_outcome_index: Some(1),
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            market_status: MarketStatus::ReadyForSettlement,
            escrow_account_bump: 0,
            published: false,
            suspended: false,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            unclosed_accounts_count: 0,
        };

        let result = update_market_title(&mut market, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string());
        assert!(result.is_err())
    }
}
