use crate::state::type_size::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;

#[account]
pub struct MarketPaymentsQueue {
    pub market: Pubkey,
    pub payment_queue: PaymentQueue,
}

impl MarketPaymentsQueue {
    pub const QUEUE_LENGTH: u32 = 100;
    pub const SIZE: usize = DISCRIMINATOR_SIZE
        + PUB_KEY_SIZE
        + PaymentQueue::size_for(MarketPaymentsQueue::QUEUE_LENGTH);
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, PartialEq, Clone, Copy)]
pub struct PaymentInfo {
    pub to: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
}

impl PaymentInfo {
    pub const SIZE: usize = (PUB_KEY_SIZE * 2) + U64_SIZE;

    fn default() -> Self {
        PaymentInfo {
            to: system_program::ID,
            from: system_program::ID,
            amount: 0,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct PaymentQueue {
    empty: bool,
    front: u32,
    len: u32,
    items: Vec<PaymentInfo>,
}

impl PaymentQueue {
    pub const fn size_for(length: u32) -> usize {
        BOOL_SIZE + // empty
        (U32_SIZE * 2) + // front and len
            vec_size(PaymentInfo::SIZE, length as usize) // items
    }

    pub fn new(size: u32) -> PaymentQueue {
        PaymentQueue {
            empty: true,
            front: 0,
            len: 0,
            items: vec![PaymentInfo::default(); size as usize],
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

    pub fn enqueue(&mut self, item: PaymentInfo) -> Option<u32> {
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

    pub fn dequeue(&mut self) -> Option<PaymentInfo> {
        if self.len == 0 {
            None
        } else {
            let old_front = self.front;
            self.front = (old_front + 1) % self.size();
            // #[soteria(ignore)] no underflows due to "if" check
            self.len -= 1;
            self.empty = self.is_empty();
            let item: PaymentInfo = *self.items.get(old_front as usize).unwrap();
            Some(item)
        }
    }
}

#[cfg(test)]
pub fn mock_market_payments_queue(market_pk: Pubkey) -> MarketPaymentsQueue {
    MarketPaymentsQueue {
        market: market_pk,
        payment_queue: PaymentQueue::new(MarketPaymentsQueue::QUEUE_LENGTH),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cirque_enqueue_size_1_success() {
        let mut queue = PaymentQueue::new(1);
        assert_eq!(0, queue.len());

        let result = queue.enqueue(PaymentInfo::default());
        assert!(result.is_some());
        assert_eq!(0, result.unwrap());
        assert_eq!(1, queue.len());
    }

    #[test]
    fn test_cirque_enqueue_size_n_success() {
        let mut queue = PaymentQueue::new(3);
        queue.enqueue(PaymentInfo::default());
        queue.enqueue(PaymentInfo::default());

        let result = queue.enqueue(PaymentInfo::default());
        assert!(result.is_some());
        assert_eq!(2, result.unwrap());
        assert_eq!(3, queue.len());
    }

    #[test]
    fn test_cirque_dequeue_success() {
        let mut queue = PaymentQueue::new(1);
        let payment_info = PaymentInfo::default();
        queue.enqueue(payment_info);
        assert_eq!(1, queue.len());

        let result = queue.dequeue();
        assert!(result.is_some());
        assert_eq!(payment_info, result.unwrap());
        assert_eq!(0, queue.len());
    }

    #[test]
    fn test_cirque_dequeue_empty_queue() {
        let mut queue = PaymentQueue::new(1);
        assert_eq!(0, queue.len());

        let result = queue.dequeue();
        assert!(result.is_none());
        assert_eq!(0, queue.len());
    }

    #[test]
    fn test_cirque_dequeue_full_queue() {
        let mut queue = PaymentQueue::new(3);
        let expected = PaymentInfo::default();
        queue.enqueue(expected);
        queue.enqueue(PaymentInfo::default());
        queue.enqueue(PaymentInfo::default());
        assert_eq!(3, queue.len());

        let result = queue.dequeue();
        assert!(result.is_some());
        assert_eq!(expected, result.unwrap());
    }

    #[test]
    fn test_cirque_enqueue_full_queue() {
        let mut queue = PaymentQueue::new(3);
        queue.enqueue(PaymentInfo::default());
        queue.enqueue(PaymentInfo::default());
        queue.enqueue(PaymentInfo::default());
        assert_eq!(3, queue.len());

        let result = queue.enqueue(PaymentInfo::default());
        assert!(result.is_none());
        assert_eq!(3, queue.len());
    }
}
