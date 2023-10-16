use crate::state::type_size::*;
use anchor_lang::prelude::*;
use std::string::ToString;

#[account]
pub struct MarketOrderRequestQueue {
    pub market: Pubkey,
    pub order_requests: OrderRequestQueue,
}

impl MarketOrderRequestQueue {
    pub const QUEUE_LENGTH: u32 = 30;

    pub const SIZE: usize = DISCRIMINATOR_SIZE +
        PUB_KEY_SIZE + // market
        OrderRequestQueue::size_for(MarketOrderRequestQueue::QUEUE_LENGTH); // order requests
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq)]
pub struct OrderRequest {
    pub purchaser: Pubkey, // wallet of user/intializer/ordertor who purchased the order
    pub market_outcome_index: u16, // market outcome on which order was made
    pub for_outcome: bool, // is order for or against the outcome
    pub product: Option<Pubkey>, // product this order was placed on
    pub stake: u64,        // total stake amount provided by purchaser
    pub expected_price: f64, // expected price provided by purchaser
    pub delay_expiration_timestamp: i64,
    pub product_commission_rate: f64, // product commission rate at time of order creation
}

impl OrderRequest {
    pub const SIZE: usize = PUB_KEY_SIZE
    + U16_SIZE // market_outcome_index
    + BOOL_SIZE // for outcome
    + option_size(PUB_KEY_SIZE) // product
    + U64_SIZE // stake
    + (F64_SIZE * 2) // expected_price & product_commission_rate
    + I64_SIZE; // delay_expiration_timestamp

    pub fn new_unique() -> Self {
        OrderRequest {
            purchaser: Pubkey::new_unique(),
            market_outcome_index: 0,
            for_outcome: false,
            delay_expiration_timestamp: 0,
            stake: 0,
            product: None,
            expected_price: 0.0,
            product_commission_rate: 0.0,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, PartialEq)]
pub struct OrderRequestData {
    pub market_outcome_index: u16,
    pub for_outcome: bool,
    pub stake: u64,
    pub price: f64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct OrderRequestQueue {
    front: u32,
    len: u32,
    items: Vec<OrderRequest>,
}

impl OrderRequestQueue {
    pub const fn size_for(length: u32) -> usize {
        (U32_SIZE  * 2) + // front and len
        vec_size(OrderRequest::SIZE, length as usize) // items
    }

    pub fn new(size: u32) -> OrderRequestQueue {
        OrderRequestQueue {
            front: 0,
            len: 0,
            items: vec![OrderRequest::default(); size as usize],
        }
    }

    /*
    How many items are in the queue
     */
    pub fn len(&self) -> u32 {
        self.len
    }

    /*
    Capacity of the queue
     */
    pub fn size(&self) -> u32 {
        self.items.len() as u32
    }

    pub fn peek(&self, index: u32) -> Option<&OrderRequest> {
        if index >= self.len {
            None
        } else {
            let size = self.size();
            Some(&self.items[((self.front + index) % size) as usize])
        }
    }

    pub fn peek_front(&self) -> Option<&OrderRequest> {
        if self.len == 0 {
            None
        } else {
            Some(&self.items[self.front as usize])
        }
    }

    fn back(&self) -> u32 {
        // #[soteria(ignore)] 0 <= front < size() AND 0 <= len < size() AND size() == QUEUE_LENGTH << u32::MAX
        (self.front + self.len) % self.size()
    }

    pub fn enqueue(&mut self, item: OrderRequest) -> Option<u32> {
        if self.len == self.size() {
            None
        } else {
            let old_back = self.back();
            // #[soteria(ignore)] no overflows due to "if" check
            self.len += 1;
            self.items[old_back as usize] = item;
            Some(old_back)
        }
    }

    pub fn dequeue(&mut self) -> Option<&mut OrderRequest> {
        if self.len == 0 {
            None
        } else {
            let old_front = self.front;
            self.front = (old_front + 1) % self.size();
            // #[soteria(ignore)] no underflows due to "if" check
            self.len -= 1;
            Some(&mut self.items[old_front as usize])
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::state::market_order_request_queue::{OrderRequest, OrderRequestQueue};

    //
    // Cirque tests
    //
    #[test]
    fn test_cirque_enqueue_size_1_success() {
        let mut queue = OrderRequestQueue::new(1);
        assert_eq!(0, queue.len());

        let result = queue.enqueue(OrderRequest::new_unique());
        assert!(result.is_some());
        assert_eq!(0, result.unwrap());
        assert_eq!(1, queue.len());
    }

    #[test]
    fn test_cirque_enqueue_size_n_success() {
        let mut queue = OrderRequestQueue::new(3);
        queue.enqueue(OrderRequest::new_unique());
        queue.enqueue(OrderRequest::new_unique());

        let result = queue.enqueue(OrderRequest::new_unique());
        assert!(result.is_some());
        assert_eq!(2, result.unwrap());
        assert_eq!(3, queue.len());
    }

    #[test]
    fn test_cirque_dequeue_success() {
        let mut queue = OrderRequestQueue::new(1);
        let item = OrderRequest::new_unique();
        queue.enqueue(item);
        assert_eq!(1, queue.len());

        let result = queue.dequeue();
        assert!(result.is_some());
        assert_eq!(item, *result.unwrap());
        assert_eq!(0, queue.len());
    }

    #[test]
    fn test_cirque_dequeue_empty_queue() {
        let mut queue = OrderRequestQueue::new(1);
        assert_eq!(0, queue.len());

        let result = queue.dequeue();
        assert!(result.is_none());
        assert_eq!(0, queue.len());
    }

    #[test]
    fn test_cirque_dequeue_full_queue() {
        let mut queue = OrderRequestQueue::new(3);
        let expected = OrderRequest::new_unique();
        queue.enqueue(expected);
        queue.enqueue(OrderRequest::new_unique());
        queue.enqueue(OrderRequest::new_unique());
        assert_eq!(3, queue.len());

        let result = queue.dequeue();
        assert!(result.is_some());
        assert_eq!(expected, *result.unwrap());
    }

    #[test]
    fn test_cirque_enqueue_full_queue() {
        let mut queue = OrderRequestQueue::new(3);
        queue.enqueue(OrderRequest::new_unique());
        queue.enqueue(OrderRequest::new_unique());
        queue.enqueue(OrderRequest::new_unique());
        assert_eq!(3, queue.len());

        let result = queue.enqueue(OrderRequest::new_unique());
        assert!(result.is_none());
        assert_eq!(3, queue.len());
    }

    #[test]
    fn test_cirque_peek_success() {
        let mut queue = OrderRequestQueue::new(1);
        let item = OrderRequest::new_unique();
        queue.enqueue(item);
        assert_eq!(1, queue.len());

        let result = queue.peek(0);
        assert!(result.is_some());
        assert_eq!(item, *result.unwrap());
        assert_eq!(1, queue.len());
    }
}
