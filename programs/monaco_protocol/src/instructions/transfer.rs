use anchor_lang::prelude::*;
use anchor_spl::token;
use anchor_spl::token::{Token, TokenAccount};

use crate::context::{CancelOrder, MatchOrders, SettleMarketPosition, VoidMarketPosition};
use crate::state::market_account::Market;

pub fn order_creation_payment<'info>(
    market_escrow: &Account<'info, TokenAccount>,
    purchaser: &AccountInfo<'info>,
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

pub fn order_creation_payment_pda<'info>(
    market_escrow: &Account<'info, TokenAccount>,
    pda_funding: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    market: &Pubkey,
    pda_funding_bump: u8,
    amount: u64,
) -> Result<()> {
    transfer_to_market_escrow_pda(
        market_escrow,
        pda_funding,
        token_program,
        market,
        pda_funding_bump,
        amount,
    )
}

pub fn order_creation_refund<'info>(
    market_escrow: &Account<'info, TokenAccount>,
    purchaser_token_account: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    market: &Account<Market>,
    amount: u64,
) -> Result<()> {
    transfer_from_market_escrow(
        market_escrow,
        purchaser_token_account,
        token_program,
        market,
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

pub fn transfer_market_position_void(ctx: &Context<VoidMarketPosition>, amount: u64) -> Result<()> {
    let accounts = &ctx.accounts;

    transfer_from_market_escrow(
        &accounts.market_escrow,
        &accounts.purchaser_token_account,
        &accounts.token_program,
        &accounts.market,
        amount,
    )
}

pub fn transfer_market_escrow_surplus<'info>(
    market_escrow: &Account<'info, TokenAccount>,
    purchaser_token_account: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    market: &Account<Market>,
) -> Result<()> {
    let amount: u64 = market_escrow.amount;
    msg!("Transferring surplus of {} from escrow", amount);
    transfer_from_market_escrow(
        market_escrow,
        purchaser_token_account,
        token_program,
        market,
        amount,
    )
}

pub fn transfer_to_market_escrow<'info>(
    market_escrow: &Account<'info, TokenAccount>,
    purchaser: &AccountInfo<'info>,
    purchaser_token_account: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    if amount == 0_u64 {
        return Ok(());
    }
    msg!("Transferring to escrow");
    token::transfer(
        CpiContext::new(
            token_program.to_account_info(),
            token::Transfer {
                from: purchaser_token_account.to_account_info(),
                to: market_escrow.to_account_info(),
                authority: purchaser.to_account_info().clone(),
            },
        ),
        amount,
    )
}

pub fn transfer_to_market_escrow_pda<'info>(
    market_escrow: &Account<'info, TokenAccount>,
    pda_funding: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    market: &Pubkey,
    pda_funding_bump: u8,
    amount: u64,
) -> Result<()> {
    if amount == 0_u64 {
        return Ok(());
    }
    msg!("Transferring to escrow");

    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            token::Transfer {
                from: pda_funding.to_account_info(),
                to: market_escrow.to_account_info(),
                authority: pda_funding.to_account_info(),
            },
            &[&["pda_funding".as_ref(), market.as_ref(), &[pda_funding_bump]]],
        ),
        amount,
    )
}

pub fn transfer_from_market_escrow<'info>(
    market_escrow: &Account<'info, TokenAccount>,
    purchaser_token_account: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    market: &Account<Market>,
    amount: u64,
) -> Result<()> {
    if amount == 0_u64 {
        return Ok(());
    }
    msg!("Transferring from escrow");
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
