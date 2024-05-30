use crate::state::type_size::*;
use anchor_lang::prelude::*;

#[account]
pub struct ReservedOrder {}

impl ReservedOrder {
    pub const SIZE: usize = DISCRIMINATOR_SIZE;
}

#[account]
pub struct Order {
    pub purchaser: Pubkey, // wallet of user/intializer/ordertor who purchased the order
    pub market: Pubkey,    // market on which order was made
    pub market_outcome_index: u16, // market outcome on which order was made
    pub for_outcome: bool, // is order for or against the outcome
    pub order_status: OrderStatus, // status
    pub product: Option<Pubkey>, // product this order was placed on
    pub stake: u64,        // total stake amount provided by purchaser
    pub voided_stake: u64, // stake amount returned to purchaser due to cancelation or settlement for partially matched orders
    pub expected_price: f64, // expected price provided by purchaser
    pub creation_timestamp: i64,
    // matching data
    pub stake_unmatched: u64,         // stake amount available for matching
    pub payout: u64, // amount paid to purchaser during settlement for winning orders
    pub payer: Pubkey, // solana account fee payer
    pub product_commission_rate: f64, // product commission rate at time of order creation
}

impl Order {
    pub const SIZE: usize = DISCRIMINATOR_SIZE
        + (PUB_KEY_SIZE * 2) // purchaser, market
        + option_size(PUB_KEY_SIZE) // product
        + U16_SIZE // market_outcome_index
        + BOOL_SIZE // for outcome
        + ENUM_SIZE // order_status
        + (U64_SIZE * 4) // stake, payout, stake_unmatched, voided_stake
        + (F64_SIZE  * 2)// expected_price & product_commission_rate
        + I64_SIZE // creation_timestamp
        + PUB_KEY_SIZE; // payer

    pub fn is_completed(&self) -> bool {
        self.order_status == OrderStatus::SettledWin
            || self.order_status == OrderStatus::SettledLose
            || self.order_status == OrderStatus::Cancelled
            || self.order_status == OrderStatus::Voided
    }

    pub fn void_stake_unmatched(&mut self) {
        self.voided_stake = self.stake_unmatched;
        self.stake_unmatched = 0_u64;
        if self.order_status == OrderStatus::Open {
            self.order_status = OrderStatus::Cancelled;
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, PartialEq, Eq)]
pub enum OrderStatus {
    Open,        // waiting on liquidity to match
    Matched,     // liquidity available, order has been match
    SettledWin,  // order won and has been paid out
    SettledLose, // order lost, nothing to pay out
    Cancelled,   // order cancelled
    Voided,      // order voided
}

#[cfg(test)]
use crate::state::market_order_request_queue::OrderRequest;

#[cfg(test)]
pub fn mock_order_default() -> Order {
    mock_order(Pubkey::new_unique(), 0, true, 0.0, 0, Pubkey::new_unique())
}

#[cfg(test)]
pub fn mock_order_from_order_request(
    market: Pubkey,
    order_request: OrderRequest,
    payer: Pubkey,
) -> Order {
    Order {
        market,
        purchaser: order_request.purchaser,
        market_outcome_index: order_request.market_outcome_index,
        for_outcome: order_request.for_outcome,
        stake: order_request.stake,
        expected_price: order_request.expected_price,
        stake_unmatched: order_request.stake,
        voided_stake: 0_u64,
        payout: 0_u64,
        order_status: OrderStatus::Open,
        product: order_request.product,
        product_commission_rate: order_request.product_commission_rate,
        creation_timestamp: 0,
        payer,
    }
}

#[cfg(test)]
pub fn mock_order(
    market: Pubkey,
    market_outcome_index: u16,
    for_outcome: bool,
    expected_price: f64,
    stake: u64,
    payer: Pubkey,
) -> Order {
    Order {
        purchaser: Pubkey::new_unique(),
        market,
        market_outcome_index,
        for_outcome,
        order_status: OrderStatus::Open,
        product: None,
        product_commission_rate: 0.0,
        stake,
        voided_stake: 0,
        expected_price,
        creation_timestamp: 0,
        stake_unmatched: stake,
        payout: 0,
        payer,
    }
}
