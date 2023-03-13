use anchor_lang::prelude::*;

use crate::context::CloseMarket;
use crate::instructions::transfer;
use crate::state::market_account::{Market, MarketStatus};
use crate::CoreError;
use anchor_lang::context::{Context, CpiContext};
use anchor_lang::{Key, ToAccountInfo};
use anchor_spl::token;
use anchor_spl::token::{Token, TokenAccount};

const TRANSFER_SURPLUS_ALLOWED_STATUSES: [MarketStatus; 2] =
    [MarketStatus::Settled, MarketStatus::ReadyToClose];

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

pub fn close_escrow_token_account(ctx: &Context<CloseMarket>) -> Result<()> {
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        token::CloseAccount {
            account: ctx.accounts.market_escrow.to_account_info(),
            destination: ctx.accounts.authority.to_account_info(),
            authority: ctx.accounts.market_escrow.to_account_info(),
        },
        &[&[
            "escrow".as_ref(),
            ctx.accounts.market.key().as_ref(),
            &[ctx.accounts.market.escrow_account_bump],
        ]],
    ))
}
