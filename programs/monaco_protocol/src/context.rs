use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;
use anchor_spl::token::{Mint, Token, TokenAccount};
use protocol_product::state::product::Product;
use solana_program::rent::Rent;

use crate::error::CoreError;
use crate::monaco_protocol::SEED_SEPARATOR;
use crate::state::market_liquidities::MarketLiquidities;
use crate::state::market_matching_pool_account::MarketMatchingPool;
use crate::state::market_matching_queue_account::MarketMatchingQueue;
use crate::state::market_order_request_queue::MarketOrderRequestQueue;
use crate::state::market_outcome_account::MarketOutcome;
use crate::state::market_type::MarketType;
use crate::state::order_account::ReservedOrder;
use crate::state::payments_queue::MarketPaymentsQueue;
use crate::state::price_ladder::PriceLadder;
use crate::{AuthorisedOperators, Market, MarketPosition, Order, OrderRequestData, Trade};

#[derive(Accounts)]
#[instruction(data: OrderRequestData)]
pub struct CreateOrderRequest<'info> {
    #[account(
        init,
        seeds = [
            market.key().as_ref(),
            purchaser.key().as_ref(),
            &data.distinct_seed,
        ],
        bump,
        payer = payer,
        space = ReservedOrder::SIZE,
    )]
    pub reserved_order: Account<'info, ReservedOrder>,
    #[account(
        mut,
        seeds = [b"order_request".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub order_request_queue: Account<'info, MarketOrderRequestQueue>,

    #[account(
        init_if_needed,
        seeds = [
            purchaser.key().as_ref(),
            market.key().as_ref()
        ],
        bump,
        payer = payer,
        space = MarketPosition::size_for(usize::from(market.market_outcomes_count))
    )]
    pub market_position: Box<Account<'info, MarketPosition>>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub purchaser: Signer<'info>,
    #[account(
        mut,
        token::mint = market.mint_account,
    )]
    pub purchaser_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [
            market.key().as_ref(),
            data.market_outcome_index.to_string().as_ref(),
        ],
        bump,
        constraint = market_outcome.prices.is_none() ||
        (market_outcome.prices.is_some() && price_ladder.is_some() && market_outcome.prices.unwrap() == price_ladder.as_ref().unwrap().key())
        @ CoreError::CreationInvalidPriceLadder
    )]
    pub market_outcome: Account<'info, MarketOutcome>,
    pub price_ladder: Option<Account<'info, PriceLadder>>,

    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Account<'info, TokenAccount>,

    pub product: Option<Account<'info, Product>>,

    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CreateMarketPosition<'info> {
    #[account(
        init,
        seeds = [
            purchaser.key().as_ref(),
            market.key().as_ref()
        ],
        bump,
        payer = payer,
        space = MarketPosition::size_for(usize::from(market.market_outcomes_count))
    )]
    pub market_position: Account<'info, MarketPosition>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    pub purchaser: SystemAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProcessOrderRequest<'info> {
    #[account(
        init,
        seeds = [
            market.key().as_ref(),
            order_request_queue.order_requests
                .peek_front()
                .ok_or(CoreError::OrderRequestQueueIsEmpty)?
                .purchaser.as_ref(),
            &order_request_queue.order_requests
                .peek_front()
                .ok_or(CoreError::OrderRequestQueueIsEmpty)?
                .distinct_seed,
        ],
        bump,
        payer = crank_operator,
        space = Order::SIZE,
    )]
    pub order: Account<'info, Order>,
    #[account(
        mut,
        associated_token::mint = market.mint_account,
        associated_token::authority = order_request_queue.order_requests
            .peek_front()
            .ok_or(CoreError::OrderRequestQueueIsEmpty)?
            .purchaser,
    )]
    pub purchaser_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        has_one = market @ CoreError::CreationMarketMismatch,
        constraint = market_position.purchaser == order_request_queue.order_requests
            .peek_front()
            .ok_or(CoreError::OrderRequestQueueIsEmpty)?
            .purchaser @ CoreError::CreationPurchaserMismatch
    )]
    pub market_position: Account<'info, MarketPosition>,

    #[account(
        init_if_needed,
        seeds = [
            market.key().as_ref(),
            order_request_queue.order_requests
                .peek_front()
                .ok_or(CoreError::OrderRequestQueueIsEmpty)?
                .market_outcome_index.to_string().as_ref(),
            b"-".as_ref(),
            format!("{:.3}",
                order_request_queue.order_requests
                    .peek_front()
                    .ok_or(CoreError::OrderRequestQueueIsEmpty)?
                    .expected_price
            ).as_ref(),
            order_request_queue.order_requests
                .peek_front()
                .ok_or(CoreError::OrderRequestQueueIsEmpty)?
                .for_outcome.to_string().as_ref(),
        ],
        payer = crank_operator,
        bump,
        space = MarketMatchingPool::SIZE
    )]
    pub market_matching_pool: Box<Account<'info, MarketMatchingPool>>,

    #[account(
        mut,
        seeds = [b"order_request".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub order_request_queue: Account<'info, MarketOrderRequestQueue>,

    #[account(mut)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Account<'info, TokenAccount>,
    #[account(
        mut,
        has_one = market @ CoreError::CreationMarketMismatch,
    )]
    pub market_liquidities: Account<'info, MarketLiquidities>,
    #[account(
        mut,
        has_one = market @ CoreError::CreationMarketMismatch,
    )]
    pub market_matching_queue: Account<'info, MarketMatchingQueue>,

    #[account(mut)]
    pub crank_operator: Signer<'info>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DequeueOrderRequest<'info> {
    #[account(
        mut,
        seeds = [b"order_request".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub order_request_queue: Account<'info, MarketOrderRequestQueue>,

    #[account(
        mut,
        has_one = market @ CoreError::CancelationMarketMismatch,
    )]
    pub market_position: Account<'info, MarketPosition>,
    #[account(
        mut,
        associated_token::mint = market.mint_account,
        associated_token::authority = market_position.purchaser,
    )]
    pub purchaser_token: Account<'info, TokenAccount>,

    pub market: Account<'info, Market>,

    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Account<'info, TokenAccount>,

    #[account(mut)]
    pub market_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"MARKET".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateMarketMatchingPool<'info> {
    pub market: Account<'info, Market>,
    #[account(has_one = market)]
    pub market_matching_queue: Account<'info, MarketMatchingQueue>,
    #[account(mut, has_one = market)]
    pub market_matching_pool: Account<'info, MarketMatchingPool>,
}

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(mut)]
    pub order: Account<'info, Order>,

    #[account(mut, address = order.purchaser @ CoreError::CancelationPurchaserMismatch)]
    pub purchaser: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = market.mint_account,
        associated_token::authority = purchaser,
    )]
    pub purchaser_token_account: Account<'info, TokenAccount>,

    #[account(mut, address = order.payer @ CoreError::CancelationPayerMismatch)]
    pub payer: SystemAccount<'info>,

    #[account(mut, address = order.market @ CoreError::CancelationMarketMismatch)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        has_one = market @ CoreError::CancelationMarketLiquiditiesMismatch,
    )]
    pub market_liquidities: Account<'info, MarketLiquidities>,
    #[account(
        mut,
        has_one = market @ CoreError::CancelationMarketOutcomeMismatch,
        constraint = market_outcome.index == order.market_outcome_index @ CoreError::CancelationMarketOutcomeMismatch,
    )]
    pub market_outcome: Account<'info, MarketOutcome>,
    #[account(has_one = market)]
    pub market_matching_queue: Account<'info, MarketMatchingQueue>,
    #[account(
        mut,
        seeds = [
            market.key().as_ref(),
            order.market_outcome_index.to_string().as_ref(),
            b"-".as_ref(),
            format!("{:.3}", order.expected_price).as_ref(),
            order.for_outcome.to_string().as_ref(),
        ],
        bump,
    )]
    pub market_matching_pool: Account<'info, MarketMatchingPool>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Box<Account<'info, TokenAccount>>,

    // market_position needs to be here so market validation happens first
    #[account(mut, seeds = [purchaser.key().as_ref(), market.key().as_ref()], bump)]
    pub market_position: Box<Account<'info, MarketPosition>>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelOrderPostMarketLock<'info> {
    #[account(mut)]
    pub order: Account<'info, Order>,

    #[account(mut, address = order.purchaser @ CoreError::CancelationPurchaserMismatch)]
    pub purchaser: SystemAccount<'info>,

    #[account(
        mut,
        associated_token::mint = market.mint_account,
        associated_token::authority = purchaser,
    )]
    pub purchaser_token: Account<'info, TokenAccount>,

    #[account(mut, address = order.market @ CoreError::CancelationMarketMismatch)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Box<Account<'info, TokenAccount>>,
    #[account(
        seeds = [b"order_request".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub order_request_queue: Account<'info, MarketOrderRequestQueue>,
    #[account(
        seeds = [b"matching".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub matching_queue: Account<'info, MarketMatchingQueue>,

    // market_position needs to be here so market validation happens first
    #[account(mut, seeds = [purchaser.key().as_ref(), market.key().as_ref()], bump)]
    pub market_position: Box<Account<'info, MarketPosition>>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelPreplayOrderPostEventStart<'info> {
    #[account(mut)]
    pub order: Account<'info, Order>,

    #[account(mut, address = order.purchaser @ CoreError::CancelationPurchaserMismatch)]
    pub purchaser: SystemAccount<'info>,
    #[account(
        mut,
        associated_token::mint = market.mint_account,
        associated_token::authority = purchaser,
    )]
    pub purchaser_token: Account<'info, TokenAccount>,

    #[account(mut, address = order.market @ CoreError::CancelationMarketMismatch)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        has_one = market @ CoreError::CreationMarketMismatch,
    )]
    pub market_liquidities: Account<'info, MarketLiquidities>,
    #[account(
        mut,
        seeds = [
            market.key().as_ref(),
            order.market_outcome_index.to_string().as_ref(),
            b"-".as_ref(),
            format!("{:.3}", order.expected_price).as_ref(),
            order.for_outcome.to_string().as_ref(),
        ],
        bump,
    )]
    pub market_matching_pool: Account<'info, MarketMatchingPool>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [b"order_request".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub order_request_queue: Account<'info, MarketOrderRequestQueue>,
    #[account(
        seeds = [b"matching".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub matching_queue: Account<'info, MarketMatchingQueue>,

    // market_position needs to be here so market validation happens first
    #[account(mut, seeds = [purchaser.key().as_ref(), market.key().as_ref()], bump)]
    pub market_position: Box<Account<'info, MarketPosition>>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AuthoriseAdminOperator<'info> {
    #[account(
        init_if_needed,
        seeds = [b"authorised_operators".as_ref(), b"ADMIN".as_ref()],
        payer = admin_operator,
        bump,
        space = AuthorisedOperators::SIZE
    )]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
    #[account(mut)]
    pub admin_operator: Signer<'info>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(operator_type: String)]
pub struct AuthoriseOperator<'info> {
    #[account(
        init_if_needed,
        seeds = [b"authorised_operators".as_ref(), operator_type.as_ref()],
        payer = admin_operator,
        bump,
        space = AuthorisedOperators::SIZE,
        constraint = operator_type.chars().all(char::is_uppercase) @ CoreError::InvalidOperatorType
    )]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
    #[account(mut)]
    pub admin_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"ADMIN".as_ref()], bump)]
    pub admin_operators: Account<'info, AuthorisedOperators>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

fn taker_order_constraint(
    market_matching_queue: &Account<MarketMatchingQueue>,
    order: &Account<Order>,
) -> bool {
    match market_matching_queue.matches.peek() {
        Some(head) => match &head.pk {
            Some(head_pk) => order.key().eq(head_pk),
            None => false,
        },
        None => false,
    }
}

#[derive(Accounts)]
#[instruction(order_trade_seed: [u8; 16])]
pub struct ProcessOrderMatchTaker<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        has_one = market @ CoreError::MatchingMarketMismatch,
        constraint = !market_matching_queue.matches.is_empty()
            @ CoreError::MatchingQueueIsEmpty,
    )]
    pub market_matching_queue: Box<Account<'info, MarketMatchingQueue>>,

    #[account(
        mut,
        has_one = market @ CoreError::MatchingMarketMismatch,
        constraint = taker_order_constraint(&market_matching_queue, &order)
            @ CoreError::MatchingPoolHeadMismatch,
    )]
    pub order: Account<'info, Order>,
    #[account(
        init,
        seeds = [
            order.key().as_ref(),
            &order_trade_seed,
        ],
        bump,
        payer = crank_operator,
        space = Trade::SIZE,
    )]
    pub order_trade: Box<Account<'info, Trade>>,

    #[account(mut)]
    pub crank_operator: Signer<'info>,

    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

fn market_matching_pool_constraint(
    market_matching_queue: &Account<MarketMatchingQueue>,
    market_matching_pool: &Account<MarketMatchingPool>,
) -> bool {
    match market_matching_queue.matches.peek() {
        Some(order_match) => {
            market_matching_pool.for_outcome == order_match.for_outcome
                && market_matching_pool.market_outcome_index == order_match.outcome_index
                && market_matching_pool.price == order_match.price
        }
        None => false,
    }
}

fn maker_order_constraint(
    market_matching_pool: &Account<MarketMatchingPool>,
    maker_order: &Account<Order>,
) -> bool {
    match market_matching_pool.orders.peek(0) {
        Some(head) => maker_order.key().eq(head),
        None => false,
    }
}

#[derive(Accounts)]
#[instruction(order_trade_seed: [u8; 16])]
pub struct ProcessOrderMatchMaker<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Account<'info, TokenAccount>,
    #[account(
        mut,
        has_one = market @ CoreError::MatchingMarketMismatch,
        constraint = !market_matching_queue.matches.is_empty()
            @ CoreError::MatchingQueueIsEmpty,
    )]
    pub market_matching_queue: Box<Account<'info, MarketMatchingQueue>>,

    #[account(
        mut,
        has_one = market @ CoreError::MatchingMarketMismatch,
        constraint = market_matching_pool_constraint(&market_matching_queue, &market_matching_pool)
            @ CoreError::MatchingMarketMatchingPoolMismatch,
    )]
    pub market_matching_pool: Box<Account<'info, MarketMatchingPool>>,
    #[account(
        mut,
        has_one = market @ CoreError::MatchingMarketMismatch,
        constraint = maker_order_constraint(&market_matching_pool, &order)
            @ CoreError::MatchingPoolHeadMismatch,
    )]
    pub order: Account<'info, Order>,
    #[account(
        mut,
        has_one = market @ CoreError::MatchingMarketMismatch,
        constraint = market_position.purchaser == order.purchaser
            @ CoreError::MatchingPurchaserMismatch,
    )]
    pub market_position: Box<Account<'info, MarketPosition>>,
    #[account(
        mut,
        associated_token::mint = market.mint_account,
        associated_token::authority = order.purchaser
    )]
    pub purchaser_token: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        seeds = [
            order.key().as_ref(),
            &order_trade_seed
        ],
        bump,
        payer = crank_operator,
        space = Trade::SIZE,
    )]
    pub order_trade: Box<Account<'info, Trade>>,

    #[account(mut)]
    pub crank_operator: Signer<'info>,

    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(
    trade_for_seed: [u8; 16],
    trade_against_seed: [u8; 16],
)]
pub struct MatchOrders<'info> {
    #[account(
        mut,
        has_one = market @ CoreError::MatchingMarketMismatch,
        constraint = order_against.key() != order_for.key() @ CoreError::MatchingOrdersForAndAgainstAreIdentical,
        constraint = !order_against.for_outcome @ CoreError::MatchingExpectedAnAgainstOrder,
    )]
    pub order_against: Account<'info, Order>,
    #[account(
        init,
        seeds = [
            order_against.key().as_ref(),
            &trade_against_seed,
        ],
        bump,
        payer = crank_operator,
        space = Trade::SIZE,
    )]
    pub trade_against: Box<Account<'info, Trade>>,

    #[account(
        mut,
        has_one = market @ CoreError::MatchingMarketMismatch,
        constraint = market_position_against.purchaser == order_against.purchaser @ CoreError::MatchingPurchaserMismatch,
    )]
    pub market_position_against: Box<Account<'info, MarketPosition>>,
    #[account(
        mut,
        seeds = [
            market.key().as_ref(),
            order_against.market_outcome_index.to_string().as_ref(),
            b"-".as_ref(),
            format!("{:.3}", order_against.expected_price).as_ref(),
            false.to_string().as_ref(),
        ],
        bump,
    )]
    pub market_matching_pool_against: Box<Account<'info, MarketMatchingPool>>,

    #[account(
        mut,
        has_one = market @ CoreError::MatchingMarketMismatch,
        constraint = order_for.key() != order_against.key() @ CoreError::MatchingOrdersForAndAgainstAreIdentical,
        constraint = order_for.for_outcome @ CoreError::MatchingExpectedAForOrder,
    )]
    pub order_for: Account<'info, Order>,

    #[account(
        init,
        seeds = [
            order_for.key().as_ref(),
            &trade_for_seed,
        ],
        bump,
        payer = crank_operator,
        space = Trade::SIZE,
    )]
    pub trade_for: Box<Account<'info, Trade>>,

    #[account(
        mut,
        has_one = market @ CoreError::MatchingMarketMismatch,
        constraint = market_position_for.purchaser == order_for.purchaser @ CoreError::MatchingPurchaserMismatch,
    )]
    pub market_position_for: Box<Account<'info, MarketPosition>>,
    #[account(
        mut,
        seeds = [
            market.key().as_ref(),
            order_for.market_outcome_index.to_string().as_ref(),
            b"-".as_ref(),
            format!("{:.3}", order_for.expected_price).as_ref(),
            true.to_string().as_ref(),
        ],
        bump,
    )]
    pub market_matching_pool_for: Box<Account<'info, MarketMatchingPool>>,

    #[account(mut)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        has_one = market @ CoreError::MatchingMarketOutcomeMismatch,
        constraint = market_outcome.index == order_for.market_outcome_index
            @ CoreError::MatchingMarketOutcomeMismatch,
        constraint = market_outcome.index == order_against.market_outcome_index
            @ CoreError::MatchingMarketOutcomeMismatch,
    )]
    pub market_outcome: Box<Account<'info, MarketOutcome>>,

    // crank operator --------------------------------------------
    #[account(mut)]
    pub crank_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"CRANK".as_ref()], bump)]
    pub authorised_operators: Box<Account<'info, AuthorisedOperators>>,

    // token account --------------------------------------------
    #[account(mut, associated_token::mint = market.mint_account, associated_token::authority = order_for.purchaser)]
    pub purchaser_token_account_for: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = market.mint_account, associated_token::authority = order_against.purchaser)]
    pub purchaser_token_account_against: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Box<Account<'info, TokenAccount>>,
    #[account(
        has_one = market @ CoreError::CreationMarketMismatch,
    )]
    pub market_liquidities: Account<'info, MarketLiquidities>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,

    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleOrder<'info> {
    #[account(mut)]
    pub order: Account<'info, Order>,
    #[account(mut, address = order.payer @ CoreError::SettlementPayerMismatch)]
    pub payer: SystemAccount<'info>,
    #[account(mut, address = order.market @ CoreError::SettlementMarketMismatch)]
    pub market: Box<Account<'info, Market>>,
}

#[derive(Accounts)]
pub struct SettleMarketPosition<'info> {
    #[account(
        mut,
        associated_token::mint = market.mint_account,
        associated_token::authority = market_position.purchaser,
    )]
    pub purchaser_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = market_position.market @ CoreError::SettlementMarketMismatch)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"commission_payments".as_ref(), market.key().as_ref()],
        bump
    )]
    pub commission_payment_queue: Account<'info, MarketPaymentsQueue>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Account<'info, TokenAccount>,
    #[account(mut, seeds = [market_position.purchaser.as_ref(), market.key().as_ref()], bump)]
    pub market_position: Account<'info, MarketPosition>,

    #[account(seeds = [b"product".as_ref(), b"MONACO_PROTOCOL".as_ref()], seeds::program=&protocol_product::ID, bump)]
    pub protocol_config: Box<Account<'info, Product>>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct VoidMarketPosition<'info> {
    #[account(
        mut,
        associated_token::mint = market.mint_account,
        associated_token::authority = market_position.purchaser,
    )]
    pub purchaser_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = market_position.market @ CoreError::VoidMarketMismatch)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Account<'info, TokenAccount>,
    #[account(mut, seeds = [market_position.purchaser.key().as_ref(), market.key().as_ref()], bump)]
    pub market_position: Box<Account<'info, MarketPosition>>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct VoidOrder<'info> {
    #[account(mut)]
    pub order: Account<'info, Order>,
    #[account(mut, address = order.market @ CoreError::VoidMarketMismatch)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateMarketType<'info> {
    #[account(
        init,
        seeds = [
            b"market_type".as_ref(),
            name.as_ref(),
        ],
        bump,
        payer = authority,
        space = MarketType::size_for(name.len())
    )]
    pub market_type: Account<'info, MarketType>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

fn get_create_market_version(existing_market: &Option<Account<Market>>) -> u8 {
    if let Some(existing_market) = existing_market {
        existing_market.version + 1
    } else {
        0
    }
}

#[derive(Accounts)]
#[instruction(
    event_account: Pubkey,
    market_type_discriminator: Option<String>,
    market_type_value: Option<String>,
)]
pub struct CreateMarket<'info> {
    pub existing_market: Option<Account<'info, Market>>,

    #[account(
        init,
        seeds = [
            event_account.as_ref(),
            market_type.key().as_ref(),
            market_type_discriminator.as_ref().unwrap_or(&"".to_string()).as_ref(),
            SEED_SEPARATOR,
            market_type_value.as_ref().unwrap_or(&"".to_string()).as_ref(),
            SEED_SEPARATOR,
            get_create_market_version(&existing_market).to_string().as_ref(),
            mint.key().as_ref(),
        ],
        bump,
        payer = market_operator,
        space = Market::SIZE
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
        init,
        seeds = [
            b"escrow".as_ref(),
            market.key().as_ref(),
        ],
        bump,
        payer = market_operator,
        token::mint = mint,
        token::authority = escrow
    )]
    pub escrow: Account<'info, TokenAccount>,

    pub market_type: Box<Account<'info, MarketType>>,
    #[account(
        init,
        seeds = [
            b"funding".as_ref(),
            market.key().as_ref(),
        ],
        bump,
        payer = market_operator,
        token::mint = mint,
        token::authority = funding
    )]
    pub funding: Box<Account<'info, TokenAccount>>,

    pub rent: Sysvar<'info, Rent>,

    // #[soteria(ignore)] used to create `escrow`
    pub mint: Account<'info, Mint>,

    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,

    #[account(mut)]
    pub market_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"MARKET".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
#[instruction(_distinct_seed: String, max_number_of_prices: u16)]
pub struct CreatePriceLadder<'info> {
    #[account(
        init,
        seeds = [
            b"price_ladder".as_ref(),
            authority.key().as_ref(),
            _distinct_seed.as_ref()
        ],
        bump,
        payer = authority,
        space = PriceLadder::size_for(max_number_of_prices)
    )]
    pub price_ladder: Account<'info, PriceLadder>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePriceLadder<'info> {
    #[account(mut, has_one = authority)]
    pub price_ladder: Account<'info, PriceLadder>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(max_number_of_prices: u16)]
pub struct UpdatePriceLadderSize<'info> {
    #[account(
        mut,
        has_one = authority,
        realloc = PriceLadder::size_for(max_number_of_prices),
        realloc::zero = false,
        realloc::payer = authority
    )]
    pub price_ladder: Account<'info, PriceLadder>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePriceLadder<'info> {
    #[account(mut, has_one = authority, close = authority)]
    pub price_ladder: Account<'info, PriceLadder>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeMarketOutcome<'info> {
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,

    #[account(
        init,
        seeds = [
            market.key().as_ref(),
            market.market_outcomes_count.to_string().as_ref(),
        ],
        bump,
        payer = market_operator,
        space =  MarketOutcome::SIZE
    )]
    pub outcome: Account<'info, MarketOutcome>,

    pub price_ladder: Option<Account<'info, PriceLadder>>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub market_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"MARKET".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
#[instruction(_outcome_index: u16)]
pub struct UpdateMarketOutcome<'info> {
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,

    #[account(
        mut,
        seeds = [
            market.key().as_ref(),
            _outcome_index.to_string().as_ref(),
        ],
        bump,
    )]
    pub outcome: Account<'info, MarketOutcome>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub market_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"MARKET".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
pub struct UpdateMarket<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub market_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"MARKET".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
pub struct VoidMarket<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        has_one = market @ CoreError::VoidMarketMismatch,
    )]
    pub market_matching_queue: Option<Account<'info, MarketMatchingQueue>>,
    #[account(
        has_one = market @ CoreError::VoidMarketMismatch,
    )]
    pub order_request_queue: Option<Account<'info, MarketOrderRequestQueue>>,

    #[account(mut)]
    pub market_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"MARKET".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
pub struct OpenMarket<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(
        init,
        seeds = [
            b"liquidities".as_ref(),
            market.key().as_ref(),
        ],
        bump,
        payer = market_operator,
        space = MarketLiquidities::SIZE
    )]
    pub liquidities: Account<'info, MarketLiquidities>,
    #[account(
        init,
        seeds = [
            b"matching".as_ref(),
            market.key().as_ref(),
        ],
        bump,
        payer = market_operator,
        space = MarketMatchingQueue::SIZE
    )]
    pub matching_queue: Account<'info, MarketMatchingQueue>,
    #[account(
        init,
        seeds = [
            b"commission_payments".as_ref(),
            market.key().as_ref(),
        ],
        bump,
        payer = market_operator,
        space = MarketPaymentsQueue::SIZE
    )]
    pub commission_payment_queue: Account<'info, MarketPaymentsQueue>,
    #[account(
        init,
        seeds = [
            b"order_request".as_ref(),
            market.key().as_ref(),
        ],
        bump,
        payer = market_operator,
        space = MarketOrderRequestQueue::SIZE
    )]
    pub order_request_queue: Box<Account<'info, MarketOrderRequestQueue>>,

    #[account(mut)]
    pub market_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"MARKET".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        has_one = market @ CoreError::SettlementMarketMismatch,
    )]
    pub market_matching_queue: Account<'info, MarketMatchingQueue>,
    #[account(
        has_one = market @ CoreError::SettlementMarketMismatch,
    )]
    pub order_request_queue: Account<'info, MarketOrderRequestQueue>,

    #[account(mut)]
    pub market_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"MARKET".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
pub struct MoveMarketToInplay<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market)]
    pub market_liquidities: Account<'info, MarketLiquidities>,
}

#[derive(Accounts)]
pub struct SetMarketReadyToClose<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Account<'info, TokenAccount>,
    #[account(
        token::mint = market.mint_account,
        token::authority = market_funding,
        seeds = [b"funding".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_funding: Account<'info, TokenAccount>,

    #[account(mut)]
    pub market_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"MARKET".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
pub struct CompleteMarketSettlement<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(has_one = market @ CoreError::SettlementMarketMismatch)]
    pub commission_payments_queue: Account<'info, MarketPaymentsQueue>,
}

#[derive(Accounts)]
pub struct CompleteMarketVoid<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct TransferMarketTokenSurplus<'info> {
    #[account()]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_funding,
        seeds = [b"funding".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_funding: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = market.mint_account,
        associated_token::authority = market.authority,
    )]
    pub market_authority_token: Account<'info, TokenAccount>,

    pub market_operator: Signer<'info>,

    #[account(seeds = [b"authorised_operators".as_ref(), b"MARKET".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ProcessMarketCommissionPayment<'info> {
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = commission_escrow,
    )]
    pub product_escrow_token: Account<'info, TokenAccount>,
    /// CHECK: no data read from / written to, key used for token authority validation. Using
    /// AccountInfo as owner can be PDA of any account type
    pub commission_escrow: AccountInfo<'info>,
    #[account(has_one = commission_escrow @ CoreError::SettlementPaymentEscrowProductMismatch)]
    pub product: Account<'info, Product>,

    pub market: Account<'info, Market>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"commission_payments".as_ref(), market.key().as_ref()],
        bump
    )]
    pub commission_payments_queue: Account<'info, MarketPaymentsQueue>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

/*
Close accounts
 */

#[derive(Accounts)]
pub struct CloseOrder<'info> {
    #[account(
        mut,
        has_one = payer @ CoreError::CloseAccountPayerMismatch,
        has_one = market @ CoreError::CloseAccountMarketMismatch,
        close = payer,
    )]
    pub order: Account<'info, Order>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub payer: SystemAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseTrade<'info> {
    #[account(
        mut,
        has_one = payer @ CoreError::CloseAccountPayerMismatch,
        has_one = market @ CoreError::CloseAccountMarketMismatch,
        close = payer,
    )]
    pub trade: Account<'info, Trade>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub payer: SystemAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseMarketPosition<'info> {
    #[account(
        mut,
        has_one = payer @ CoreError::CloseAccountPayerMismatch,
        has_one = market @ CoreError::CloseAccountMarketMismatch,
        close = payer,
    )]
    pub market_position: Account<'info, MarketPosition>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub payer: SystemAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseMarketMatchingPool<'info> {
    #[account(
        mut,
        has_one = payer @ CoreError::CloseAccountPayerMismatch,
        has_one = market @ CoreError::CloseAccountMarketMismatch,
        close = payer,
    )]
    pub market_matching_pool: Account<'info, MarketMatchingPool>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub payer: SystemAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseMarketOutcome<'info> {
    #[account(
        mut,
        has_one = market @ CoreError::CloseAccountMarketMismatch,
        close = authority,
    )]
    pub market_outcome: Account<'info, MarketOutcome>,
    #[account(
        mut,
        has_one = authority @ CoreError::CloseAccountMarketAuthorityMismatch,
    )]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub authority: SystemAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseMarketQueues<'info> {
    #[account(
        mut,
        has_one = market @ CoreError::CloseAccountMarketMismatch,
        close = authority,
    )]
    pub liquidities: Account<'info, MarketLiquidities>,
    #[account(
        mut,
        has_one = market @ CoreError::CloseAccountMarketMismatch,
        close = authority,
    )]
    pub matching_queue: Account<'info, MarketMatchingQueue>,
    #[account(
        mut,
        has_one = market @ CoreError::CloseAccountMarketMismatch,
        close = authority,
    )]
    pub commission_payment_queue: Account<'info, MarketPaymentsQueue>,
    #[account(
        mut,
        has_one = market @ CoreError::CloseAccountMarketMismatch,
        close = authority,
    )]
    pub order_request_queue: Account<'info, MarketOrderRequestQueue>,
    #[account(
        mut,
        has_one = authority @ CoreError::CloseAccountMarketAuthorityMismatch,
    )]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub authority: SystemAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseMarket<'info> {
    #[account(
        mut,
        has_one = authority @ CoreError::CloseAccountMarketAuthorityMismatch,
        close = authority,
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_funding,
        seeds = [b"funding".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_funding: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: SystemAccount<'info>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}
