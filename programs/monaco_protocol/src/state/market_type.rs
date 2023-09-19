use crate::state::type_size::{string_size, BOOL_SIZE, DISCRIMINATOR_SIZE};
use anchor_lang::prelude::*;

#[account]
pub struct MarketType {
    pub name: String,
    pub requires_discriminator: bool,
    pub requires_value: bool,
}

impl MarketType {
    pub const NAME_MAX_LENGTH: usize = 32;

    pub fn size_for(str_len: usize) -> usize {
        DISCRIMINATOR_SIZE + string_size(str_len) + BOOL_SIZE * 2
    }
}
