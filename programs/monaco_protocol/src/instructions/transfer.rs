use crate::{CancelOrder, Market, MatchOrders, SettleMarketPosition};
use anchor_lang::prelude::*;
use anchor_spl::token;
use anchor_spl::token::{Token, TokenAccount};

use crate::context::CreateOrder;

pub fn order_creation_payment<'info>(
    market_escrow: &Account<'info, TokenAccount>,
    purchaser: &Signer<'info>,
    purchaser_token_account: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    transfer_to_market_escrow(
        market_escrow,
        purchaser,
        purchaser_token_account,
        token_program,
        amount,
    )
}

pub fn order_creation_refund(ctx: Context<CreateOrder>, amount: u64) -> Result<()> {
    let accounts = &ctx.accounts;

    transfer_from_market_escrow(
        &accounts.market_escrow,
        &accounts.purchaser_token,
        &accounts.token_program,
        &accounts.market,
        amount,
    )
}

pub fn order_cancelation_payment(ctx: &Context<CancelOrder>, amount: u64) -> Result<()> {
    let accounts = &ctx.accounts;

    transfer_to_market_escrow(
        &accounts.market_escrow,
        &accounts.purchaser,
        &accounts.purchaser_token_account,
        &accounts.token_program,
        amount,
    )
}

pub fn order_cancelation_refund(ctx: &Context<CancelOrder>, amount: u64) -> Result<()> {
    let accounts = &ctx.accounts;

    transfer_from_market_escrow(
        &accounts.market_escrow,
        &accounts.purchaser_token_account,
        &accounts.token_program,
        &accounts.market,
        amount,
    )
}

pub fn order_for_matching_refund(ctx: &Context<MatchOrders>, amount: u64) -> Result<()> {
    let accounts = &ctx.accounts;

    transfer_from_market_escrow(
        &accounts.market_escrow,
        &accounts.purchaser_token_account_for,
        &accounts.token_program,
        &accounts.market,
        amount,
    )
}

pub fn order_against_matching_refund(ctx: &Context<MatchOrders>, amount: u64) -> Result<()> {
    let accounts = &ctx.accounts;

    transfer_from_market_escrow(
        &accounts.market_escrow,
        &accounts.purchaser_token_account_against,
        &accounts.token_program,
        &accounts.market,
        amount,
    )
}

pub fn transfer_market_position(ctx: &Context<SettleMarketPosition>, amount: u64) -> Result<()> {
    let accounts = &ctx.accounts;

    transfer_from_market_escrow(
        &accounts.market_escrow,
        &accounts.purchaser_token_account,
        &accounts.token_program,
        &accounts.market,
        amount,
    )
}

pub fn transfer_protocol_commission(
    ctx: &Context<SettleMarketPosition>,
    amount: u64,
) -> Result<()> {
    let accounts = &ctx.accounts;

    transfer_from_market_escrow(
        &accounts.market_escrow,
        &accounts.protocol_commission_token_account,
        &accounts.token_program,
        &accounts.market,
        amount,
    )
}

fn transfer_to_market_escrow<'info>(
    market_escrow: &Account<'info, TokenAccount>,
    purchaser: &Signer<'info>,
    purchaser_token_account: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    msg!("Transferring to escrow");
    if amount == 0_u64 {
        return Ok(());
    }
    token::transfer(
        CpiContext::new(
            token_program.to_account_info(),
            token::Transfer {
                from: purchaser_token_account.to_account_info(),
                to: market_escrow.to_account_info(),
                authority: purchaser.to_account_info(),
            },
        ),
        amount,
    )
}

fn transfer_from_market_escrow<'info>(
    market_escrow: &Account<'info, TokenAccount>,
    purchaser_token_account: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    market: &Account<Market>,
    amount: u64,
) -> Result<()> {
    msg!("Transferring from escrow");
    if amount == 0_u64 {
        return Ok(());
    }
    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            token::Transfer {
                from: market_escrow.to_account_info(),
                to: purchaser_token_account.to_account_info(),
                authority: market_escrow.to_account_info(),
            },
            &[&[
                "escrow".as_ref(),
                market.key().as_ref(),
                &[market.escrow_account_bump],
            ]],
        ),
        amount,
    )
}
