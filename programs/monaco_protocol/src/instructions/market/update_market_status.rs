use crate::context::UpdateMarket;
use crate::CompleteMarketSettlement;
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use solana_program::clock::UnixTimestamp;

use crate::error::CoreError;
use crate::state::market_account::Market;
use crate::state::market_account::MarketStatus::*;
use crate::state::market_matching_queue_account::{MarketMatchingQueue, MatchingQueue};
use crate::state::market_order_request_queue::{MarketOrderRequestQueue, OrderRequestQueue};
use crate::state::payments_queue::{MarketPaymentsQueue, PaymentQueue};

pub fn open(
    market_pk: &Pubkey,
    market: &mut Market,
    matching_queue: &mut MarketMatchingQueue,
    commission_payment_queue: &mut MarketPaymentsQueue,
    order_request_queue: &mut MarketOrderRequestQueue,
) -> Result<()> {
    require!(
        Initializing.eq(&market.market_status),
        CoreError::OpenMarketNotInitializing
    );
    require!(
        market.market_outcomes_count > 1,
        CoreError::OpenMarketNotEnoughOutcomes
    );

    intialize_matching_queue(matching_queue, market_pk)?;
    market.increment_unclosed_accounts_count()?;

    intialize_commission_payments_queue(commission_payment_queue, market_pk)?;
    market.increment_unclosed_accounts_count()?;

    intialize_order_request_queue(order_request_queue, market_pk)?;
    market.increment_unclosed_accounts_count()?;

    market.market_status = Open;
    Ok(())
}

fn intialize_matching_queue(
    matching_queue: &mut MarketMatchingQueue,
    market_pk: &Pubkey,
) -> Result<()> {
    matching_queue.market = *market_pk;
    matching_queue.matches = MatchingQueue::new(MarketMatchingQueue::QUEUE_LENGTH);
    Ok(())
}

fn intialize_commission_payments_queue(
    payments_queue: &mut MarketPaymentsQueue,
    market_pk: &Pubkey,
) -> Result<()> {
    payments_queue.market = *market_pk;
    payments_queue.payment_queue = PaymentQueue::new(MarketPaymentsQueue::QUEUE_LENGTH);
    Ok(())
}

fn intialize_order_request_queue(
    order_request_queue: &mut MarketOrderRequestQueue,
    market: &Pubkey,
) -> Result<()> {
    order_request_queue.market = *market;
    order_request_queue.order_requests =
        OrderRequestQueue::new(MarketOrderRequestQueue::QUEUE_LENGTH);
    Ok(())
}

pub fn void(
    market: &mut Market,
    void_time: UnixTimestamp,
    order_request_queue: &MarketOrderRequestQueue,
) -> Result<()> {
    require!(
        Initializing.eq(&market.market_status) || Open.eq(&market.market_status),
        CoreError::VoidMarketNotInitializingOrOpen
    );
    require!(
        order_request_queue.order_requests.len() == 0,
        CoreError::RequestQueueNotEmpty
    );

    market.market_settle_timestamp = Option::from(void_time);
    market.market_status = ReadyToVoid;
    Ok(())
}

pub fn complete_void(ctx: Context<CompleteMarketSettlement>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(
        ReadyToVoid.eq(&market.market_status),
        CoreError::VoidMarketNotReadyForVoid
    );
    require!(
        market.unsettled_accounts_count == 0_u32,
        CoreError::MarketUnsettledAccountsCountNonZero,
    );
    market.market_status = Voided;
    Ok(())
}

pub fn settle(
    market: &mut Market,
    winning_outcome_index: u16,
    settle_time: UnixTimestamp,
    order_request_queue: &MarketOrderRequestQueue,
) -> Result<()> {
    require!(
        Open.eq(&market.market_status),
        CoreError::SettlementMarketNotOpen
    );
    require!(
        winning_outcome_index < market.market_outcomes_count,
        CoreError::SettlementInvalidMarketOutcomeIndex
    );
    require!(
        order_request_queue.order_requests.len() == 0,
        CoreError::RequestQueueNotEmpty
    );

    market.market_winning_outcome_index = Some(winning_outcome_index);
    market.market_settle_timestamp = Option::from(settle_time);
    market.market_status = ReadyForSettlement;
    Ok(())
}

pub fn complete_settlement(ctx: Context<CompleteMarketSettlement>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(
        ReadyForSettlement.eq(&market.market_status),
        CoreError::SettlementMarketNotReadyForSettlement
    );
    require!(
        market.unsettled_accounts_count == 0_u32,
        CoreError::MarketUnsettledAccountsCountNonZero,
    );
    market.market_status = Settled;
    Ok(())
}

pub fn publish(ctx: Context<UpdateMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.published = true;
    Ok(())
}

pub fn unpublish(ctx: Context<UpdateMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.published = false;
    Ok(())
}

pub fn suspend(ctx: Context<UpdateMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.suspended = true;
    Ok(())
}

pub fn unsuspend(ctx: Context<UpdateMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.suspended = false;
    Ok(())
}

pub fn ready_to_close(market: &mut Market, market_escrow: &TokenAccount) -> Result<()> {
    require!(
        Settled.eq(&market.market_status) || Voided.eq(&market.market_status),
        CoreError::MarketNotSettledOrVoided
    );

    require!(
        market_escrow.amount == 0_u64,
        CoreError::SettlementMarketEscrowNonZero
    );

    market.market_status = ReadyToClose;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::error::CoreError;
    use crate::instructions::market::{open, settle, void};
    use crate::state::market_account::{MarketOrderBehaviour, MarketStatus};

    use crate::state::market_matching_queue_account::{MarketMatchingQueue, MatchingQueue};
    use crate::state::market_order_request_queue::{
        MarketOrderRequestQueue, OrderRequest, OrderRequestQueue,
    };
    use crate::state::payments_queue::{MarketPaymentsQueue, PaymentQueue};
    use crate::Market;
    use anchor_lang::error;
    use solana_program::pubkey::Pubkey;

    #[test]
    fn settle_market_ok_result() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Open,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 3,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
        };
        let order_request_queue = MarketOrderRequestQueue {
            market: Pubkey::new_unique(),
            order_requests: OrderRequestQueue::new(10),
        };

        let settle_time = 1665483869;

        let result = settle(&mut market, 0, settle_time, &order_request_queue);

        assert!(result.is_ok());
        assert_eq!(market.market_status, MarketStatus::ReadyForSettlement)
    }

    #[test]
    fn settle_market_not_open() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::ReadyToClose,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 3,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
        };
        let order_request_queue = MarketOrderRequestQueue {
            market: Pubkey::new_unique(),
            order_requests: OrderRequestQueue::new(10),
        };

        let settle_time = 1665483869;

        let result = settle(&mut market, 0, settle_time, &order_request_queue);

        assert!(result.is_err());
        assert_eq!(Err(error!(CoreError::SettlementMarketNotOpen)), result);
    }

    #[test]
    fn settle_market_invalid_outcome_index() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Open,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 3,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
        };
        let order_request_queue = MarketOrderRequestQueue {
            market: Pubkey::new_unique(),
            order_requests: OrderRequestQueue::new(10),
        };

        let settle_time = 1665483869;

        let result = settle(&mut market, 4, settle_time, &order_request_queue);

        assert!(result.is_err());
        assert_eq!(
            Err(error!(CoreError::SettlementInvalidMarketOutcomeIndex)),
            result
        );
    }

    #[test]
    fn settle_market_request_queue_not_empty() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Open,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 3,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
        };
        let order_request_queue = &mut MarketOrderRequestQueue {
            market: Pubkey::new_unique(),
            order_requests: OrderRequestQueue::new(10),
        };
        order_request_queue
            .order_requests
            .enqueue(OrderRequest::new_unique());

        let result = settle(&mut market, 0, 1665483869, &order_request_queue);

        assert!(result.is_err());
        assert_eq!(Err(error!(CoreError::RequestQueueNotEmpty)), result);
    }

    #[test]
    fn open_market_ok_result() {
        let market_pk = Pubkey::new_unique();
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Initializing,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 2,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
        };
        let matching_queue = &mut MarketMatchingQueue {
            market: Pubkey::default(),
            matches: MatchingQueue::new(1),
        };
        let payments_queue = &mut MarketPaymentsQueue {
            market: Pubkey::default(),
            payment_queue: PaymentQueue::new(1),
        };
        let order_request_queue = &mut MarketOrderRequestQueue {
            market: Pubkey::default(),
            order_requests: OrderRequestQueue::new(1),
        };

        let result = open(
            &market_pk,
            &mut market,
            matching_queue,
            payments_queue,
            order_request_queue,
        );

        assert!(result.is_ok());
        assert_eq!(MarketStatus::Open, market.market_status);

        assert_eq!(matching_queue.market, market_pk);
        assert_eq!(payments_queue.market, market_pk);
        assert_eq!(order_request_queue.market, market_pk);

        assert_eq!(
            matching_queue.matches.size(),
            MarketMatchingQueue::QUEUE_LENGTH as u32
        );
        assert_eq!(
            payments_queue.payment_queue.size(),
            MarketPaymentsQueue::QUEUE_LENGTH as u32
        );
        assert_eq!(
            order_request_queue.order_requests.size(),
            MarketOrderRequestQueue::QUEUE_LENGTH as u32
        );
    }

    #[test]
    fn open_market_not_intializing() {
        let market_pk = Pubkey::new_unique();
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Open,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 2,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
        };
        let matching_queue = &mut MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(1),
        };
        let payments_queue = &mut MarketPaymentsQueue {
            market: market_pk,
            payment_queue: PaymentQueue::new(1),
        };
        let order_request_queue = &mut MarketOrderRequestQueue {
            market: Pubkey::default(),
            order_requests: OrderRequestQueue::new(1),
        };

        let result = open(
            &market_pk,
            &mut market,
            matching_queue,
            payments_queue,
            order_request_queue,
        );

        assert!(result.is_err());
        let expected_error = Err(error!(CoreError::OpenMarketNotInitializing));
        assert_eq!(expected_error, result)
    }

    #[test]
    fn open_market_not_enough_outcomes() {
        let market_pk = Pubkey::new_unique();
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Initializing,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 1,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            event_start_timestamp: 0,
            inplay_enabled: false,
            inplay: false,
            inplay_order_delay: 0,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
        };
        let matching_queue = &mut MarketMatchingQueue {
            market: market_pk,
            matches: MatchingQueue::new(1),
        };
        let payments_queue = &mut MarketPaymentsQueue {
            market: market_pk,
            payment_queue: PaymentQueue::new(1),
        };
        let order_request_queue = &mut MarketOrderRequestQueue {
            market: Pubkey::default(),
            order_requests: OrderRequestQueue::new(1),
        };

        let result = open(
            &market_pk,
            &mut market,
            matching_queue,
            payments_queue,
            order_request_queue,
        );

        assert!(result.is_err());
        let expected_error = Err(error!(CoreError::OpenMarketNotEnoughOutcomes));
        assert_eq!(expected_error, result)
    }

    #[test]
    fn void_market_initializing_ok_result() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Initializing,
            inplay_enabled: false,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 0,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            inplay: false,
            inplay_order_delay: 0,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            event_start_timestamp: 0,
        };
        let order_request_queue = &mut MarketOrderRequestQueue {
            market: Pubkey::new_unique(),
            order_requests: OrderRequestQueue::new(10),
        };

        let settle_time = 1665483869;

        let result = void(&mut market, settle_time, &order_request_queue);

        assert!(result.is_ok());
        assert_eq!(MarketStatus::ReadyToVoid, market.market_status)
    }

    #[test]
    fn void_market_open_ok_result() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Open,
            inplay_enabled: false,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 0,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            inplay: false,
            inplay_order_delay: 0,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            event_start_timestamp: 0,
        };
        let order_request_queue = &mut MarketOrderRequestQueue {
            market: Pubkey::new_unique(),
            order_requests: OrderRequestQueue::new(10),
        };

        let settle_time = 1665483869;

        let result = void(&mut market, settle_time, &order_request_queue);

        assert!(result.is_ok());
        assert_eq!(MarketStatus::ReadyToVoid, market.market_status)
    }

    #[test]
    fn void_market_not_open_or_initializing() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Settled,
            inplay_enabled: false,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 0,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            inplay: false,
            inplay_order_delay: 0,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            event_start_timestamp: 0,
        };
        let order_request_queue = &mut MarketOrderRequestQueue {
            market: Pubkey::new_unique(),
            order_requests: OrderRequestQueue::new(10),
        };

        let settle_time = 1665483869;

        let result = void(&mut market, settle_time, &order_request_queue);

        assert!(result.is_err());
        let expected_error = Err(error!(CoreError::VoidMarketNotInitializingOrOpen));
        assert_eq!(expected_error, result)
    }

    #[test]
    fn void_market_request_queue_not_empty() {
        let mut market = Market {
            authority: Default::default(),
            event_account: Default::default(),
            mint_account: Default::default(),
            market_status: MarketStatus::Open,
            inplay_enabled: false,
            market_type: Default::default(),
            market_type_discriminator: None,
            market_type_value: None,
            version: 0,
            decimal_limit: 0,
            published: false,
            suspended: false,
            market_outcomes_count: 0,
            market_winning_outcome_index: None,
            market_lock_timestamp: 0,
            market_settle_timestamp: None,
            event_start_order_behaviour: MarketOrderBehaviour::None,
            market_lock_order_behaviour: MarketOrderBehaviour::None,
            inplay: false,
            inplay_order_delay: 0,
            title: "".to_string(),
            unsettled_accounts_count: 0,
            unclosed_accounts_count: 0,
            escrow_account_bump: 0,
            event_start_timestamp: 0,
        };
        let order_request_queue = &mut MarketOrderRequestQueue {
            market: Pubkey::new_unique(),
            order_requests: OrderRequestQueue::new(10),
        };
        order_request_queue
            .order_requests
            .enqueue(OrderRequest::new_unique());

        let settle_time = 1665483869;

        let result = void(&mut market, settle_time, &order_request_queue);

        assert!(result.is_err());
        let expected_error = Err(error!(CoreError::RequestQueueNotEmpty));
        assert_eq!(expected_error, result)
    }
}
