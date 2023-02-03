use crate::state::type_size::{vec_size, CHAR_SIZE, DISCRIMINATOR_SIZE, F32_SIZE, PUB_KEY_SIZE};
use anchor_lang::prelude::*;

#[account]
pub struct ProductConfig {
    pub authority: Pubkey,
    pub payer: Pubkey,
    pub commission_escrow: Pubkey,
    pub product_title: String,
    pub commission_rate: f32,
}

impl ProductConfig {
    pub const PRODUCT_TITLE_MAX_LENGTH: usize = 50;
    pub const SIZE: usize = DISCRIMINATOR_SIZE +
        (PUB_KEY_SIZE * 3) + // authority, payer and commission_escrow
        vec_size (CHAR_SIZE, ProductConfig::PRODUCT_TITLE_MAX_LENGTH) + // product_title
        F32_SIZE; // commission rate
}
