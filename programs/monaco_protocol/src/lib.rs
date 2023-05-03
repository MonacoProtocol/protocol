use anchor_lang::prelude::*;

use crate::context::*;
use crate::error::CoreError;
use crate::instructions::market::verify_market_authority;
use crate::instructions::verify_operator_authority;
use crate::state::market_account::{
    Market, MarketMatchingPool, MarketOutcome, MarketStatus::ReadyToClose,
};
use crate::state::market_position_account::MarketPosition;
use crate::state::market_type::verify_market_type;
use crate::state::operator_account::AuthorisedOperators;
use crate::state::order_account::Order;
use crate::state::order_account::OrderData;
use crate::state::trade_account::Trade;

pub mod context;
pub mod error;
pub mod instructions;
pub mod state;

#[cfg(feature = "stable")]
declare_id!("5Q2hKsxShaPxFqgVtQH3ErTkiBf8NGb99nmpaGw7FCrr");
#[cfg(feature = "dev")]
declare_id!("yxvZ2jHThHQPTN6mGC8Z4i7iVBtQb3eBGeURQuLSrG9");
#[cfg(not(any(feature = "stable", feature = "dev")))]
declare_id!("monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih");

#[program]
pub mod monaco_protocol {
    use super::*;

    pub const PRICE_SCALE: u8 = 3_u8;

    pub fn create_order(
        ctx: Context<CreateOrder>,
        _distinct_seed: String,
        data: OrderData,
    ) -> Result<()> {
        instructions::order::create_order(ctx, data)?;

        Ok(())
    }

    pub fn create_order_v2(
        ctx: Context<CreateOrderV2>,
        _distinct_seed: String,
        data: OrderData,
    ) -> Result<()> {
        instructions::order::create_order_v2(ctx, data)?;

        Ok(())
    }

    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        instructions::order::cancel_order(ctx)?;

        Ok(())
    }

    pub fn settle_order(ctx: Context<SettleOrder>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        instructions::order::settle_order(ctx)?;

        Ok(())
    }

    pub fn settle_market_position(ctx: Context<SettleMarketPosition>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        instructions::market_position::settle_market_position(ctx)?;

        Ok(())
    }

    pub fn void_market_position(ctx: Context<VoidMarketPosition>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        instructions::market_position::void_market_position(ctx)?;

        Ok(())
    }

    pub fn authorise_admin_operator(
        ctx: Context<AuthoriseAdminOperator>,
        operator: Pubkey,
    ) -> Result<()> {
        if !ctx.accounts.authorised_operators.operator_list.is_empty() {
            verify_operator_authority(
                ctx.accounts.admin_operator.key,
                &ctx.accounts.authorised_operators,
            )?;
        }
        instructions::authorise_operator(
            ctx.accounts.admin_operator.key(),
            &mut ctx.accounts.authorised_operators,
            operator,
            "ADMIN".to_string(),
        )?;
        Ok(())
    }

    pub fn authorise_operator(
        ctx: Context<AuthoriseOperator>,
        operator_type: String,
        operator: Pubkey,
    ) -> Result<()> {
        require!(
            !operator_type.eq_ignore_ascii_case("admin"),
            CoreError::InvalidOperatorType
        );
        verify_operator_authority(
            ctx.accounts.admin_operator.key,
            &ctx.accounts.admin_operators,
        )?;
        instructions::authorise_operator(
            ctx.accounts.admin_operator.key(),
            &mut ctx.accounts.authorised_operators,
            operator,
            operator_type,
        )?;
        Ok(())
    }

    pub fn remove_authorised_operator(
        ctx: Context<AuthoriseOperator>,
        operator_type: String,
        operator: Pubkey,
    ) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.admin_operator.key,
            &ctx.accounts.admin_operators,
        )?;
        // Admins cannot remove themselves
        require!(
            !(ctx.accounts.authorised_operators.key() == ctx.accounts.admin_operators.key()
                && ctx.accounts.admin_operator.key() == operator.key()),
            CoreError::UnsupportedOperation
        );
        instructions::remove_authorised_operator(ctx, operator, operator_type)?;
        Ok(())
    }

    pub fn match_orders(mut ctx: Context<MatchOrders>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        let for_stake_unmatched = ctx.accounts.order_for.stake_unmatched;
        let against_stake_unmatched = ctx.accounts.order_against.stake_unmatched;

        if for_stake_unmatched == 0 || against_stake_unmatched == 0 {
            instructions::close_account(
                &mut ctx.accounts.trade_for.to_account_info(),
                &mut ctx.accounts.crank_operator.to_account_info(),
            )?;
            instructions::close_account(
                &mut ctx.accounts.trade_against.to_account_info(),
                &mut ctx.accounts.crank_operator.to_account_info(),
            )?;
            return Ok(());
        }

        instructions::matching::match_orders(&mut ctx)?;

        Ok(())
    }

    pub fn create_market(
        ctx: Context<CreateMarket>,
        event_account: Pubkey,
        market_type: String,
        title: String,
        market_lock_timestamp: i64,
        max_decimals: u8,
    ) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_type(&market_type)?;

        instructions::market::create(
            ctx,
            event_account,
            market_type,
            market_lock_timestamp,
            title,
            max_decimals,
        )?;
        Ok(())
    }

    pub fn initialize_market_outcome(
        ctx: Context<InitializeMarketOutcome>,
        title: String,
    ) -> Result<()> {
        msg!("Initializing market outcome");
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::initialize_outcome(ctx, title)?;
        msg!("Initialized market outcome");
        Ok(())
    }

    pub fn add_prices_to_market_outcome(
        ctx: Context<UpdateMarketOutcome>,
        _outcome_index: u16,
        new_prices: Vec<f64>,
    ) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::add_prices_to_market_outcome(&mut ctx.accounts.outcome, new_prices)?;
        Ok(())
    }

    pub fn update_market_title(ctx: Context<UpdateMarket>, title: String) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::update_title(ctx, title)
    }

    pub fn update_market_locktime(ctx: Context<UpdateMarket>, lock_time: i64) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::update_locktime(ctx, lock_time)
    }

    pub fn open_market(ctx: Context<UpdateMarket>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::open(&mut ctx.accounts.market)
    }

    pub fn settle_market(ctx: Context<UpdateMarket>, winning_outcome_index: u16) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        let settle_time = Clock::get().unwrap().unix_timestamp;
        instructions::market::settle(&mut ctx.accounts.market, winning_outcome_index, settle_time)
    }

    pub fn complete_market_settlement(ctx: Context<CompleteMarketSettlement>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        instructions::market::complete_settlement(ctx)
    }

    pub fn void_market(ctx: Context<UpdateMarket>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        let void_time = Clock::get().unwrap().unix_timestamp;
        instructions::market::void(&mut ctx.accounts.market, void_time)
    }

    pub fn complete_market_void(ctx: Context<CompleteMarketSettlement>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        instructions::market::complete_void(ctx)
    }

    pub fn publish_market(ctx: Context<UpdateMarket>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::publish(ctx)
    }

    pub fn unpublish_market(ctx: Context<UpdateMarket>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::unpublish(ctx)
    }

    pub fn suspend_market(ctx: Context<UpdateMarket>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::suspend(ctx)
    }

    pub fn unsuspend_market(ctx: Context<UpdateMarket>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::unsuspend(ctx)
    }

    pub fn set_market_ready_to_close(ctx: Context<SetMarketReadyToClose>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::ready_to_close(&mut ctx.accounts.market, &ctx.accounts.market_escrow)
    }

    pub fn transfer_market_escrow_surplus(ctx: Context<TransferMarketEscrowSurplus>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::transfer_market_escrow_surplus(
            &ctx.accounts.market,
            &ctx.accounts.market_escrow,
            &ctx.accounts.market_authority_token,
            &ctx.accounts.token_program,
        )
    }

    /*
    Close accounts
     */

    pub fn close_order(ctx: Context<CloseOrder>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        require!(
            ReadyToClose.eq(&ctx.accounts.market.market_status),
            CoreError::MarketNotReadyToClose
        );

        require!(
            ctx.accounts.order.is_completed(),
            CoreError::CloseAccountOrderNotComplete
        );

        Ok(())
    }

    pub fn close_trade(ctx: Context<CloseTrade>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        require!(
            ReadyToClose.eq(&ctx.accounts.market.market_status),
            CoreError::MarketNotReadyToClose
        );

        Ok(())
    }

    pub fn close_market_position(ctx: Context<CloseMarketPosition>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        require!(
            ReadyToClose.eq(&ctx.accounts.market.market_status),
            CoreError::MarketNotReadyToClose
        );

        Ok(())
    }

    pub fn close_market_matching_pool(
        ctx: Context<CloseMarketMatchingPool>,
        _price: f64,
        _for_outcome: bool,
    ) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        require!(
            ReadyToClose.eq(&ctx.accounts.market.market_status),
            CoreError::MarketNotReadyToClose
        );

        Ok(())
    }

    pub fn close_market_outcome(ctx: Context<CloseMarketOutcome>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        require!(
            ReadyToClose.eq(&ctx.accounts.market.market_status),
            CoreError::MarketNotReadyToClose
        );

        Ok(())
    }

    pub fn close_market(ctx: Context<CloseMarket>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        require!(
            ReadyToClose.eq(&ctx.accounts.market.market_status),
            CoreError::MarketNotReadyToClose
        );

        instructions::market::close_escrow_token_account(&ctx)?;

        Ok(())
    }
}
