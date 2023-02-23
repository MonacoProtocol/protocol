use anchor_lang::prelude::*;

use crate::context::CloseMarket;
use anchor_lang::context::{Context, CpiContext};
use anchor_lang::{Key, ToAccountInfo};
use anchor_spl::token;

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
