use crate::state::type_size::*;
use anchor_lang::prelude::*;
use std::string::ToString;

#[account]
pub struct MarketOrderRequestQueue {
    pub market: Pubkey,
    pub order_requests: OrderRequestQueue,
}

impl MarketOrderRequestQueue {
    pub const QUEUE_LENGTH: u32 = 50;

    pub const SIZE: usize = DISCRIMINATOR_SIZE +
        PUB_KEY_SIZE + // market
        OrderRequestQueue::size_for(MarketOrderRequestQueue::QUEUE_LENGTH); // order requests
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default)]
pub struct OrderRequest {
    pub purchaser: Pubkey, // wallet of user/intializer/ordertor who purchased the order
    pub market_outcome_index: u16, // market outcome on which order was made
    pub for_outcome: bool, // is order for or against the outcome
    pub product: Option<Pubkey>, // product this order was placed on
    pub stake: u64,        // total stake amount provided by purchaser
    pub expected_price: f64, // expected price provided by purchaser
    pub delay_expiration_timestamp: i64,
    pub product_commission_rate: f64, // product commission rate at time of order creation
    pub distinct_seed: [u8; 16],      // used as a seed for generating a unique order pda
    pub creation_timestamp: i64,      // timestamp when request was created
    pub expires_on: Option<i64>,      // timestamp when request is supposed to expire if set
}

impl OrderRequest {
    pub const SIZE: usize = PUB_KEY_SIZE
    + U16_SIZE // market_outcome_index
    + BOOL_SIZE // for outcome
    + option_size(PUB_KEY_SIZE) // product
    + U64_SIZE // stake
    + (F64_SIZE * 2) // expected_price & product_commission_rate
    + I64_SIZE // delay_expiration_timestamp
    + U128_SIZE // distinct_seed
    + I64_SIZE // creation_timestamp
    + option_size(I64_SIZE); // expire_on

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
            distinct_seed: [0; 16],
            creation_timestamp: 0,
            expires_on: None,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, PartialEq)]
pub struct OrderRequestData {
    pub market_outcome_index: u16,
    pub for_outcome: bool,
    pub stake: u64,
    pub price: f64,
    pub distinct_seed: [u8; 16],
    pub expires_on: Option<i64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct OrderRequestQueue {
    empty: bool,
    front: u32,
    len: u32,
    capacity: u32,
    items: Vec<OrderRequest>,
}

impl OrderRequestQueue {
    pub const fn size_for(length: u32) -> usize {
        BOOL_SIZE + // empty
        (U32_SIZE  * 3) + // front, len & capacity
        vec_size(OrderRequest::SIZE, length as usize) // items
    }

    pub fn new(capacity: u32) -> OrderRequestQueue {
        OrderRequestQueue {
            empty: true,
            front: 0,
            len: 0,
            capacity,
            items: Vec::with_capacity(capacity as usize),
        }
    }

    /*
    How many items are in the queue
     */
    pub fn len(&self) -> u32 {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /*
    Capacity of the queue
     */
    pub fn capacity(&self) -> u32 {
        self.capacity
    }

    pub fn peek(&self, index: u32) -> Option<&OrderRequest> {
        if index >= self.len {
            None
        } else {
            let capacity = self.capacity();
            Some(&self.items[((self.front + index) % capacity) as usize])
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
        // #[soteria(ignore)] 0 <= front < capacity() AND 0 <= len < capacity() AND capacity() == QUEUE_LENGTH << u32::MAX
        (self.front + self.len) % self.capacity()
    }

    pub fn enqueue(&mut self, item: OrderRequest) -> Option<u32> {
        if self.len == self.capacity() {
            None
        } else {
            let old_back = self.back();
            // #[soteria(ignore)] no overflows due to "if" check
            self.len += 1;
            if self.items.len() < self.capacity() as usize {
                self.items.push(item);
            } else {
                self.items[old_back as usize] = item;
            }
            self.empty = self.is_empty();
            Some(old_back)
        }
    }

    pub fn dequeue(&mut self) -> Option<&mut OrderRequest> {
        if self.len == 0 {
            None
        } else {
            let old_front = self.front;
            self.front = (old_front + 1) % self.capacity();
            // #[soteria(ignore)] no underflows due to "if" check
            self.len -= 1;
            self.empty = self.is_empty();
            Some(&mut self.items[old_front as usize])
        }
    }

    pub fn contains(&self, item: &OrderRequest) -> bool {
        for i in 0..self.len {
            let index = ((self.front + i) as usize) % self.items.len();
            if &self.items[index] == item {
                return true;
            }
        }
        false
    }
}

impl PartialEq for OrderRequest {
    fn eq(&self, other: &Self) -> bool {
        self.distinct_seed == other.distinct_seed && self.purchaser == other.purchaser
    }
}

impl Eq for OrderRequest {}

#[cfg(test)]
pub fn mock_order_request_queue(market_pk: Pubkey) -> MarketOrderRequestQueue {
    MarketOrderRequestQueue {
        market: market_pk,
        order_requests: OrderRequestQueue::new(1),
    }
}

#[cfg(test)]
pub fn mock_order_request(
    purchaser: Pubkey,
    for_outcome: bool,
    outcome: u16,
    stake: u64,
    price: f64,
) -> OrderRequest {
    OrderRequest {
        purchaser,
        market_outcome_index: outcome,
        for_outcome,
        stake,
        expected_price: price,
        product: None,
        product_commission_rate: 0.0,
        delay_expiration_timestamp: 0,
        distinct_seed: [0; 16],
        creation_timestamp: 0,
        expires_on: None,
    }
}

#[cfg(test)]
mod tests {
    use crate::state::market_order_request_queue::{OrderRequest, OrderRequestQueue};
    use solana_program::pubkey::Pubkey;

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

    #[test]
    fn test_contains_success() {
        let mut queue = OrderRequestQueue::new(3);
        let item = OrderRequest::new_unique();
        let item2 = OrderRequest::new_unique();
        queue.enqueue(item);
        queue.enqueue(item2);

        assert!(queue.contains(&item));
        assert!(queue.contains(&item2));
    }

    #[test]
    fn test_contains_dequeued_items_not_contained() {
        let mut queue = OrderRequestQueue::new(3);
        let item = OrderRequest::new_unique();
        let item2 = OrderRequest::new_unique();
        queue.enqueue(item);
        queue.enqueue(item2);

        queue.dequeue();

        assert!(!queue.contains(&item));
        assert!(queue.contains(&item2));

        queue.dequeue();

        assert!(!queue.contains(&item));
        assert!(!queue.contains(&item2));
    }

    #[test]
    fn test_contains_success_circular_queue_back_before_front() {
        let mut queue = OrderRequestQueue::new(3);
        let item = OrderRequest::new_unique();
        let item2 = OrderRequest::new_unique();
        let item3 = OrderRequest::new_unique();
        queue.enqueue(item);
        queue.enqueue(item2);
        queue.enqueue(item3);

        queue.dequeue();

        let item4 = OrderRequest::new_unique();
        queue.enqueue(item4);

        assert!(!queue.contains(&item));
        assert!(queue.contains(&item2));
        assert!(queue.contains(&item3));
        assert!(queue.contains(&item4));
    }

    #[test]
    fn test_order_request_eq() {
        // order requests should be considered equal if purchaser and distinct_seed are equal
        let purchaser = Pubkey::new_unique();

        let request_1 = OrderRequest {
            purchaser,
            distinct_seed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0, 0, 0, 0, 0],

            market_outcome_index: 0,
            for_outcome: false,

            delay_expiration_timestamp: 0,
            stake: 0,
            product: None,
            expected_price: 0.0,
            product_commission_rate: 0.0,
            creation_timestamp: 0,
            expires_on: None,
        };

        let request_2 = OrderRequest {
            purchaser,
            distinct_seed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0, 0, 0, 0, 0],

            market_outcome_index: 1,
            for_outcome: true,

            delay_expiration_timestamp: 0,
            stake: 0,
            product: None,
            expected_price: 0.0,
            product_commission_rate: 0.0,
            creation_timestamp: 0,
            expires_on: None,
        };
        assert_eq!(request_1, request_2);

        let request_3 = OrderRequest {
            purchaser,
            distinct_seed: [0, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0, 0, 0, 0, 0],

            market_outcome_index: 0,
            for_outcome: false,

            delay_expiration_timestamp: 0,
            stake: 0,
            product: None,
            expected_price: 0.0,
            product_commission_rate: 0.0,
            creation_timestamp: 0,
            expires_on: None,
        };
        assert_ne!(request_1, request_3);
    }
}
