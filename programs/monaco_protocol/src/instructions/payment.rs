use crate::error::CoreError;
use crate::instructions;
use crate::state::market_account::Market;
use crate::state::payments_queue::PaymentQueue;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use protocol_product::state::product::Product;

pub fn process_commission_payment<'a>(
    commission_payments_queue: &mut PaymentQueue,
    market_escrow: &Account<'a, TokenAccount>,
    product_escrow_token: &Account<'a, TokenAccount>,
    product: &Account<Product>,
    market: &Account<Market>,
    token_program: &Program<'a, Token>,
) -> Result<()> {
    let payment_info = commission_payments_queue.dequeue();
    require!(
        payment_info.is_some(),
        CoreError::SettlementPaymentDequeueEmptyQueue
    );

    let payment_info = payment_info.unwrap();

    require!(
        payment_info.from.key() == market_escrow.key(),
        CoreError::SettlementPaymentAddressMismatch
    );
    require!(
        payment_info.to.key() == product.key(),
        CoreError::SettlementPaymentAddressMismatch
    );

    instructions::transfer_from_market_escrow(
        market_escrow,
        product_escrow_token,
        token_program,
        market,
        payment_info.amount,
    )
}
