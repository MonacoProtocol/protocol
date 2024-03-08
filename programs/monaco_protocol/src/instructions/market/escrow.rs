use anchor_lang::prelude::*;

use crate::instructions::transfer;
use crate::state::market_account::{Market, MarketStatus};
use crate::CoreError;
use anchor_lang::context::CpiContext;
use anchor_lang::{Key, ToAccountInfo};
use anchor_spl::token;
use anchor_spl::token::{Token, TokenAccount};

const TRANSFER_SURPLUS_ALLOWED_STATUSES: [MarketStatus; 2] =
    [MarketStatus::Settled, MarketStatus::Voided];

pub fn transfer_market_escrow_surplus<'info>(
    market: &Account<'info, Market>,
    market_escrow: &Account<'info, TokenAccount>,
    destination: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    require!(
        TRANSFER_SURPLUS_ALLOWED_STATUSES.contains(&market.market_status),
        CoreError::MarketInvalidStatus
    );
    transfer::transfer_market_escrow_surplus(market_escrow, destination, token_program, market)
}

pub fn close_escrow_token_account<'info>(
    market: &Account<'info, Market>,
    market_escrow: &Account<'info, TokenAccount>,
    authority: &SystemAccount<'info>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    token::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        token::CloseAccount {
            account: market_escrow.to_account_info(),
            destination: authority.to_account_info(),
            authority: market_escrow.to_account_info(),
        },
        &[&[
            "escrow".as_ref(),
            market.key().as_ref(),
            &[market.escrow_account_bump],
        ]],
    ))
}
