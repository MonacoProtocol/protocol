use anchor_lang::prelude::*;

use crate::context::*;
use crate::error::CoreError;
use crate::instructions::market::verify_market_authority;
use crate::instructions::market_position;
use crate::instructions::transfer;
use crate::instructions::verify_operator_authority;
use crate::state::market_account::{Market, MarketOrderBehaviour};
use crate::state::market_liquidities::LiquiditySource;
use crate::state::market_order_request_queue::{MarketOrderRequestQueue, OrderRequestData};
use crate::state::market_position_account::MarketPosition;
use crate::state::operator_account::AuthorisedOperators;
use crate::state::order_account::Order;
use crate::state::trade_account::Trade;

pub mod context;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

#[cfg(feature = "stable")]
declare_id!("5Q2hKsxShaPxFqgVtQH3ErTkiBf8NGb99nmpaGw7FCrr");
#[cfg(feature = "dev")]
declare_id!("yxvZ2jHThHQPTN6mGC8Z4i7iVBtQb3eBGeURQuLSrG9");
#[cfg(feature = "edge")]
declare_id!("mpDEVnZKneBb4w1vQsoTgMkNqnFe1rwW8qjmf3NsrAU");
#[cfg(not(any(feature = "stable", feature = "dev", feature = "edge")))]
declare_id!("monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih");

#[program]
pub mod monaco_protocol {
    use super::*;
    use crate::instructions::current_timestamp;
    use crate::state::market_liquidities::LiquiditySource;
    use crate::state::market_matching_queue_account::MarketMatchingQueue;
    use crate::state::order_account::OrderStatus;

    pub const PRICE_SCALE: u8 = 3_u8;
    pub const SEED_SEPARATOR_CHAR: char = '␞';
    pub const SEED_SEPARATOR: &[u8] = b"\xE2\x90\x9E"; // "␞"

    pub fn create_order_request(
        ctx: Context<CreateOrderRequest>,
        data: OrderRequestData,
    ) -> Result<()> {
        let payment = instructions::order_request::create_order_request(
            ctx.accounts.market.key(),
            &mut ctx.accounts.market,
            &ctx.accounts.payer,
            &ctx.accounts.purchaser,
            &ctx.accounts.product,
            &mut ctx.accounts.market_position,
            &ctx.accounts.market_outcome,
            &ctx.accounts.price_ladder,
            &mut ctx.accounts.order_request_queue,
            data,
        )?;

        // if PDA owner then do PDA transfer else do regular token account transfer
        if ctx.accounts.purchaser_token.owner == ctx.accounts.purchaser_token.key() {
            // Verify PDA is the correct account
            let market = ctx.accounts.market.key();
            Pubkey::create_program_address(
                &[
                    b"funding",
                    market.key().as_ref(),
                    &[ctx.accounts.market.funding_account_bump],
                ],
                &monaco_protocol::ID,
            )
            .map_or_else(
                |_| Err(CoreError::OrderRequestCreationInvalidPayerTokenAccount.into()),
                |pk| {
                    require!(
                        pk == ctx.accounts.purchaser_token.key(),
                        CoreError::OrderRequestCreationInvalidPayerTokenAccount
                    );
                    Ok(())
                },
            )?;

            transfer::funding_account_order_creation_payment(
                &ctx.accounts.market_escrow,
                &ctx.accounts.purchaser_token,
                &ctx.accounts.token_program,
                &ctx.accounts.market.key(),
                ctx.accounts.market.funding_account_bump,
                payment,
            )?;
        } else {
            transfer::order_creation_payment(
                &ctx.accounts.market_escrow,
                &ctx.accounts.purchaser,
                &ctx.accounts.purchaser_token,
                &ctx.accounts.token_program,
                payment,
            )?;
        }
        ctx.accounts
            .reserved_order
            .close(ctx.accounts.payer.to_account_info())
    }

    pub fn create_market_position(ctx: Context<CreateMarketPosition>) -> Result<()> {
        market_position::create_market_position(
            &ctx.accounts.purchaser.key(),
            &ctx.accounts.payer.key(),
            ctx.accounts.market.key(),
            &ctx.accounts.market,
            &mut ctx.accounts.market_position,
        )?;
        ctx.accounts.market.increment_account_counts()
    }

    pub fn process_order_request(ctx: Context<ProcessOrderRequest>) -> Result<()> {
        let refund = instructions::order_request::process_order_request(
            &mut ctx.accounts.order,
            &mut ctx.accounts.market_position,
            &mut ctx.accounts.market,
            &mut ctx.accounts.market_liquidities,
            &mut ctx.accounts.market_matching_queue,
            &ctx.accounts.crank_operator,
            &mut ctx.accounts.market_matching_pool,
            &mut ctx.accounts.order_request_queue,
        )?;

        transfer::order_creation_refund(
            &ctx.accounts.market_escrow,
            &ctx.accounts.purchaser_token_account,
            &ctx.accounts.token_program,
            &ctx.accounts.market,
            refund,
        )
    }

    pub fn dequeue_order_request(ctx: Context<DequeueOrderRequest>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        let refund_amount = instructions::order_request::dequeue_order_request(
            &mut ctx.accounts.order_request_queue,
            &mut ctx.accounts.market_position,
        )?;

        transfer::transfer_from_market_escrow(
            &ctx.accounts.market_escrow,
            &ctx.accounts.purchaser_token,
            &ctx.accounts.token_program,
            &ctx.accounts.market,
            refund_amount,
        )
    }

    pub fn move_market_matching_pool_to_inplay(
        ctx: Context<UpdateMarketMatchingPool>,
    ) -> Result<()> {
        instructions::matching::move_market_matching_pool_to_inplay(
            &ctx.accounts.market,
            &ctx.accounts.market_matching_queue,
            &mut ctx.accounts.market_matching_pool,
        )
    }

    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        let refund_amount = instructions::order::cancel_order(
            &mut ctx.accounts.market,
            &ctx.accounts.order.key(),
            &mut ctx.accounts.order,
            &mut ctx.accounts.market_position,
            &mut ctx.accounts.market_liquidities,
            &ctx.accounts.market_matching_queue,
            &mut ctx.accounts.market_matching_pool,
        )?;

        transfer::transfer_from_market_escrow(
            &ctx.accounts.market_escrow,
            &ctx.accounts.purchaser_token_account,
            &ctx.accounts.token_program,
            &ctx.accounts.market,
            refund_amount,
        )?;

        // if never matched, close
        if ctx.accounts.order.order_status == OrderStatus::Cancelled {
            ctx.accounts.market.decrement_account_counts()?;
            ctx.accounts
                .order
                .close(ctx.accounts.payer.to_account_info())?;
        }

        Ok(())
    }

    pub fn cancel_order_post_market_lock(ctx: Context<CancelOrderPostMarketLock>) -> Result<()> {
        let refund_amount = instructions::order::cancel_order_post_market_lock(
            &mut ctx.accounts.market,
            &mut ctx.accounts.order,
            &mut ctx.accounts.market_position,
            &ctx.accounts.matching_queue,
            &ctx.accounts.order_request_queue,
        )?;

        transfer::transfer_from_market_escrow(
            &ctx.accounts.market_escrow,
            &ctx.accounts.purchaser_token,
            &ctx.accounts.token_program,
            &ctx.accounts.market,
            refund_amount,
        )?;

        Ok(())
    }

    pub fn cancel_preplay_order_post_event_start(
        ctx: Context<CancelPreplayOrderPostEventStart>,
    ) -> Result<()> {
        let refund_amount = instructions::order::cancel_preplay_order_post_event_start(
            &mut ctx.accounts.market,
            &mut ctx.accounts.market_liquidities,
            &mut ctx.accounts.market_matching_pool,
            &mut ctx.accounts.order,
            &mut ctx.accounts.market_position,
            &ctx.accounts.matching_queue,
            &ctx.accounts.order_request_queue,
        )?;

        transfer::transfer_from_market_escrow(
            &ctx.accounts.market_escrow,
            &ctx.accounts.purchaser_token,
            &ctx.accounts.token_program,
            &ctx.accounts.market,
            refund_amount,
        )?;

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

    #[allow(unused_variables)]
    pub fn process_order_match_taker(
        ctx: Context<ProcessOrderMatchTaker>,
        order_trade_seed: [u8; 16],
    ) -> Result<()> {
        instructions::matching::on_order_match_taker(
            &ctx.accounts.market.key(),
            &mut ctx.accounts.market,
            &mut ctx.accounts.market_matching_queue,
            &ctx.accounts.order.key(),
            &mut ctx.accounts.order,
            &mut ctx.accounts.order_trade,
            &ctx.accounts.crank_operator.key(),
        )?;

        Ok(())
    }

    #[allow(unused_variables)]
    pub fn process_order_match_maker(
        ctx: Context<ProcessOrderMatchMaker>,
        order_trade_seed: [u8; 16],
    ) -> Result<()> {
        let refund_amount = instructions::matching::on_order_match_maker(
            &mut ctx.accounts.market,
            &mut ctx.accounts.market_matching_queue,
            &mut ctx.accounts.market_matching_pool,
            &ctx.accounts.order.key(),
            &mut ctx.accounts.order,
            &mut ctx.accounts.market_position,
            &mut ctx.accounts.order_trade,
            &ctx.accounts.crank_operator.key(),
        )?;

        transfer::transfer_from_market_escrow(
            &ctx.accounts.market_escrow,
            &ctx.accounts.purchaser_token,
            &ctx.accounts.token_program,
            &ctx.accounts.market,
            refund_amount,
        )?;

        Ok(())
    }

    pub fn update_market_liquidities_with_cross_liquidity(
        ctx: Context<UpdateMarketLiquidities>,
        source_for_outcome: bool,
        source_liquidities: Vec<LiquiditySource>,
    ) -> Result<()> {
        instructions::market_liquidities::update_market_liquidities_with_cross_liquidity(
            &ctx.accounts.market,
            &mut ctx.accounts.market_liquidities,
            source_for_outcome,
            source_liquidities,
        )?;

        Ok(())
    }

    #[allow(unused_variables)]
    pub fn match_orders(
        mut ctx: Context<MatchOrders>,
        trade_for_seed: [u8; 16],
        trade_against_seed: [u8; 16],
    ) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.crank_operator.key,
            &ctx.accounts.authorised_operators,
        )?;

        let for_stake_unmatched = ctx.accounts.order_for.stake_unmatched;
        let against_stake_unmatched = ctx.accounts.order_against.stake_unmatched;

        let liquidity_for = ctx.accounts.market_liquidities.get_liquidity_for(
            ctx.accounts.order_for.market_outcome_index,
            ctx.accounts.order_for.expected_price,
        );
        let liquidity_against = ctx.accounts.market_liquidities.get_liquidity_against(
            ctx.accounts.order_against.market_outcome_index,
            ctx.accounts.order_against.expected_price,
        );

        if for_stake_unmatched == 0
            || against_stake_unmatched == 0
            || liquidity_for.map_or(0_u64, |x| x.liquidity) < against_stake_unmatched
            || liquidity_against.map_or(0_u64, |x| x.liquidity) < for_stake_unmatched
        {
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

    pub fn create_market_type(
        ctx: Context<CreateMarketType>,
        name: String,
        requires_discriminator: bool,
        requires_value: bool,
    ) -> Result<()> {
        instructions::market_type::create_market_type(
            &mut ctx.accounts.market_type,
            name,
            requires_discriminator,
            requires_value,
        )
    }

    pub fn create_price_ladder(
        ctx: Context<CreatePriceLadder>,
        _distinct_seed: String,
        max_number_of_prices: u16,
    ) -> Result<()> {
        instructions::price_ladder::create_price_ladder(
            &mut ctx.accounts.price_ladder,
            max_number_of_prices,
            &ctx.accounts.authority.key(),
        )
    }

    pub fn add_prices_to_price_ladder(
        ctx: Context<UpdatePriceLadder>,
        prices_to_add: Vec<f64>,
    ) -> Result<()> {
        instructions::price_ladder::add_prices_to_price_ladder(
            &mut ctx.accounts.price_ladder,
            prices_to_add,
        )
    }

    pub fn remove_prices_from_price_ladder(
        ctx: Context<UpdatePriceLadder>,
        prices_to_remove: Vec<f64>,
    ) -> Result<()> {
        instructions::price_ladder::remove_prices_from_price_ladder(
            &mut ctx.accounts.price_ladder,
            prices_to_remove,
        )
    }

    pub fn increase_price_ladder_size(
        ctx: Context<UpdatePriceLadderSize>,
        max_number_of_prices: u16,
    ) -> Result<()> {
        instructions::price_ladder::increase_price_ladder_size(
            &mut ctx.accounts.price_ladder,
            max_number_of_prices,
        )
    }

    pub fn close_price_ladder(_ctx: Context<ClosePriceLadder>) -> Result<()> {
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_market(
        ctx: Context<CreateMarket>,
        event_account: Pubkey,
        market_type_discriminator: Option<String>,
        market_type_value: Option<String>,
        title: String,
        max_decimals: u8,
        market_lock_timestamp: i64,
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
        let market_type = ctx.accounts.market_type.key();
        instructions::market::create(
            ctx,
            event_account,
            market_type,
            market_type_discriminator,
            market_type_value,
            title,
            max_decimals,
            market_lock_timestamp,
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

        let market = &mut ctx.accounts.market;
        instructions::market::update_locktime(market, lock_time)
    }

    pub fn update_market_locktime_to_now(ctx: Context<UpdateMarket>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        let market = &mut ctx.accounts.market;
        instructions::market::update_locktime_to_now(market)
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

    pub fn move_market_to_inplay(ctx: Context<MoveMarketToInplay>) -> Result<()> {
        instructions::market::move_market_to_inplay(
            &mut ctx.accounts.market,
            &mut ctx.accounts.market_liquidities,
        )
    }

    pub fn open_market(ctx: Context<OpenMarket>, enable_cross_matching: bool) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::open(
            &ctx.accounts.market.key(),
            &mut ctx.accounts.market,
            enable_cross_matching,
            &mut ctx.accounts.liquidities,
            &mut ctx.accounts.matching_queue,
            &mut ctx.accounts.commission_payment_queue,
            &mut ctx.accounts.order_request_queue,
        )
    }

    pub fn settle_market(ctx: Context<SettleMarket>, winning_outcome_index: u16) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        let settle_time = current_timestamp();
        instructions::market::settle(
            &mut ctx.accounts.market,
            &ctx.accounts.market_matching_queue,
            &ctx.accounts.order_request_queue,
            winning_outcome_index,
            settle_time,
        )
    }

    pub fn complete_market_settlement(ctx: Context<CompleteMarketSettlement>) -> Result<()> {
        instructions::market::complete_settlement(
            &mut ctx.accounts.market,
            &ctx.accounts.commission_payments_queue,
        )
    }

    pub fn void_market(ctx: Context<VoidMarket>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        let void_time = current_timestamp();
        instructions::market::void(
            &mut ctx.accounts.market,
            void_time,
            &ctx.accounts
                .market_matching_queue
                .clone()
                .map(|queue: Account<MarketMatchingQueue>| queue.into_inner()),
            &ctx.accounts
                .order_request_queue
                .clone()
                .map(|queue: Account<MarketOrderRequestQueue>| queue.into_inner()),
        )
    }

    pub fn complete_market_void(ctx: Context<CompleteMarketVoid>) -> Result<()> {
        instructions::market::complete_void(&mut ctx.accounts.market)
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

        instructions::market::ready_to_close(
            &mut ctx.accounts.market,
            &ctx.accounts.market_escrow,
            &ctx.accounts.market_funding,
        )
    }

    pub fn transfer_market_token_surplus(ctx: Context<TransferMarketTokenSurplus>) -> Result<()> {
        verify_operator_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.authorised_operators,
        )?;
        verify_market_authority(
            ctx.accounts.market_operator.key,
            &ctx.accounts.market.authority,
        )?;

        instructions::market::transfer_market_token_surplus(
            &ctx.accounts.market,
            &ctx.accounts.market_escrow,
            &ctx.accounts.market_funding,
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
        instructions::close::close_market_position(
            &mut ctx.accounts.market,
            &ctx.accounts.market_position,
        )
    }

    pub fn close_market_matching_pool(ctx: Context<CloseMarketMatchingPool>) -> Result<()> {
        instructions::close::close_market_child_account(&mut ctx.accounts.market)
    }

    pub fn close_market_outcome(ctx: Context<CloseMarketOutcome>) -> Result<()> {
        instructions::close::close_market_child_account(&mut ctx.accounts.market)
    }

    pub fn close_market_queues(ctx: Context<CloseMarketQueues>) -> Result<()> {
        instructions::close::close_market_queues(
            &mut ctx.accounts.market,
            &ctx.accounts.liquidities,
            &ctx.accounts.commission_payment_queue.payment_queue,
            &ctx.accounts.matching_queue.matches,
            &ctx.accounts.order_request_queue.order_requests,
        )
    }

    pub fn close_market(ctx: Context<CloseMarket>) -> Result<()> {
        instructions::close::close_market(
            &ctx.accounts.market.market_status,
            ctx.accounts.market.unclosed_accounts_count,
        )?;

        instructions::market::close_escrow_token_account(&ctx)?;
        instructions::market::close_funding_token_account(&ctx)
    }
}
