use crate::error::CoreError;
use crate::state::type_size::*;
use anchor_lang::prelude::*;
use std::string::ToString;

#[account]
pub struct Market {
    // this section cannot be moved or on-chain search will stop working
    pub authority: Pubkey,
    pub event_account: Pubkey,
    pub mint_account: Pubkey,
    pub market_status: MarketStatus,
    pub market_type: String,
    // this section cannot be moved or on-chain search will stop working
    pub decimal_limit: u8,

    pub published: bool,
    pub suspended: bool,

    pub market_outcomes_count: u16,
    pub market_winning_outcome_index: Option<u16>,
    pub market_lock_timestamp: i64,
    pub market_settle_timestamp: Option<i64>,

    pub title: String,

    pub escrow_account_bump: u8,
}

impl Market {
    pub const TYPE_MAX_LENGTH: usize = 50;
    pub const TITLE_MAX_LENGTH: usize = 100;

    pub const SIZE: usize = DISCRIMINATOR_SIZE
        + (PUB_KEY_SIZE * 3) // authority, event and mint
        + U8_SIZE // decimal_limit
        + ENUM_SIZE // market_status
        + vec_size (CHAR_SIZE, Market::TYPE_MAX_LENGTH) // market_type
        + BOOL_SIZE * 2 // published + suspended
        + U16_SIZE // market_outcomes_count
        + option_size(U16_SIZE) // market_winning_outcome_index
        + I64_SIZE // market_lock_timestamp
        + option_size(I64_SIZE) // market_settle_timestamp
        + vec_size(CHAR_SIZE, Market::TITLE_MAX_LENGTH) // title
        + U8_SIZE; // bump

    pub fn increment_market_outcomes_count(&mut self) -> Result<u16> {
        self.market_outcomes_count = self
            .market_outcomes_count
            .checked_add(1_u16)
            .ok_or(CoreError::ArithmeticError)?;
        Ok(self.market_outcomes_count)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, PartialEq, Eq)]
pub enum MarketStatus {
    Initializing,
    Open,
    Locked,
    ReadyForSettlement,
    Settled,
    Complete,
}

#[account]
pub struct MarketOutcome {
    pub market: Pubkey,
    pub index: u16,
    pub title: String,
    pub latest_matched_price: f64,
    pub matched_total: u64,
    pub price_ladder: Vec<f64>,
}

impl MarketOutcome {
    pub const TITLE_MAX_LENGTH: usize = 100;
    pub const PRICE_LADDER_LENGTH: usize = 320;

    pub const SIZE: usize = DISCRIMINATOR_SIZE
        + PUB_KEY_SIZE // market
        + U16_SIZE // index
        + vec_size(CHAR_SIZE, MarketOutcome::TITLE_MAX_LENGTH) // title
        + F64_SIZE // latest_matched_price
        + U64_SIZE // matched_total
        + vec_size(F64_SIZE, MarketOutcome::PRICE_LADDER_LENGTH); // price_ladder
}

#[account]
pub struct MarketMatchingPool {
    pub purchaser: Pubkey,
    pub liquidity_amount: u64,
    pub matched_amount: u64,
    pub orders: Cirque,
}

impl MarketMatchingPool {
    pub const QUEUE_LENGTH: usize = 100;

    pub const SIZE: usize = DISCRIMINATOR_SIZE +
        PUB_KEY_SIZE + // purchaser
        U64_SIZE + // liquidity_amount
        U64_SIZE + // matched_amount
        Cirque::size_for(MarketMatchingPool::QUEUE_LENGTH); //orders
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct Cirque {
    front: u32,
    len: u32,
    items: Vec<Pubkey>,
}

impl Cirque {
    pub const fn size_for(length: usize) -> usize {
        (U32_SIZE  * 2) + // front and len
        vec_size(PUB_KEY_SIZE, length) // items
    }

    pub fn new(size: usize) -> Cirque {
        Cirque {
            front: 0,
            len: 0,
            items: vec![Pubkey::default(); size],
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

    pub fn enqueue(&mut self, item: Pubkey) -> Option<u32> {
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

    pub fn dequeue(&mut self) -> Option<Pubkey> {
        if self.len == 0 {
            None
        } else {
            let old_front = self.front;
            self.front = (old_front + 1) % self.size();
            // #[soteria(ignore)] no underflows due to "if" check
            self.len -= 1;
            let item: &Pubkey = self.items.get(old_front as usize).unwrap();
            Some(*item)
        }
    }

    pub fn remove_item(&mut self, to_remove: &Pubkey) {
        if self.len == 0 {
            return;
        }

        let front_index = self.front as usize;
        let last_index = ((self.front + self.len - 1) % self.size()) as usize;

        // if the queue can be treated as a regular array
        if last_index >= front_index {
            if let Some(relative_index) = self.items[front_index..=last_index]
                .iter()
                .position(|x| x.eq(to_remove))
            {
                let index = front_index + relative_index;
                if index == front_index {
                    self.front = (front_index + 1) as u32 % self.size();
                } else if index < last_index {
                    self.items.copy_within((index + 1)..=last_index, index);
                }
                // #[soteria(ignore)] no underflows due to "if" check
                self.len -= 1;
            }
        }
        // queue bridges end of array, item to remove is orderween start of array and end of queue
        else {
            let idx_0_to_last = &mut self.items[..=last_index].to_vec();
            if let Some(index) = idx_0_to_last.iter().position(|x| x.eq(to_remove)) {
                if index < last_index {
                    self.items.copy_within((index + 1)..=last_index, index);
                }
                // #[soteria(ignore)] no underflows due to "if" check
                self.len -= 1;
                return;
            }

            // queue bridges end of array, item to remove is orderween front of queue and end of array
            let front_to_end = &mut self.items[front_index..].to_vec();
            if let Some(relative_index) = front_to_end.iter().position(|x| x.eq(to_remove)) {
                let index = front_index + relative_index;

                // No need to move any data around, just move front one to the right and decrement len
                if index == front_index {
                    self.front = (front_index + 1) as u32 % self.size();
                } else {
                    let items = &mut self.items;
                    let length = items.len();

                    items.copy_within((index + 1).., index);
                    items.swap(length - 1, 0);
                    items.copy_within(1..=last_index, 0);
                }
                // #[soteria(ignore)] no underflows due to "if" check
                self.len -= 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // front < back (queue can be compared with normal array)

    #[test]
    fn test_cirque_remove_item_from_front_index_0() {
        // remove front index 0
        let queue = &mut generate_populated_queue(5, 3);
        let to_remove = queue.items[0];

        queue.remove_item(&to_remove);

        assert_eq!(2, queue.len());
        assert_eq!(3, queue.back());
        assert_eq!(1, queue.front);
    }

    #[test]
    fn test_cirque_remove_item_from_front_after_dequeue() {
        // remove front index 1
        let queue = &mut generate_populated_queue(5, 3);
        queue.dequeue();

        let to_remove = queue.items[1];
        queue.remove_item(&to_remove);

        assert_eq!(1, queue.len());
        assert_eq!(3, queue.back());
        assert_eq!(2, queue.front);
    }

    #[test]
    fn test_cirque_remove_item_from_back() {
        // remove back item from queue (index n-1)
        let queue = &mut generate_populated_queue(5, 3);
        let to_remove = queue.items[2];

        queue.remove_item(&to_remove);

        assert_eq!(2, queue.len());
        assert_eq!(2, queue.back());
        assert_eq!(0, queue.front);
    }

    #[test]
    fn test_cirque_remove_item_from_middle() {
        // remove item in the middle of queue
        let queue = &mut generate_populated_queue(5, 3);
        let to_remove = queue.items[1];

        queue.remove_item(&to_remove);

        assert_eq!(2, queue.len());
        assert_eq!(2, queue.back());
        assert_eq!(0, queue.front);
    }

    // back == front
    #[test]
    fn test_cirque_remove_item_from_back_where_back_equals_front() {
        let queue_size = 5;

        let queue = &mut generate_populated_queue(queue_size, queue_size);

        let key1 = queue.items[0];
        let key2 = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let key5 = queue.items[4];

        let expected_keys = vec![key1, key2, key3, key4, key5];

        for i in 0..queue_size {
            // Pop and push so item is now at the back
            let item_to_remove = queue.dequeue().unwrap();
            queue.enqueue(item_to_remove);

            queue.remove_item(&item_to_remove);

            assert_eq!(4, queue.len());
            assert_eq!(i, queue.back() as usize);
            assert_eq!((i + 1) % queue_size, queue.front as usize);
            assert_eq!(expected_keys, queue.items);

            queue.enqueue(item_to_remove);
        }
    }

    // back < front (queue bridges end of array)

    #[test]
    fn test_cirque_remove_item_from_front_where_back_at_index_0() {
        // Queue bridges array and item removed when front is index 0
        let queue = &mut generate_populated_queue(5, 5);

        let key1 = queue.items[0];
        let to_remove = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let key5 = queue.items[4];

        queue.dequeue();
        queue.remove_item(&to_remove);

        assert_eq!(3, queue.len());
        assert_eq!(0, queue.back());
        assert_eq!(2, queue.front);
        assert_eq!(vec![key1, to_remove, key3, key4, key5], queue.items);
    }

    #[test]
    fn test_cirque_remove_multiple_times_when_queue_bridges_array() {
        let queue = &mut generate_populated_queue(5, 5);

        let key1 = queue.items[0];
        let key_2_to_remove = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let key_5_to_remove = queue.items[4];

        queue.dequeue();
        queue.remove_item(&key_2_to_remove);

        assert_eq!(3, queue.len());
        assert_eq!(2, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(
            vec![key1, key_2_to_remove, key3, key4, key_5_to_remove],
            queue.items
        );

        queue.remove_item(&key_5_to_remove);
        assert_eq!(2, queue.len());
        assert_eq!(2, queue.front);
        assert_eq!(4, queue.back());
        assert_eq!(
            vec![key1, key_2_to_remove, key3, key4, key_5_to_remove],
            queue.items
        );
    }

    #[test]
    fn test_cirque_remove_multiple_times_when_queue_does_not_bridge_array() {
        let queue = &mut generate_populated_queue(5, 5);

        let key1 = queue.items[0];
        let key2_to_remove = queue.items[1];
        let key3_to_remove = queue.items[2];
        let key4 = queue.items[3];
        let key5 = queue.items[4];

        queue.dequeue();
        queue.remove_item(&key2_to_remove);

        assert_eq!(3, queue.len());
        assert_eq!(2, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(
            vec![key1, key2_to_remove, key3_to_remove, key4, key5],
            queue.items
        );

        queue.remove_item(&key3_to_remove);
        assert_eq!(2, queue.len());
        assert_eq!(3, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(
            vec![key1, key2_to_remove, key3_to_remove, key4, key5],
            queue.items
        );
    }

    #[test]
    fn test_cirque_remove_all_items() {
        let queue = &mut generate_populated_queue(5, 5);

        let key1 = queue.items[0];
        let key2 = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let key5 = queue.items[4];

        queue.remove_item(&key1);
        assert_eq!(1, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(4, queue.len());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        queue.remove_item(&key2);
        assert_eq!(2, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(3, queue.len());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        queue.remove_item(&key3);
        assert_eq!(3, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(2, queue.len());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        queue.remove_item(&key4);
        assert_eq!(4, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(1, queue.len());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        queue.remove_item(&key5);
        assert_eq!(0, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(0, queue.len());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);
    }

    #[test]
    fn test_cirque_double_removal_first() {
        let queue = &mut generate_populated_queue(3, 3);

        let key1 = queue.items[0];
        let key2 = queue.items[1];
        let key3 = queue.items[2];

        queue.remove_item(&key1);
        assert_eq!(vec![key1, key2, key3], queue.items);
        assert_eq!(1, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(2, queue.len());

        queue.remove_item(&key1);
        assert_eq!(vec![key1, key2, key3], queue.items);
        assert_eq!(1, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(2, queue.len());
    }

    #[test]
    fn test_cirque_double_removal_last() {
        let queue = &mut generate_populated_queue(3, 3);

        let key1 = queue.items[0];
        let key2 = queue.items[1];
        let key3 = queue.items[2];

        queue.remove_item(&key3);
        assert_eq!(vec![key1, key2, key3], queue.items);
        assert_eq!(0, queue.front);
        assert_eq!(2, queue.back());
        assert_eq!(2, queue.len());

        queue.remove_item(&key3);
        assert_eq!(vec![key1, key2, key3], queue.items);
        assert_eq!(0, queue.front);
        assert_eq!(2, queue.back());
        assert_eq!(2, queue.len());
    }

    #[test]
    fn test_cirque_remove_all_items_reverse_order() {
        let queue = &mut generate_populated_queue(5, 5);

        let key1 = queue.items[0];
        let key2 = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let key5 = queue.items[4];

        queue.remove_item(&key5);
        assert_eq!(4, queue.len());
        assert_eq!(0, queue.front);
        assert_eq!(4, queue.back());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        queue.remove_item(&key4);
        assert_eq!(3, queue.len());
        assert_eq!(0, queue.front);
        assert_eq!(3, queue.back());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        queue.remove_item(&key3);
        assert_eq!(2, queue.len());
        assert_eq!(0, queue.front);
        assert_eq!(2, queue.back());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        queue.remove_item(&key2);
        assert_eq!(1, queue.len());
        assert_eq!(0, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        queue.remove_item(&key1);
        assert_eq!(0, queue.len());
        assert_eq!(1, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);
    }

    #[test]
    fn test_cirque_remove_all_items_queue_bridges_array() {
        let queue = &mut generate_populated_queue(5, 5);

        let key2 = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let key5 = queue.items[4];

        assert_eq!(0, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(5, queue.len());

        queue.dequeue();
        assert_eq!(1, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(4, queue.len());

        let key6 = Pubkey::new_unique();
        queue.enqueue(key6);
        assert_eq!(1, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(5, queue.len());

        queue.remove_item(&key2);
        assert_eq!(2, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(4, queue.len());

        queue.remove_item(&key3);
        assert_eq!(3, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(3, queue.len());

        queue.remove_item(&key4);
        assert_eq!(4, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(2, queue.len());

        queue.remove_item(&key5);
        assert_eq!(0, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(1, queue.len());

        queue.remove_item(&key6);
        assert_eq!(1, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(0, queue.len());
    }

    #[test]
    fn test_cirque_remove_item_from_front_where_front_last_item_in_array() {
        let queue = &mut generate_populated_queue(5, 5);
        queue.dequeue();
        queue.dequeue();
        queue.dequeue();
        queue.dequeue();

        assert_eq!(4, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(1, queue.len());

        let key1 = queue.items[0];
        let key2 = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let to_remove = queue.items[4];

        queue.remove_item(&to_remove);

        assert_eq!(0, queue.front);
        assert_eq!(0, queue.len());
        assert_eq!(0, queue.back());
        assert_eq!(vec![key1, key2, key3, key4, to_remove], queue.items);
    }

    #[test]
    fn test_cirque_remove_item_from_end_of_array() {
        // Queue bridges array and item removed is from end of array (index 4)
        let queue = &mut generate_populated_queue(5, 5);

        let key2 = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let to_remove = queue.items[4];

        queue.dequeue();
        let key6 = Pubkey::new_unique();
        queue.enqueue(key6);

        assert!(queue.items.eq(&vec![key6, key2, key3, key4, to_remove]));

        queue.remove_item(&to_remove);

        assert_eq!(4, queue.len());
        assert_eq!(1, queue.front);
        assert_eq!(0, queue.back());
        assert!(queue.items.eq(&vec![to_remove, key2, key3, key4, key6]));
    }

    #[test]
    fn test_cirque_remove_item_from_back_at_index_0() {
        // remove from back where back is index 0
        let queue = &mut generate_populated_queue(5, 5);
        queue.dequeue();

        let key2 = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let key5 = queue.items[4];

        let to_remove = Pubkey::new_unique();
        queue.enqueue(to_remove);

        queue.remove_item(&to_remove);

        assert_eq!(4, queue.len());
        assert_eq!(0, queue.back());
        assert_eq!(1, queue.front);
        assert!(queue.items.eq(&vec![to_remove, key2, key3, key4, key5]));
    }

    #[test]
    fn test_cirque_remove_item_from_middle_index_0() {
        //  remove from middle where middle is index 0
        let queue = &mut generate_populated_queue(5, 5);
        queue.dequeue();
        queue.dequeue();

        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let key5 = queue.items[4];

        let to_remove = Pubkey::new_unique();
        let key7 = Pubkey::new_unique();
        queue.enqueue(to_remove);
        queue.enqueue(key7);

        queue.remove_item(&to_remove);

        assert_eq!(4, queue.len());
        assert_eq!(1, queue.back());
        assert_eq!(2, queue.front);
        assert!(queue.items.eq(&vec![key7, key7, key3, key4, key5]));
    }

    #[test]
    fn test_cirque_remove_middle_item_where_front_last_item_in_array() {
        let queue = &mut generate_populated_queue(5, 5);
        queue.dequeue();
        queue.dequeue();
        queue.dequeue();
        queue.dequeue();

        let key5 = queue.items[4];

        let key6 = Pubkey::new_unique();
        let key7 = Pubkey::new_unique();
        let to_remove = Pubkey::new_unique();
        let key9 = Pubkey::new_unique();
        queue.enqueue(key6);
        queue.enqueue(key7);
        queue.enqueue(to_remove);
        queue.enqueue(key9);

        queue.remove_item(&to_remove);

        assert_eq!(4, queue.len());
        assert_eq!(3, queue.back());
        assert_eq!(4, queue.front);
        assert!(queue.items.eq(&vec![key6, key7, key9, key9, key5]));
    }

    #[test]
    fn test_cirque_remove_item_from_middle_more_than_zero_when_front_ahead_of_back() {
        // Queue bridges array - remove from middle where 0 < middle < back
        let queue = &mut generate_populated_queue(5, 5);

        let key4 = queue.items[3];
        let key5 = queue.items[4];

        queue.dequeue();
        queue.dequeue();
        queue.dequeue();

        let key6 = Pubkey::new_unique(); // key 6
        let to_remove = Pubkey::new_unique(); // key 6
        let key8 = Pubkey::new_unique(); // key 6
        queue.enqueue(key6);
        queue.enqueue(to_remove);
        queue.enqueue(key8);

        queue.remove_item(&to_remove);

        assert_eq!(4, queue.len());
        assert_eq!(2, queue.back());
        assert_eq!(3, queue.front);
        assert!(queue.items.eq(&vec![key6, key8, key8, key4, key5]));
    }

    #[test]
    fn test_cirque_remove_item_from_middle_less_then_len_when_front_ahead_of_back() {
        // Queue bridges array - remove from middle where front < middle < items.len
        let queue = &mut generate_populated_queue(10, 10);

        let key1 = queue.items[0];
        let key2 = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let key5 = queue.items[4];
        let key6 = queue.items[5];
        let key7 = queue.items[6];
        let key8 = queue.items[7];
        let key9 = queue.items[8];
        let key10 = queue.items[9];

        let expected_items = vec![key2, key3, key4, key5, key5, key6, key7, key9, key10, key1];

        queue.dequeue();
        queue.dequeue();
        queue.dequeue();
        queue.dequeue();
        queue.dequeue();

        queue.enqueue(queue.items[0]);
        queue.enqueue(queue.items[1]);
        queue.enqueue(queue.items[2]);
        queue.enqueue(queue.items[3]);
        queue.enqueue(queue.items[4]);

        assert_eq!(5, queue.front);
        assert_eq!(5, queue.back());
        assert_eq!(10, queue.len);

        queue.remove_item(&key8);

        assert_eq!(5, queue.front);
        assert_eq!(4, queue.back());
        assert_eq!(9, queue.len);
        assert_eq!(expected_items, queue.items);
    }

    fn generate_populated_queue(size: usize, enqueued_pubkeys: usize) -> Cirque {
        let mut queue = Cirque::new(size as usize);
        for _ in 0..enqueued_pubkeys {
            queue.enqueue(Pubkey::new_unique());
        }

        queue
    }

    #[test]
    fn test_cirque_enqueue_size_1_success() {
        let mut queue = Cirque::new(1);
        assert_eq!(0, queue.len());

        let result = queue.enqueue(Pubkey::new_unique());
        assert!(result.is_some());
        assert_eq!(0, result.unwrap());
        assert_eq!(1, queue.len());
    }

    #[test]
    fn test_cirque_enqueue_size_n_success() {
        let mut queue = Cirque::new(3);
        queue.enqueue(Pubkey::new_unique());
        queue.enqueue(Pubkey::new_unique());

        let result = queue.enqueue(Pubkey::new_unique());
        assert!(result.is_some());
        assert_eq!(2, result.unwrap());
        assert_eq!(3, queue.len());
    }

    #[test]
    fn test_cirque_dequeue_success() {
        let mut queue = Cirque::new(1);
        let pubkey = Pubkey::new_unique();
        queue.enqueue(pubkey);
        assert_eq!(1, queue.len());

        let result = queue.dequeue();
        assert!(result.is_some());
        assert_eq!(pubkey, result.unwrap());
        assert_eq!(0, queue.len());
    }

    #[test]
    fn test_cirque_dequeue_empty_queue() {
        let mut queue = Cirque::new(1);
        assert_eq!(0, queue.len());

        let result = queue.dequeue();
        assert!(result.is_none());
        assert_eq!(0, queue.len());
    }

    #[test]
    fn test_cirque_dequeue_full_queue() {
        let mut queue = Cirque::new(3);
        let expected = Pubkey::new_unique();
        queue.enqueue(expected);
        queue.enqueue(Pubkey::new_unique());
        queue.enqueue(Pubkey::new_unique());
        assert_eq!(3, queue.len());

        let result = queue.dequeue();
        assert!(result.is_some());
        assert_eq!(expected, result.unwrap());
    }

    #[test]
    fn test_cirque_enqueue_full_queue() {
        let mut queue = Cirque::new(3);
        queue.enqueue(Pubkey::new_unique());
        queue.enqueue(Pubkey::new_unique());
        queue.enqueue(Pubkey::new_unique());
        assert_eq!(3, queue.len());

        let result = queue.enqueue(Pubkey::new_unique());
        assert!(result.is_none());
        assert_eq!(3, queue.len());
    }
}
