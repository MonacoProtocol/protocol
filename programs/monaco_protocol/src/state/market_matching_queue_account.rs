use crate::state::type_size::*;
use anchor_lang::prelude::*;

use std::string::ToString;

#[account]
pub struct MarketMatchingQueue {
    pub market: Pubkey,
    pub matches: MatchingQueue,
}

impl MarketMatchingQueue {
    pub const QUEUE_LENGTH: usize = 20;

    pub const SIZE: usize = DISCRIMINATOR_SIZE +
        PUB_KEY_SIZE + // market
        MatchingQueue::size_for(MarketMatchingQueue::QUEUE_LENGTH); //matches
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct MatchingQueue {
    empty: bool,
    front: u32,
    len: u32,
    items: Vec<OrderMatch>,
}

impl MatchingQueue {
    pub const fn size_for(length: usize) -> usize {
        BOOL_SIZE + // empty
        (U32_SIZE  * 2) + // front and len
        vec_size(OrderMatch::SIZE, length) // items
    }

    pub fn new(size: usize) -> MatchingQueue {
        MatchingQueue {
            empty: true,
            front: 0,
            len: 0,
            items: vec![OrderMatch::default(); size],
        }
    }

    pub fn len(&self) -> u32 {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn size(&self) -> u32 {
        self.items.len() as u32
    }

    fn back(&self) -> u32 {
        // #[soteria(ignore)] 0 <= front < size() AND 0 <= len < size() AND size() == QUEUE_LENGTH << u32::MAX
        (self.front + self.len) % self.size()
    }

    pub fn peek(&self) -> Option<&OrderMatch> {
        if self.len == 0 {
            None
        } else {
            Some(&self.items[self.front as usize])
        }
    }

    pub fn peek_mut(&mut self) -> Option<&mut OrderMatch> {
        if self.len == 0 {
            None
        } else {
            Some(&mut self.items[self.front as usize])
        }
    }

    pub fn enqueue(&mut self, item: OrderMatch) -> Option<u32> {
        if self.len == self.size() {
            None
        } else {
            let old_back = self.back();
            // #[soteria(ignore)] no overflows due to "if" check
            self.len += 1;
            self.items[old_back as usize] = item;
            self.empty = self.is_empty();
            Some(old_back)
        }
    }

    pub fn dequeue(&mut self) -> Option<&mut OrderMatch> {
        if self.len == 0 {
            None
        } else {
            let old_front = self.front;
            self.front = (old_front + 1) % self.size();
            // #[soteria(ignore)] no underflows due to "if" check
            self.len -= 1;
            self.empty = self.is_empty();
            Some(&mut self.items[old_front as usize])
        }
    }

    pub fn to_vec(&self) -> Vec<OrderMatch> {
        let mut clone = Vec::with_capacity(self.len() as usize);
        for i in 0..self.len() as usize {
            let index = (self.front as usize + i) % (self.size() as usize);
            clone.push(self.items[index]);
        }
        clone
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default)]
pub struct OrderMatch {
    pub pk: Option<Pubkey>,

    pub for_outcome: bool,
    pub outcome_index: u16,
    pub price: f64,
    pub stake: u64,
}

impl OrderMatch {
    pub const SIZE: usize = option_size(PUB_KEY_SIZE) +  // pk
        BOOL_SIZE + // for_outcome
        U16_SIZE + // outcome_index
        F64_SIZE + // price
        U64_SIZE; // stake

    pub fn taker(
        pk: Pubkey,
        for_outcome: bool,
        outcome_index: u16,
        price: f64,
        stake: u64,
    ) -> Self {
        OrderMatch {
            pk: Option::Some(pk),
            for_outcome,
            outcome_index,
            price,
            stake,
        }
    }

    pub fn maker(for_outcome: bool, outcome_index: u16, price: f64, stake: u64) -> Self {
        OrderMatch {
            pk: Option::None,
            for_outcome,
            outcome_index,
            price,
            stake,
        }
    }
}

impl PartialEq for OrderMatch {
    fn eq(&self, other: &Self) -> bool {
        self.pk.eq(&other.pk)
    }
}

impl Eq for OrderMatch {}

#[cfg(test)]
pub fn mock_market_matching_queue(market_pk: Pubkey) -> MarketMatchingQueue {
    MarketMatchingQueue {
        market: market_pk,
        matches: MatchingQueue::new(1),
    }
}

#[cfg(test)]
mod tests_matching_queue {
    use super::*;

    #[test]
    fn test_enqueue() {
        let mut queue = MatchingQueue::new(3);
        assert_eq!(0, queue.len());

        // 1/3
        let index1 = queue.enqueue(OrderMatch::default());
        assert!(index1.is_some());
        assert_eq!(0, index1.unwrap());
        assert_eq!(1, queue.len());

        // 2/3
        let index2 = queue.enqueue(OrderMatch::default());
        assert!(index2.is_some());
        assert_eq!(1, index2.unwrap());
        assert_eq!(2, queue.len());

        // 3/3
        let index3 = queue.enqueue(OrderMatch::default());
        assert!(index3.is_some());
        assert_eq!(2, index3.unwrap());
        assert_eq!(3, queue.len());

        // full
        let index4 = queue.enqueue(OrderMatch::default());
        assert!(index4.is_none());
        assert_eq!(3, queue.len());
    }

    #[test]
    fn test_dequeue() {
        let mut queue = MatchingQueue::new(3);
        queue.enqueue(OrderMatch::default());
        queue.enqueue(OrderMatch::default());
        queue.enqueue(OrderMatch::default());
        assert_eq!(3, queue.len());

        // 1/3
        let item1 = queue.dequeue();
        assert!(item1.is_some());
        assert_eq!(2, queue.len());

        // 2/3
        let item2 = queue.dequeue();
        assert!(item2.is_some());
        assert_eq!(1, queue.len());

        // 3/3
        let item3 = queue.dequeue();
        assert!(item3.is_some());
        assert_eq!(0, queue.len());

        // empty
        let item4 = queue.dequeue();
        assert!(item4.is_none());
        assert_eq!(0, queue.len());
    }

    #[test]
    fn test_wandering_head() {
        let mut queue = MatchingQueue::new(3);
        queue.enqueue(OrderMatch::default());
        queue.enqueue(OrderMatch::default());
        queue.enqueue(OrderMatch::default());
        assert_eq!(3, queue.len());

        assert_eq!(0, queue.front); // < front ofr the queue is moving
        assert_eq!(0, queue.back());

        // 1
        let item1 = queue.dequeue();
        assert!(item1.is_some());
        assert_eq!(2, queue.len());
        let index1 = queue.enqueue(OrderMatch::default());
        assert!(index1.is_some());
        assert_eq!(0, index1.unwrap());
        assert_eq!(3, queue.len());

        assert_eq!(1, queue.front);
        assert_eq!(1, queue.back());

        // 2
        let item2 = queue.dequeue();
        assert!(item2.is_some());
        assert_eq!(2, queue.len());
        let index2 = queue.enqueue(OrderMatch::default());
        assert!(index2.is_some());
        assert_eq!(1, index2.unwrap());
        assert_eq!(3, queue.len());

        assert_eq!(2, queue.front);
        assert_eq!(2, queue.back());

        // 3 full circle
        let item3 = queue.dequeue();
        assert!(item3.is_some());
        assert_eq!(2, queue.len());
        let index3 = queue.enqueue(OrderMatch::default());
        assert!(index3.is_some());
        assert_eq!(2, index3.unwrap());
        assert_eq!(3, queue.len());

        assert_eq!(0, queue.front);
        assert_eq!(0, queue.back());
    }

    #[test]
    fn test_peek() {
        let mut queue = MatchingQueue::new(3);
        assert_eq!(0, queue.len());

        // peek empty
        let peek1 = queue.peek();
        assert!(peek1.is_none());
        assert_eq!(0, queue.len());

        let peek1_mut = queue.peek_mut();
        assert!(peek1_mut.is_none());
        assert_eq!(0, queue.len());

        // peek first
        let item1 = OrderMatch::default();
        queue.enqueue(item1);
        assert_eq!(1, queue.len());

        let result = queue.peek();
        assert!(result.is_some());
        assert_eq!(item1, *result.unwrap());
        assert_eq!(1, queue.len());

        let result_mut = queue.peek_mut();
        assert!(result_mut.is_some());
        assert_eq!(item1, *result_mut.unwrap());
        assert_eq!(1, queue.len());
    }

    #[test]
    fn test_peek_edit() {
        let mut queue = MatchingQueue::new(3);
        queue.enqueue(OrderMatch::default());
        queue.enqueue(OrderMatch::default());
        assert_eq!(2, queue.len());

        queue.peek_mut().unwrap().stake = 10;
        assert_eq!(10, queue.peek().unwrap().stake);
    }
}
