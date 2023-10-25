use crate::state::type_size::*;
use anchor_lang::prelude::*;
use std::string::ToString;

use super::market_account::MarketOrderBehaviour;

#[account]
pub struct MarketMatchingPool {
    pub market: Pubkey,
    pub market_outcome_index: u16,
    pub for_outcome: bool,
    pub price: f64,
    pub payer: Pubkey,
    pub liquidity_amount: u64,
    pub matched_amount: u64,
    pub inplay: bool,
    pub orders: Cirque,
}

impl MarketMatchingPool {
    pub const QUEUE_LENGTH: u32 = 80;

    pub const SIZE: usize = DISCRIMINATOR_SIZE +
        PUB_KEY_SIZE + // market
        U16_SIZE + // market_outcome_index
        BOOL_SIZE + // for_outcome
        F64_SIZE + // price
        PUB_KEY_SIZE + // payer
        U64_SIZE + // liquidity_amount
        U64_SIZE + // matched_amount
        BOOL_SIZE + // inplay
        Cirque::size_for(MarketMatchingPool::QUEUE_LENGTH); //orders

    pub fn move_to_inplay(&mut self, market_event_start_order_behaviour: &MarketOrderBehaviour) {
        self.inplay = true;

        if market_event_start_order_behaviour.eq(&MarketOrderBehaviour::CancelUnmatched) {
            self.orders.set_length_to_zero();
            self.liquidity_amount = 0_u64;
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default)]
pub struct QueueItem {
    pub order: Pubkey,
    pub delay_expiration_timestamp: i64,
    pub liquidity_to_add: u64,
}

impl QueueItem {
    pub const SIZE: usize = PUB_KEY_SIZE + I64_SIZE + U64_SIZE;

    pub fn new(order: Pubkey) -> QueueItem {
        QueueItem::new_inplay(order, 0, 0)
    }

    pub fn new_inplay(
        order: Pubkey,
        delay_expiration_timestamp: i64,
        liquidity_to_add: u64,
    ) -> QueueItem {
        QueueItem {
            order,
            delay_expiration_timestamp,
            liquidity_to_add,
        }
    }

    pub fn new_unique() -> Self {
        QueueItem {
            order: Pubkey::new_unique(),
            delay_expiration_timestamp: 0,
            liquidity_to_add: 0,
        }
    }
}

impl PartialEq for QueueItem {
    fn eq(&self, other: &Self) -> bool {
        self.order.eq(&other.order)
    }
}

impl Eq for QueueItem {}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct Cirque {
    front: u32,
    len: u32,
    items: Vec<QueueItem>,
}

impl Cirque {
    pub const fn size_for(length: u32) -> usize {
        (U32_SIZE  * 2) + // front and len
        vec_size(QueueItem::SIZE, length as usize) // items
    }

    pub fn new(size: u32) -> Cirque {
        Cirque {
            front: 0,
            len: 0,
            items: vec![QueueItem::default(); size as usize],
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

    pub fn peek(&mut self, index: u32) -> Option<&mut QueueItem> {
        if index >= self.len {
            None
        } else {
            let size = self.size();
            Some(&mut self.items[((self.front + index) % size) as usize])
        }
    }

    fn back(&self) -> u32 {
        // #[soteria(ignore)] 0 <= front < size() AND 0 <= len < size() AND size() == QUEUE_LENGTH << u32::MAX
        (self.front + self.len) % self.size()
    }

    pub fn set_length_to_zero(&mut self) {
        self.len = 0
    }

    pub fn enqueue_pubkey(&mut self, item: Pubkey) -> Option<u32> {
        self.enqueue(QueueItem::new(item))
    }

    pub fn enqueue(&mut self, item: QueueItem) -> Option<u32> {
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

    pub fn dequeue_pubkey(&mut self) -> Option<Pubkey> {
        self.dequeue().map(|item| item.order)
    }

    pub fn dequeue(&mut self) -> Option<&mut QueueItem> {
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

    pub fn remove_pubkey(&mut self, to_remove: &Pubkey) -> Option<QueueItem> {
        self.remove(&QueueItem::new(*to_remove))
    }

    pub fn remove(&mut self, to_remove: &QueueItem) -> Option<QueueItem> {
        if self.len == 0 {
            return None;
        }

        let front_index = self.front as usize;
        let last_index = ((self.front + self.len - 1) % self.size()) as usize;

        // if the queue can be treated as a regular array
        if last_index >= front_index {
            if let Some(relative_index) = self.items[front_index..=last_index]
                .iter()
                .position(|x: &QueueItem| x.eq(to_remove))
            {
                let index = front_index + relative_index;
                let item = self.items[index];
                if index == front_index {
                    self.front = (front_index + 1) as u32 % self.size();
                } else if index < last_index {
                    self.items.copy_within((index + 1)..=last_index, index);
                }
                // #[soteria(ignore)] no underflows due to "if" check
                self.len -= 1;
                return Some(item);
            }
        }
        // queue bridges end of array, item to remove is orderween start of array and end of queue
        else {
            let idx_0_to_last = &mut self.items[..=last_index].to_vec();
            if let Some(index) = idx_0_to_last.iter().position(|x| x.eq(to_remove)) {
                let item = self.items[index];
                if index < last_index {
                    self.items.copy_within((index + 1)..=last_index, index);
                }
                // #[soteria(ignore)] no underflows due to "if" check
                self.len -= 1;
                return Some(item);
            }

            // queue bridges end of array, item to remove is orderween front of queue and end of array
            let front_to_end = &mut self.items[front_index..].to_vec();
            if let Some(relative_index) = front_to_end.iter().position(|x| x.eq(to_remove)) {
                let index = front_index + relative_index;
                let item = self.items[index];

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
                return Some(item);
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use anchor_lang::prelude::*;

    use crate::state::market_matching_pool_account::{Cirque, QueueItem};

    //
    // Cirque tests
    //

    // front < back (queue can be compared with normal array)
    #[test]
    fn test_cirque_remove_from_front_index_0() {
        // remove front index 0
        let queue = &mut generate_populated_queue(5, 3);
        let to_remove = queue.items[0];

        let result = queue.remove(&to_remove);

        assert_eq!(to_remove.order, result.unwrap().order);
        assert_eq!(2, queue.len());
        assert_eq!(3, queue.back());
        assert_eq!(1, queue.front);
    }

    #[test]
    fn test_cirque_remove_from_front_after_dequeue() {
        // remove front index 1
        let queue = &mut generate_populated_queue(5, 3);
        queue.dequeue();

        let to_remove = queue.items[1];
        let result = queue.remove(&to_remove);

        assert_eq!(to_remove.order, result.unwrap().order);
        assert_eq!(1, queue.len());
        assert_eq!(3, queue.back());
        assert_eq!(2, queue.front);
    }

    #[test]
    fn test_cirque_remove_from_back() {
        // remove back item from queue (index n-1)
        let queue = &mut generate_populated_queue(5, 3);
        let to_remove = queue.items[2];

        let result = queue.remove(&to_remove);

        assert_eq!(to_remove.order, result.unwrap().order);
        assert_eq!(2, queue.len());
        assert_eq!(2, queue.back());
        assert_eq!(0, queue.front);
    }

    #[test]
    fn test_cirque_remove_from_middle() {
        // remove item in the middle of queue
        let queue = &mut generate_populated_queue(5, 3);
        let to_remove = queue.items[1];

        let result = queue.remove(&to_remove);

        assert_eq!(to_remove.order, result.unwrap().order);
        assert_eq!(2, queue.len());
        assert_eq!(2, queue.back());
        assert_eq!(0, queue.front);
    }

    // back == front
    #[test]
    fn test_cirque_remove_from_back_where_back_equals_front() {
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
            let item_to_remove = *(queue.dequeue().unwrap());
            queue.enqueue(item_to_remove);

            let result = queue.remove(&item_to_remove);

            assert_eq!(item_to_remove.order, result.unwrap().order);
            assert_eq!(4, queue.len());
            assert_eq!(i, queue.back());
            assert_eq!((i + 1) % queue_size, queue.front);
            assert_eq!(expected_keys, queue.items);

            queue.enqueue(item_to_remove);
        }
    }

    // back < front (queue bridges end of array)

    #[test]
    fn test_cirque_remove_from_front_where_back_at_index_0() {
        // Queue bridges array and item removed when front is index 0
        let queue = &mut generate_populated_queue(5, 5);

        let key1 = queue.items[0];
        let to_remove = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let key5 = queue.items[4];

        queue.dequeue();
        let result = queue.remove(&to_remove);

        assert_eq!(to_remove.order, result.unwrap().order);
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
        let result = queue.remove(&key_2_to_remove);

        assert_eq!(key_2_to_remove.order, result.unwrap().order);
        assert_eq!(3, queue.len());
        assert_eq!(2, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(
            vec![key1, key_2_to_remove, key3, key4, key_5_to_remove],
            queue.items
        );

        queue.remove(&key_5_to_remove);
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
        let result2 = queue.remove(&key2_to_remove);

        assert_eq!(key2_to_remove.order, result2.unwrap().order);
        assert_eq!(3, queue.len());
        assert_eq!(2, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(
            vec![key1, key2_to_remove, key3_to_remove, key4, key5],
            queue.items
        );

        let result3 = queue.remove(&key3_to_remove);
        assert_eq!(key3_to_remove.order, result3.unwrap().order);
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

        let result1 = queue.remove(&key1);
        assert_eq!(key1.order, result1.unwrap().order);
        assert_eq!(1, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(4, queue.len());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        let result2 = queue.remove(&key2);
        assert_eq!(key2.order, result2.unwrap().order);
        assert_eq!(2, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(3, queue.len());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        let result3 = queue.remove(&key3);
        assert_eq!(key3.order, result3.unwrap().order);
        assert_eq!(3, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(2, queue.len());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        let result4 = queue.remove(&key4);
        assert_eq!(key4.order, result4.unwrap().order);
        assert_eq!(4, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(1, queue.len());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        let result5 = queue.remove(&key5);
        assert_eq!(key5.order, result5.unwrap().order);
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

        let result1 = queue.remove(&key1);
        assert_eq!(key1.order, result1.unwrap().order);
        assert_eq!(vec![key1, key2, key3], queue.items);
        assert_eq!(1, queue.front);
        assert_eq!(0, queue.back());
        assert_eq!(2, queue.len());

        let result2 = queue.remove(&key1);
        assert!(result2.is_none());
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

        let first_remove = queue.remove(&key3);

        assert!(first_remove.is_some());
        assert_eq!(vec![key1, key2, key3], queue.items);
        assert_eq!(0, queue.front);
        assert_eq!(2, queue.back());
        assert_eq!(2, queue.len());

        let second_remove = queue.remove(&key3);

        assert!(second_remove.is_none());
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

        let result = queue.remove(&key5);
        assert_eq!(key5.order, result.unwrap().order);
        assert_eq!(4, queue.len());
        assert_eq!(0, queue.front);
        assert_eq!(4, queue.back());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        let result4 = queue.remove(&key4);
        assert_eq!(key4.order, result4.unwrap().order);
        assert_eq!(3, queue.len());
        assert_eq!(0, queue.front);
        assert_eq!(3, queue.back());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        let result3 = queue.remove(&key3);
        assert_eq!(key3.order, result3.unwrap().order);
        assert_eq!(2, queue.len());
        assert_eq!(0, queue.front);
        assert_eq!(2, queue.back());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        let result2 = queue.remove(&key2);
        assert_eq!(key2.order, result2.unwrap().order);
        assert_eq!(1, queue.len());
        assert_eq!(0, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(vec![key1, key2, key3, key4, key5], queue.items);

        let result1 = queue.remove(&key1);
        assert_eq!(key1.order, result1.unwrap().order);
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

        let key6 = QueueItem::new_unique();
        queue.enqueue(key6);
        assert_eq!(1, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(5, queue.len());

        let result2 = queue.remove(&key2);
        assert_eq!(key2.order, result2.unwrap().order);
        assert_eq!(2, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(4, queue.len());

        let result3 = queue.remove(&key3);
        assert_eq!(key3.order, result3.unwrap().order);
        assert_eq!(3, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(3, queue.len());

        let result4 = queue.remove(&key4);
        assert_eq!(key4.order, result4.unwrap().order);
        assert_eq!(4, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(2, queue.len());

        let result5 = queue.remove(&key5);
        assert_eq!(key5.order, result5.unwrap().order);
        assert_eq!(0, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(1, queue.len());

        let result6 = queue.remove(&key6);
        assert_eq!(key6.order, result6.unwrap().order);
        assert_eq!(1, queue.front);
        assert_eq!(1, queue.back());
        assert_eq!(0, queue.len());
    }

    #[test]
    fn test_cirque_remove_from_front_where_front_last_item_in_array() {
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

        let result = queue.remove(&to_remove);

        assert_eq!(to_remove.order, result.unwrap().order);
        assert_eq!(0, queue.front);
        assert_eq!(0, queue.len());
        assert_eq!(0, queue.back());
        assert_eq!(vec![key1, key2, key3, key4, to_remove], queue.items);
    }

    #[test]
    fn test_cirque_remove_from_end_of_array() {
        // Queue bridges array and item removed is from end of array (index 4)
        let queue = &mut generate_populated_queue(5, 5);

        let key2 = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let to_remove = queue.items[4];

        queue.dequeue();
        let key6 = QueueItem::new_unique();
        queue.enqueue(key6);

        assert!(queue.items.eq(&vec![key6, key2, key3, key4, to_remove]));

        let result = queue.remove(&to_remove);

        assert_eq!(to_remove.order, result.unwrap().order);
        assert_eq!(4, queue.len());
        assert_eq!(1, queue.front);
        assert_eq!(0, queue.back());
        assert!(queue.items.eq(&vec![to_remove, key2, key3, key4, key6]));
    }

    #[test]
    fn test_cirque_remove_from_back_at_index_0() {
        // remove from back where back is index 0
        let queue = &mut generate_populated_queue(5, 5);
        queue.dequeue();

        let key2 = queue.items[1];
        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let key5 = queue.items[4];

        let to_remove = QueueItem::new_unique();
        queue.enqueue(to_remove);

        let result = queue.remove(&to_remove);

        assert_eq!(to_remove.order, result.unwrap().order);
        assert_eq!(4, queue.len());
        assert_eq!(0, queue.back());
        assert_eq!(1, queue.front);
        assert!(queue.items.eq(&vec![to_remove, key2, key3, key4, key5]));
    }

    #[test]
    fn test_cirque_remove_from_middle_index_0() {
        //  remove from middle where middle is index 0
        let queue = &mut generate_populated_queue(5, 5);
        queue.dequeue();
        queue.dequeue();

        let key3 = queue.items[2];
        let key4 = queue.items[3];
        let key5 = queue.items[4];

        let to_remove = QueueItem::new_unique();
        let key7 = QueueItem::new_unique();
        queue.enqueue(to_remove);
        queue.enqueue(key7);

        let result = queue.remove(&to_remove);

        assert_eq!(to_remove.order, result.unwrap().order);
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

        let key6 = QueueItem::new_unique();
        let key7 = QueueItem::new_unique();
        let to_remove = QueueItem::new_unique();
        let key9 = QueueItem::new_unique();
        queue.enqueue(key6);
        queue.enqueue(key7);
        queue.enqueue(to_remove);
        queue.enqueue(key9);

        let expected_removed_pubkey = to_remove.order;

        let result = queue.remove(&to_remove);

        assert_eq!(expected_removed_pubkey, result.unwrap().order);
        assert_eq!(4, queue.len());
        assert_eq!(3, queue.back());
        assert_eq!(4, queue.front);
        assert!(queue.items.eq(&vec![key6, key7, key9, key9, key5]));
    }

    #[test]
    fn test_cirque_remove_from_middle_more_than_zero_when_front_ahead_of_back() {
        // Queue bridges array - remove from middle where 0 < middle < back
        let queue = &mut generate_populated_queue(5, 5);

        let key4 = queue.items[3];
        let key5 = queue.items[4];

        queue.dequeue();
        queue.dequeue();
        queue.dequeue();

        let key6 = QueueItem::new_unique(); // key 6
        let to_remove = QueueItem::new_unique(); // key 6
        let key8 = QueueItem::new_unique(); // key 6
        queue.enqueue(key6);
        queue.enqueue(to_remove);
        queue.enqueue(key8);

        let expected_removed_pubkey = to_remove.order;

        let result = queue.remove(&to_remove);

        assert_eq!(expected_removed_pubkey, result.unwrap().order);
        assert_eq!(4, queue.len());
        assert_eq!(2, queue.back());
        assert_eq!(3, queue.front);
        assert!(queue.items.eq(&vec![key6, key8, key8, key4, key5]));
    }

    #[test]
    fn test_cirque_remove_from_middle_less_then_len_when_front_ahead_of_back() {
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

        let expected_removed_pubkey = key8.order;
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

        let result = queue.remove(&key8);

        assert_eq!(expected_removed_pubkey, result.unwrap().order);
        assert_eq!(5, queue.front);
        assert_eq!(4, queue.back());
        assert_eq!(9, queue.len);
        assert_eq!(expected_items, queue.items);
    }

    fn generate_populated_queue(size: u32, enqueued_items: u32) -> Cirque {
        let mut queue = Cirque::new(size);
        for _ in 0..enqueued_items {
            queue.enqueue(QueueItem::new_unique());
        }

        queue
    }

    #[test]
    fn test_cirque_enqueue_size_1_success() {
        let mut queue = Cirque::new(1);
        assert_eq!(0, queue.len());

        let result = queue.enqueue(QueueItem::new_unique());
        assert!(result.is_some());
        assert_eq!(0, result.unwrap());
        assert_eq!(1, queue.len());
    }

    #[test]
    fn test_cirque_enqueue_size_n_success() {
        let mut queue = Cirque::new(3);
        queue.enqueue(QueueItem::new_unique());
        queue.enqueue(QueueItem::new_unique());

        let result = queue.enqueue(QueueItem::new_unique());
        assert!(result.is_some());
        assert_eq!(2, result.unwrap());
        assert_eq!(3, queue.len());
    }

    #[test]
    fn test_cirque_dequeue_success() {
        let mut queue = Cirque::new(1);
        let item = QueueItem::new_unique();
        queue.enqueue(item);
        assert_eq!(1, queue.len());

        let result = queue.dequeue();
        assert!(result.is_some());
        assert_eq!(item, *result.unwrap());
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
        let expected = QueueItem::new_unique();
        queue.enqueue(expected);
        queue.enqueue(QueueItem::new_unique());
        queue.enqueue(QueueItem::new_unique());
        assert_eq!(3, queue.len());

        let result = queue.dequeue();
        assert!(result.is_some());
        assert_eq!(expected, *result.unwrap());
    }

    #[test]
    fn test_cirque_enqueue_full_queue() {
        let mut queue = Cirque::new(3);
        queue.enqueue(QueueItem::new_unique());
        queue.enqueue(QueueItem::new_unique());
        queue.enqueue(QueueItem::new_unique());
        assert_eq!(3, queue.len());

        let result = queue.enqueue(QueueItem::new_unique());
        assert!(result.is_none());
        assert_eq!(3, queue.len());
    }

    #[test]
    fn test_cirque_peek_success() {
        let mut queue = Cirque::new(1);
        let item = QueueItem::new_unique();
        queue.enqueue(item);
        assert_eq!(1, queue.len());

        let result = queue.peek(0);
        assert!(result.is_some());
        assert_eq!(item, *result.unwrap());
        assert_eq!(1, queue.len());
    }

    #[test]
    fn test_cirque_peek_edit_in_place_success() {
        let mut queue = Cirque::new(2);
        queue.enqueue(QueueItem {
            order: Pubkey::new_unique(),
            liquidity_to_add: 1,
            delay_expiration_timestamp: 0,
        });
        queue.enqueue(QueueItem {
            order: Pubkey::new_unique(),
            liquidity_to_add: 2,
            delay_expiration_timestamp: 0,
        });
        assert_eq!(2, queue.len());

        let result0 = queue.peek(0).unwrap();
        result0.liquidity_to_add = 10;
        assert_eq!(10, queue.items[0].liquidity_to_add);

        let result1 = queue.peek(1).unwrap();
        result1.liquidity_to_add = 20;
        assert_eq!(20, queue.items[1].liquidity_to_add);
    }
}
