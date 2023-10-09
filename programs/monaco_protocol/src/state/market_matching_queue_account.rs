use crate::state::type_size::*;
use anchor_lang::prelude::*;

use std::string::ToString;

#[account]
pub struct MarketMatchingQueue {
    pub market: Pubkey,
    pub matches: MatchingQueue,
}

impl MarketMatchingQueue {
    pub const QUEUE_LENGTH: usize = 80;

    pub const SIZE: usize = DISCRIMINATOR_SIZE +
        PUB_KEY_SIZE + // market
        MatchingQueue::size_for(MarketMatchingQueue::QUEUE_LENGTH); //matches
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct MatchingQueue {
    front: u32,
    len: u32,
    items: Vec<OrderMatched>,
}

impl MatchingQueue {
    pub const fn size_for(length: usize) -> usize {
        (U32_SIZE  * 2) + // front and len
        vec_size(OrderMatched::SIZE, length) // items
    }

    pub fn new(size: usize) -> MatchingQueue {
        MatchingQueue {
            front: 0,
            len: 0,
            items: vec![OrderMatched::default(); size],
        }
    }

    pub fn len(&self) -> u32 {
        self.len
    }

    pub fn size(&self) -> u32 {
        self.items.len() as u32
    }

    fn back(&self) -> u32 {
        // #[soteria(ignore)] 0 <= front < size() AND 0 <= len < size() AND size() == QUEUE_LENGTH << u32::MAX
        (self.front + self.len) % self.size()
    }

    pub fn peek(&mut self) -> Option<&mut OrderMatched> {
        if self.len == 0 {
            None
        } else {
            Some(&mut self.items[self.front as usize])
        }
    }

    pub fn enqueue(&mut self, item: OrderMatched) -> Option<u32> {
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

    pub fn dequeue(&mut self) -> Option<&mut OrderMatched> {
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

    pub fn to_vec(&self) -> Vec<OrderMatched> {
        let mut clone = Vec::with_capacity(self.len() as usize);
        for i in 0..self.len() as usize {
            let index = (self.front as usize + i) % (self.size() as usize);
            clone.push(self.items[index]);
        }
        clone
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default)]
pub struct OrderMatched {
    pub pk: Pubkey,
    pub purchaser: Pubkey,

    pub for_outcome: bool,
    pub outcome_index: u16,
    pub price: f64,
    pub stake: u64,
}

impl OrderMatched {
    pub const SIZE: usize =
        BOOL_SIZE + U16_SIZE + F64_SIZE + U64_SIZE + PUB_KEY_SIZE + PUB_KEY_SIZE;
}

impl PartialEq for OrderMatched {
    fn eq(&self, other: &Self) -> bool {
        self.pk.eq(&other.pk)
    }
}

impl Eq for OrderMatched {}

#[cfg(test)]
mod tests_matching_queue {
    use super::*;

    #[test]
    fn enqueue_empty_queue() {
        let mut queue = MatchingQueue::new(10);
        assert_eq!(0, queue.len());

        let result = queue.enqueue(order_match());
        assert!(result.is_some());
        assert_eq!(0, result.unwrap());
        assert_eq!(1, queue.len());
    }

    #[test]
    fn enqueue_some_queue() {
        let mut queue = MatchingQueue::new(10);
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        assert_eq!(2, queue.len());

        let result = queue.enqueue(order_match());
        assert!(result.is_some());
        assert_eq!(2, result.unwrap());
        assert_eq!(3, queue.len());
    }

    #[test]
    fn enqueue_full_queue() {
        let mut queue = MatchingQueue::new(10);
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        assert_eq!(10, queue.len());

        let result = queue.enqueue(order_match());
        assert!(result.is_none());
        assert_eq!(10, queue.len());
    }

    #[test]
    fn dequeue_empty_queue() {
        let mut queue = MatchingQueue::new(10);
        assert_eq!(0, queue.len());

        let result = queue.dequeue();
        assert!(result.is_none());
        assert_eq!(0, queue.len());
    }

    #[test]
    fn dequeue_full_queue() {
        let mut queue = MatchingQueue::new(10);
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        assert_eq!(3, queue.len());

        let result = queue.dequeue();
        assert!(result.is_some());
    }

    #[test]
    fn peek_empty_queue() {
        let mut queue = MatchingQueue::new(10);
        assert_eq!(0, queue.len());

        let result = queue.peek();
        assert!(result.is_none());
        assert_eq!(0, queue.len());
    }

    #[test]
    fn peek_full_queue() {
        let mut queue = MatchingQueue::new(10);
        let item = order_match();
        queue.enqueue(item);
        assert_eq!(1, queue.len());

        let result = queue.peek();
        assert!(result.is_some());
        assert_eq!(item, *result.unwrap());
        assert_eq!(1, queue.len());
    }

    #[test]
    fn peek_edit_in_place() {
        let mut queue = MatchingQueue::new(10);
        queue.enqueue(order_match());
        queue.enqueue(order_match());
        assert_eq!(2, queue.len());

        let result0 = queue.peek().unwrap();
        result0.stake = 10;
        assert_eq!(10, queue.items[0].stake);
    }

    fn order_match() -> OrderMatched {
        OrderMatched {
            pk: Pubkey::new_unique(),
            purchaser: Pubkey::new_unique(),
            for_outcome: true,
            outcome_index: 0,
            price: 1.1,
            stake: 10,
        }
    }
}
