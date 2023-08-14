use anchor_lang::prelude::*;

use crate::context::*;
use crate::error::CoreError;
use crate::instructions::market::verify_market_authority;
use crate::instructions::verify_operator_authority;
use crate::state::market_account::{
    Market, MarketMatchingPool, MarketOrderBehaviour, MarketOutcome,
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
    use crate::instructions::current_timestamp;

    pub const PRICE_SCALE: u8 = 3_u8;

    pub fn create_order(
        ctx: Context<CreateOrder>,
        _distinct_seed: String,
        data: OrderData,
    ) -> Result<()> {
        instructions::order::create_order(
            &mut ctx.accounts.order,
            &mut ctx.accounts.market,
            &ctx.accounts.purchaser,
            &ctx.accounts.purchaser_token,
            &ctx.accounts.token_program,
            &None,
            &mut ctx.accounts.market_matching_pool,
            &mut ctx.accounts.market_position,
            &ctx.accounts.market_escrow,
            &ctx.accounts.market_outcome,
            data,
        )
    }

    pub fn create_order_v2(
        ctx: Context<CreateOrderV2>,
        _distinct_seed: String,
        data: OrderData,
    ) -> Result<()> {
        instructions::order::create_order(
            &mut ctx.accounts.order,
            &mut ctx.accounts.market,
            &ctx.accounts.purchaser,
            &ctx.accounts.purchaser_token,
            &ctx.accounts.token_program,
            &ctx.accounts.product,
            &mut ctx.accounts.market_matching_pool,
            &mut ctx.accounts.market_position,
            &ctx.accounts.market_escrow,
            &ctx.accounts.market_outcome,
            data,
        )
    }

    pub fn move_market_matching_pool_to_inplay(
        ctx: Context<UpdateMarketMatchingPool>,
    ) -> Result<()> {
        instructions::matching::move_market_matching_pool_to_inplay(
            &ctx.accounts.market,
            &mut ctx.accounts.market_matching_pool,
        )
    }

    pub fn process_delay_expired_orders(ctx: Context<UpdateMarketMatchingPool>) -> Result<()> {
        instructions::matching::updated_liquidity_with_delay_expired_orders(
            &ctx.accounts.market,
            &mut ctx.accounts.market_matching_pool,
        )
    }

    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        instructions::order::cancel_order(ctx)?;

        Ok(())
    }

    pub fn cancel_preplay_order_post_event_start(
        ctx: Context<CancelPreplayOrderPostEventStart>,
    ) -> Result<()> {
        instructions::order::cancel_preplay_order_post_event_start(ctx)?;

        Ok(())
    }

    pub fn settle_order(ctx: Context<SettleOrder>) -> Result<()> {
        instructions::order::settle_order(ctx)
    }

    pub fn settle_market_position(ctx: Context<SettleMarketPosition>) -> Result<()> {
        instructions::market_position::settle_market_position(ctx)
    }

    pub fn void_market_position(ctx: Context<VoidMarketPosition>) -> Result<()> {
        instructions::market_position::void_market_position(ctx)
    }

    pub fn void_order(ctx: Context<VoidOrder>) -> Result<()> {
        instructions::order::void_order(&mut ctx.accounts.order, &mut ctx.accounts.market)
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
            ctx.accounts
                .trade_for
                .close(ctx.accounts.crank_operator.to_account_info())?;
            ctx.accounts
                .trade_against
                .close(ctx.accounts.crank_operator.to_account_info())?;
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
            market_lock_timestamp,
            false,
            0,
            MarketOrderBehaviour::None,
            MarketOrderBehaviour::None,
        )?;
        Ok(())
    }

    pub fn create_market_v2(
        ctx: Context<CreateMarket>,
        event_account: Pubkey,
        market_type: String,
        title: String,
        market_lock_timestamp: i64,
        max_decimals: u8,
        event_start_timestamp: i64,
        inplay_enabled: bool,
        inplay_order_delay: u8,
        event_start_order_behaviour: MarketOrderBehaviour,
        market_lock_order_behaviour: MarketOrderBehaviour,
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
            event_start_timestamp,
            inplay_enabled,
            inplay_order_delay,
            event_start_order_behaviour,
            market_lock_order_behaviour,
        )
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

    pub fn update_market_event_start_time(
        ctx: Context<UpdateMarket>,
        event_start_time: i64,
    ) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        let market = &mut ctx.accounts.market;
        instructions::market::update_market_event_start_time(market, event_start_time)
    }

    pub fn update_market_event_start_time_to_now(ctx: Context<UpdateMarket>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        let market = &mut ctx.accounts.market;
        instructions::market::update_market_event_start_time_to_now(market)
    }

    pub fn move_market_to_inplay(ctx: Context<UpdateMarketUnauthorized>) -> Result<()> {
        let now = current_timestamp();
        let market = &mut ctx.accounts.market;

        // market must have inplay enabled
        require!(market.inplay_enabled, CoreError::MarketInplayNotEnabled);

        // set it `true` only if it's `false`
        require!(!market.inplay, CoreError::MarketAlreadyInplay);

        // set it `true` only if now is after event start
        require!(
            market.event_start_timestamp <= now,
            CoreError::MarketEventNotStarted,
        );

        market.inplay = true;

        Ok(())
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

        let settle_time = current_timestamp();
        instructions::market::settle(&mut ctx.accounts.market, winning_outcome_index, settle_time)
    }

    pub fn complete_market_settlement(ctx: Context<CompleteMarketSettlement>) -> Result<()> {
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

        let void_time = current_timestamp();
        instructions::market::void(&mut ctx.accounts.market, void_time)
    }

    pub fn complete_market_void(ctx: Context<CompleteMarketSettlement>) -> Result<()> {
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

    pub fn process_commission_payment(ctx: Context<ProcessMarketCommissionPayment>) -> Result<()> {
        instructions::process_commission_payment(
            &mut ctx.accounts.commission_payments_queue.payment_queue,
            &ctx.accounts.market_escrow,
            &ctx.accounts.product_escrow_token,
            &ctx.accounts.product,
            &ctx.accounts.market,
            &ctx.accounts.token_program,
        )
    }

    /*
    Close accounts
     */

    pub fn close_order(ctx: Context<CloseOrder>) -> Result<()> {
        instructions::close::close_order(&mut ctx.accounts.market, &ctx.accounts.order)
    }

    pub fn close_trade(ctx: Context<CloseTrade>) -> Result<()> {
        instructions::close::close_market_child_account(&mut ctx.accounts.market)
    }

    pub fn close_market_position(ctx: Context<CloseMarketPosition>) -> Result<()> {
        instructions::close::close_market_child_account(&mut ctx.accounts.market)
    }

    pub fn close_market_matching_pool(ctx: Context<CloseMarketMatchingPool>) -> Result<()> {
        instructions::close::close_market_child_account(&mut ctx.accounts.market)
    }

    pub fn close_market_outcome(ctx: Context<CloseMarketOutcome>) -> Result<()> {
        instructions::close::close_market_child_account(&mut ctx.accounts.market)
    }

    pub fn close_market(ctx: Context<CloseMarket>) -> Result<()> {
        instructions::close::close_market(
            &ctx.accounts.market.market_status,
            ctx.accounts.commission_payment_queue.payment_queue.len(),
            ctx.accounts.market.unclosed_accounts_count,
        )?;

        instructions::market::close_escrow_token_account(&ctx)
    }
}
