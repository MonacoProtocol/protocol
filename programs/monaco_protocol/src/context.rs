use crate::error::CoreError;
use crate::state::multisig::MultisigTransaction;
use crate::{
    AuthorisedOperators, Market, MarketMatchingPool, MarketOutcome, MarketPosition, MultisigGroup,
    Order, OrderData, ProductConfig, Trade,
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;
use anchor_spl::token::{Mint, Token, TokenAccount};
use solana_program::rent::Rent;

#[derive(Accounts)]
#[instruction(_distinct_seed: String, data: OrderData)]
pub struct CreateOrder<'info> {
    #[account(
        init,
        seeds = [
            market.key().as_ref(),
            purchaser.key().as_ref(),
            _distinct_seed.as_ref()
        ],
        bump,
        payer = purchaser,
        space = Order::SIZE,
    )]
    pub order: Account<'info, Order>,
    #[account(
        init_if_needed,
        seeds = [
            purchaser.key().as_ref(),
            market.key().as_ref()
        ],
        bump,
        payer = purchaser,
        space = MarketPosition::size_for(usize::from(market.market_outcomes_count))
    )]
    pub market_position: Box<Account<'info, MarketPosition>>,
    #[account(mut)]
    pub purchaser: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = market.mint_account,
        associated_token::authority = purchaser,
    )]
    pub purchaser_token: Account<'info, TokenAccount>,

    pub market: Box<Account<'info, Market>>,
    #[account(
        init_if_needed,
        seeds = [
            market.key().as_ref(),
            market_outcome.index.to_string().as_ref(),
            b"-".as_ref(),
            format!("{:.3}", data.price).as_ref(),
            data.for_outcome.to_string().as_ref()
        ],
        payer = purchaser,
        bump,
        space = MarketMatchingPool::SIZE
    )]
    pub market_matching_pool: Box<Account<'info, MarketMatchingPool>>,
    #[account(
        mut,
        seeds = [
            market.key().as_ref(),
            data.market_outcome_index.to_string().as_ref(),
        ],
        bump,
    )]
    pub market_outcome: Account<'info, MarketOutcome>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Box<Account<'info, TokenAccount>>,

    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
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

    #[account(mut, address = order.market @ CoreError::CancelationMarketMismatch)]
    pub market: Account<'info, Market>,
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

#[derive(Accounts)]
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
            order_for.key().as_ref(),
            false.to_string().as_ref(),
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
    pub market_matching_pool_against: Account<'info, MarketMatchingPool>,

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
            order_against.key().as_ref(),
            order_for.key().as_ref(),
            true.to_string().as_ref(),
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
    pub market_matching_pool_for: Account<'info, MarketMatchingPool>,

    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        seeds = [
            market.key().as_ref(),
            order_for.market_outcome_index.to_string().as_ref(),
        ],
        bump,
        constraint = order_against.market_outcome_index == order_for.market_outcome_index @ CoreError::MatchingMarketOutcomeMismatch,
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

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,

    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleOrder<'info> {
    #[account(mut)]
    pub order: Account<'info, Order>,
    #[account(mut, address = order.purchaser @ CoreError::SettlementPurchaserMismatch)]
    pub purchaser: SystemAccount<'info>,
    #[account(
        mut,
        associated_token::mint = market.mint_account,
        associated_token::authority = purchaser,
    )]
    pub purchaser_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = order.market @ CoreError::SettlementMarketMismatch)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        token::mint = market.mint_account,
        token::authority = market_escrow,
        seeds = [b"escrow".as_ref(), market.key().as_ref()],
        bump,
    )]
    pub market_escrow: Account<'info, TokenAccount>,
    #[account(mut, seeds = [purchaser.key().as_ref(), market.key().as_ref()], bump)]
    pub market_position: Box<Account<'info, MarketPosition>>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,

    // crank operator --------------------------------------------
    #[account(mut)]
    pub crank_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"CRANK".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
#[instruction(event_account: Pubkey, market_type: String)]
pub struct CreateMarket<'info> {
    #[account(
        init,
        seeds = [
            event_account.as_ref(),
            market_type.as_ref(),
            mint.key().as_ref(),
        ],
        bump,
        payer = market_operator,
        space = Market::SIZE
    )]
    pub market: Account<'info, Market>,
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
        constraint = _outcome_index < market.market_outcomes_count
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
pub struct CompleteMarketSettlement<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub crank_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"CRANK".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
pub struct CloseAccount<'info> {
    #[account(mut)]
    pub admin_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"ADMIN".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
    /// CHECK:
    #[account(mut)]
    // #[soteria(ignore)] no reasonable way to verify
    pub to_close: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    // #[soteria(ignore)] no reasonable way to verify
    pub lamport_destination: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(group_title: String)]
pub struct CreateMultisigGroup<'info> {
    #[account(
        init,
        seeds = [b"multisig".as_ref(), group_title.as_ref()],
        bump,
        payer = signer,
        space = MultisigGroup::SIZE
    )]
    pub multisig_group: Account<'info, MultisigGroup>,
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(_distinct_seed: String)]
pub struct CreateMultisigTransaction<'info> {
    pub multisig_group: Account<'info, MultisigGroup>,
    #[account(
        init,
        seeds = [_distinct_seed.as_ref()],
        bump,
        payer = multisig_member,
        space = MultisigTransaction::SIZE
    )]
    pub multisig_transaction: Account<'info, MultisigTransaction>,
    #[account(mut)]
    pub multisig_member: Signer<'info>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AuthoriseMultisigInstruction<'info> {
    #[account(mut)]
    pub multisig_group: Account<'info, MultisigGroup>,
    #[account(
        seeds = [multisig_group.key().as_ref()],
        bump
    )]
    pub multisig_pda_signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ApproveMultisigTransaction<'info> {
    #[account(
        constraint = multisig_group.members_version == multisig_transaction.members_version
            @ CoreError::MultisigMembersChanged
    )]
    pub multisig_group: Account<'info, MultisigGroup>,
    #[account(mut, has_one = multisig_group)]
    pub multisig_transaction: Account<'info, MultisigTransaction>,
    pub multisig_member: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteMultisigTransaction<'info> {
    #[account(
        constraint = multisig_group.members_version == multisig_transaction.members_version
            @ CoreError::MultisigMembersChanged
    )]
    pub multisig_group: Account<'info, MultisigGroup>,
    #[account(mut, has_one = multisig_group)]
    pub multisig_transaction: Box<Account<'info, MultisigTransaction>>,
    /// CHECK: multisig_pda_signer is never read/written it is purely used as a pda signer
    /// It cannot be of Signer type, as the signing is done within the program. If the seeds are
    /// wrong, the tx will fail.
    #[account(
        seeds = [multisig_group.key().as_ref()],
        bump,
    )]
    pub multisig_pda_signer: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(product_title: String)]
pub struct CreateProductConfig<'info> {
    #[account(
        init,
        seeds = [b"product_config".as_ref(), product_title.as_ref()],
        bump,
        payer = product_operator,
        space = ProductConfig::SIZE
    )]
    pub product_config: Account<'info, ProductConfig>,
    pub commission_escrow: SystemAccount<'info>,

    pub multisig_group: Account<'info, MultisigGroup>,
    #[account(mut)]
    pub product_operator: Signer<'info>,

    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProductConfigMultisigAuth<'info> {
    #[account(mut, has_one = multisig_group)]
    pub product_config: Account<'info, ProductConfig>,
    pub multisig_group: Account<'info, MultisigGroup>,
    #[account(
        seeds = [multisig_group.key().as_ref()],
        bump
    )]
    pub multisig_pda_signer: Signer<'info>,
}

/*
Close accounts
 */

#[derive(Accounts)]
pub struct CloseOrder<'info> {
    #[account(
        mut,
        has_one = purchaser @ CoreError::CloseAccountPurchaserMismatch,
        has_one = market @ CoreError::CloseAccountMarketMismatch,
        close = purchaser,
    )]
    pub order: Account<'info, Order>,
    #[account()]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub purchaser: SystemAccount<'info>,

    #[account(mut)]
    pub crank_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"CRANK".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
pub struct CloseTrade<'info> {
    #[account(
        mut,
        has_one = payer @ CoreError::CloseAccountPurchaserMismatch,
        has_one = market @ CoreError::CloseAccountMarketMismatch,
        close = payer,
    )]
    pub trade: Account<'info, Trade>,
    #[account()]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub payer: SystemAccount<'info>,

    #[account(mut)]
    pub crank_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"CRANK".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
pub struct CloseMarketPosition<'info> {
    #[account(
        mut,
        has_one = purchaser @ CoreError::CloseAccountPurchaserMismatch,
        has_one = market @ CoreError::CloseAccountMarketMismatch,
        close = purchaser,
    )]
    pub market_position: Account<'info, MarketPosition>,
    #[account()]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub purchaser: SystemAccount<'info>,

    #[account(mut)]
    pub crank_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"CRANK".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
#[instruction(_price: f64, _for_outcome: bool)]
pub struct CloseMarketMatchingPool<'info> {
    #[account()]
    pub market: Account<'info, Market>,
    #[account(has_one = market @ CoreError::CloseAccountMarketMismatch)]
    pub market_outcome: Account<'info, MarketOutcome>,
    #[account(mut)]
    pub purchaser: SystemAccount<'info>,

    // accounts being closed --------------------------------------------
    #[account(
        mut,
        seeds = [
            market.key().as_ref(),
            market_outcome.index.to_string().as_ref(),
            b"-".as_ref(),
            format!("{_price:.3}").as_ref(),
            _for_outcome.to_string().as_ref(),
        ],
        bump,
        has_one = purchaser @ CoreError::CloseAccountPurchaserMismatch,
        close = purchaser,
    )]
    pub market_matching_pool: Account<'info, MarketMatchingPool>,

    #[account(mut)]
    pub crank_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"CRANK".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
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
        has_one = authority @ CoreError::CloseAccountPurchaserMismatch,
    )]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub authority: SystemAccount<'info>,

    #[account(mut)]
    pub crank_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"CRANK".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}

#[derive(Accounts)]
pub struct CloseMarket<'info> {
    #[account(
        mut,
        has_one = authority @ CoreError::CloseAccountPurchaserMismatch,
        close = authority,
    )]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub authority: SystemAccount<'info>,

    #[account(mut)]
    pub crank_operator: Signer<'info>,
    #[account(seeds = [b"authorised_operators".as_ref(), b"CRANK".as_ref()], bump)]
    pub authorised_operators: Account<'info, AuthorisedOperators>,
}
