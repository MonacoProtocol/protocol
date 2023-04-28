use anchor_lang::prelude::*;
use protocol_product::state::product::Product;

use crate::state::market_account::*;
use crate::state::market_position_account::*;
use crate::state::order_account::Order;

pub fn create_market_position(
    purchaser: &Signer,
    market: &Account<Market>,
    market_position: &mut Account<MarketPosition>,
) -> Result<()> {
    let market_outcomes_len = usize::from(market.market_outcomes_count);

    market_position.purchaser = purchaser.key();
    market_position.market = market.key();
    market_position
        .market_outcome_sums
        .resize(market_outcomes_len, 0_i128);
    market_position
        .outcome_max_exposure
        .resize(market_outcomes_len, 0_u64);
    market_position.paid = false;

    Ok(())
}

pub fn initialize_product_matched_stake(
    market_position: &mut MarketPosition,
    product: &Option<Account<Product>>,
    order: &Order,
) -> Result<()> {
    if order.product.is_none() {
        return Ok(());
    }

    // if this product has already been recorded on the market position return early
    if market_position
        .matched_risk_per_product
        .iter()
        .any(|product_matched_stake| product_matched_stake.product == order.product.unwrap())
    {
        return Ok(());
    }

    if market_position.matched_risk_per_product.len() < MarketPosition::MAX_PRODUCTS {
        market_position
            .matched_risk_per_product
            .push(ProductMatchedRisk {
                product: product.as_ref().unwrap().key(),
                matched_risk_per_rate: Vec::new(),
            });
    }

    Ok(())
}
