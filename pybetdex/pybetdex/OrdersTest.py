import uuid
from datetime import datetime, timedelta
import unittest
from uuid import uuid4

from pybetdex.Orders import PriceLevelSideOrders, Order, OrderBook

DEFAULT_STAKE = 100
DEFAULT_PRICE = 2.0
DEFAULT_OUTCOME_INDEX = 0


def _build_order(
    placed: datetime,
    backers_stake: int = DEFAULT_STAKE,
    price: float = DEFAULT_PRICE,
    outcome_index: int = DEFAULT_OUTCOME_INDEX,
    for_outcome: bool = True,
    is_virtual: bool = False,
):
    return Order(
        uuid4(),
        placed,
        backers_stake,
        price,
        outcome_index,
        for_outcome,
        backers_stake,
        is_virtual,
    )


class PriceLevelSideOrdersTest(unittest.TestCase):
    DT = datetime.now()
    ORDERED_DATETIMES = [
        DT,
        DT + timedelta(seconds=1),
        DT + timedelta(seconds=2),
        DT + timedelta(seconds=3),
    ]

    def test_order_correctly(self):
        orders = PriceLevelSideOrders()
        dt = datetime.now()

        o1, o2, o3, o4 = (
            _build_order(placed=dt),
            _build_order(placed=dt + timedelta(seconds=1)),
            _build_order(placed=dt + timedelta(seconds=2)),
            _build_order(placed=dt + timedelta(seconds=3)),
        )

        orders.put(o2)
        orders.put(o1)
        orders.put(o3)
        orders.put(o4)

        self.assertEqual(orders.pop(), o1)
        self.assertEqual(orders.pop(), o2)
        self.assertEqual(orders.pop(), o3)
        self.assertEqual(orders.pop(), o4)

    def test_peek_and_pop(self):
        orders = PriceLevelSideOrders()
        dt = datetime.now()
        o1 = _build_order(placed=dt)

        self.assertEqual(orders.peek(), None)
        self.assertEqual(orders.pop(), None)

        orders.put(o1)
        self.assertEqual(orders.peek(), o1)
        self.assertEqual(orders.pop(), o1)
        self.assertEqual(orders.peek(), None)
        self.assertEqual(orders.pop(), None)

    def test_get_virtual_orders(self):
        orders = PriceLevelSideOrders()
        dt = datetime.now()
        real = _build_order(placed=dt)
        virtual_1 = _build_order(placed=dt + timedelta(seconds=1), is_virtual=True)
        virtual_2 = _build_order(placed=dt + timedelta(seconds=1), is_virtual=True)

        orders.put(real)
        self.assertEqual(len(orders.get_virtual_orders()), 0)
        orders.put(virtual_1)
        self.assertEqual(len(orders.get_virtual_orders()), 1)
        orders.put(virtual_2)
        virtual_orders = orders.get_virtual_orders()
        self.assertTrue(virtual_1 in virtual_orders)
        self.assertTrue(virtual_2 in virtual_orders)


class OrderBookNoCrossmatchTest(unittest.TestCase):
    def test_match_single_order(self):
        ob = OrderBook()
        making_order = _build_order(datetime.now())
        matches = ob.match_or_put(making_order)
        self.assertEqual(len(matches), 0)
        self.assertIsNotNone(
            ob.bids_by_outcome[DEFAULT_OUTCOME_INDEX][DEFAULT_PRICE].peek()
        )
        taking_order = _build_order(datetime.now(), for_outcome=False)
        matches = ob.match_or_put(taking_order)
        self.assertEqual(len(matches), 1)
        match = matches[0]
        self.assertEqual(match.matched_price, DEFAULT_PRICE)
        self.assertEqual(match.matched_backer_stake, DEFAULT_STAKE)
        self.assertTrue(match.making_order_id, making_order.id)
        self.assertTrue(match.taking_order_id, taking_order.id)
        self.assertTrue(making_order.completely_matched)
        self.assertTrue(taking_order.completely_matched)

    def test_match_two_orders_different_price_level_fully_taking_order(self):
        ob = OrderBook()

        making_order_best = _build_order(datetime.now(), price=1.8, for_outcome=False)
        matches = ob.match_or_put(making_order_best)
        self.assertEqual(len(matches), 0)
        self.assertIsNotNone(ob.offers_by_outcome[DEFAULT_OUTCOME_INDEX][1.8].peek())

        making_order_worst = _build_order(datetime.now(), price=1.5, for_outcome=False)
        matches = ob.match_or_put(making_order_worst)
        self.assertEqual(len(matches), 0)
        self.assertIsNotNone(ob.offers_by_outcome[DEFAULT_OUTCOME_INDEX][1.5].peek())

        taking_order = _build_order(datetime.now(), price=1.4)
        matches = ob.match_or_put(taking_order)
        self.assertEqual(len(matches), 1)
        match = matches[0]
        self.assertEqual(match.matched_price, making_order_best.price)
        self.assertEqual(match.matched_backer_stake, DEFAULT_STAKE)

        self.assertTrue(match.making_order_id, making_order_best.id)
        self.assertTrue(match.taking_order_id, taking_order.id)
        self.assertTrue(making_order_best.completely_matched)
        self.assertTrue(taking_order.completely_matched)

    def test_match_two_orders_different_price_level_partially_making_order(self):
        ob = OrderBook()

        making_order_worst = _build_order(datetime.now(), price=1.5, for_outcome=False)
        matches = ob.match_or_put(making_order_worst)
        self.assertEqual(len(matches), 0)
        self.assertIsNotNone(ob.offers_by_outcome[DEFAULT_OUTCOME_INDEX][1.5].peek())

        making_order_best = _build_order(datetime.now(), price=1.8, for_outcome=False)
        matches = ob.match_or_put(making_order_best)
        self.assertEqual(len(matches), 0)
        self.assertIsNotNone(ob.offers_by_outcome[DEFAULT_OUTCOME_INDEX][1.8].peek())

        taking_order = _build_order(datetime.now(), price=1.4, backers_stake=66)
        matches = ob.match_or_put(taking_order)
        self.assertEqual(len(matches), 1)
        match = matches[0]
        self.assertEqual(match.matched_price, making_order_best.price)
        self.assertEqual(match.matched_backer_stake, 66)

        self.assertTrue(match.making_order_id, making_order_best.id)
        self.assertTrue(match.taking_order_id, taking_order.id)
        self.assertFalse(making_order_best.completely_matched)
        self.assertEqual(making_order_best.unmatched_backer_stake, 34)
        self.assertTrue(taking_order.completely_matched)

    def test_match_two_orders_different_price_level_partially_taking_order(self):
        ob = OrderBook()

        making_order_best = _build_order(
            datetime.now(), price=1.8, backers_stake=58, for_outcome=False
        )
        matches = ob.match_or_put(making_order_best)
        self.assertEqual(len(matches), 0)
        self.assertIsNotNone(ob.offers_by_outcome[DEFAULT_OUTCOME_INDEX][1.8].peek())

        making_order_worst = _build_order(datetime.now(), price=1.5, for_outcome=False)
        matches = ob.match_or_put(making_order_worst)
        self.assertEqual(len(matches), 0)
        self.assertIsNotNone(ob.offers_by_outcome[DEFAULT_OUTCOME_INDEX][1.5].peek())

        taking_order = _build_order(datetime.now(), price=1.4)
        matches = ob.match_or_put(taking_order)
        self.assertEqual(len(matches), 2)
        first_match = matches[0]
        self.assertEqual(first_match.matched_price, making_order_best.price)
        self.assertEqual(first_match.matched_backer_stake, 58)
        self.assertTrue(first_match.making_order_id, making_order_best.id)
        self.assertTrue(first_match.taking_order_id, taking_order.id)

        second_match = matches[1]
        self.assertEqual(second_match.matched_price, making_order_worst.price)
        self.assertEqual(second_match.matched_backer_stake, 42)
        self.assertTrue(second_match.making_order_id, making_order_worst.id)
        self.assertTrue(second_match.taking_order_id, taking_order.id)

        self.assertTrue(making_order_best.completely_matched)
        self.assertTrue(taking_order.completely_matched)
        self.assertTrue(making_order_worst.unmatched_backer_stake, 58)

    def test_match_two_orders_other_side_different_price_level_partially_taking_order(
        self,
    ):
        ob = OrderBook()

        making_order_best = _build_order(datetime.now(), price=1.3, backers_stake=71)
        matches = ob.match_or_put(making_order_best)
        self.assertEqual(len(matches), 0)
        self.assertIsNotNone(ob.bids_by_outcome[DEFAULT_OUTCOME_INDEX][1.3].peek())

        making_order_worst = _build_order(datetime.now(), price=1.9, backers_stake=20)
        matches = ob.match_or_put(making_order_worst)
        self.assertEqual(len(matches), 0)
        self.assertIsNotNone(ob.bids_by_outcome[DEFAULT_OUTCOME_INDEX][1.9].peek())

        taking_order = _build_order(datetime.now(), price=2.4, for_outcome=False)
        matches = ob.match_or_put(taking_order)
        self.assertEqual(len(matches), 2)
        first_match = matches[0]
        self.assertEqual(first_match.matched_price, making_order_best.price)
        self.assertEqual(first_match.matched_backer_stake, 71)
        self.assertTrue(first_match.making_order_id, making_order_best.id)
        self.assertTrue(first_match.taking_order_id, taking_order.id)

        second_match = matches[1]
        self.assertEqual(second_match.matched_price, making_order_worst.price)
        self.assertEqual(second_match.matched_backer_stake, 20)
        self.assertTrue(second_match.making_order_id, making_order_worst.id)
        self.assertTrue(second_match.taking_order_id, taking_order.id)

        self.assertTrue(making_order_best.completely_matched)
        self.assertTrue(making_order_worst.completely_matched)
        self.assertFalse(taking_order.completely_matched)
        self.assertTrue(taking_order.unmatched_backer_stake, 9)

    def test_no_match(self):
        ob = OrderBook()
        matches = ob.match_or_put(_build_order(datetime.now(), price=2.5))
        self.assertEqual(len(matches), 0)
        matches = ob.match_or_put(
            _build_order(datetime.now(), price=2.1, for_outcome=False)
        )
        self.assertEqual(len(matches), 0)


class TwoWayCrossmatchTest(unittest.TestCase):
    def test_two_way_market_no_offers(self):
        ob = OrderBook()
        ob.match_or_put(
            _build_order(datetime.now(), price=5, for_outcome=False),
            cross_matching=True,
        )
        taking_order = _build_order(
            datetime.now(), price=1.25, for_outcome=False, outcome_index=1
        )
        matches = ob.match_or_put(taking_order, cross_matching=True)
        # with no cross-matching, we would have no matches (there is no back for outcome 1)
        self.assertEqual(len(matches), 2)
        for match in matches:
            self.assertTrue(
                (match.making_order_is_virtual and not match.taking_order_is_virtual)
                or (
                    (
                        not match.making_order_is_virtual
                        and match.taking_order_is_virtual
                    )
                )
            )

    def test_two_way_market_worse_offers(self):
        ob = OrderBook()
        matches = ob.match_or_put(
            _build_order(datetime.now(), price=5, for_outcome=False),
            cross_matching=True,
        )
        self.assertEqual(len(matches), 0)
        matches = ob.match_or_put(
            _build_order(datetime.now(), price=1.30, for_outcome=True, outcome_index=1),
            cross_matching=True,
        )
        self.assertEqual(len(matches), 0)
        taking_order = _build_order(
            datetime.now(), price=1.40, for_outcome=False, outcome_index=1
        )
        matches = ob.match_or_put(taking_order, cross_matching=True)
        # with no cross-matching, we would have matched the taking order at 1.30 (worse odds)
        self.assertEqual(len(matches), 2)
        for match in matches:
            if match.taking_order_id == taking_order.id:
                better_match_than_without_cross_match = match.matched_price < 1.30
                self.assertTrue(better_match_than_without_cross_match)
            self.assertTrue(
                (match.making_order_is_virtual and not match.taking_order_is_virtual)
                or (
                    (
                        not match.making_order_is_virtual
                        and match.taking_order_is_virtual
                    )
                )
            )


class BetfairExampleCrossmatchTest(unittest.TestCase):

    newcastle_outcome_index = 0
    chelsea_outcome_index = 1
    the_draw_outcome_index = 2

    def test_betfair_lay_example(self):
        """
        Test the example betfair lay scenario (see  https://docs.developer.betfair.com/display/1smk3cen4v3lu3yomq5qye0ni/Additional+Information)

        :return: None
        """
        order_book = self._generate_betfair_example_book()

        # the big lay order on the draw @ 1000
        big_lay_draw_order = _build_order(
            datetime.now(),
            backers_stake=1_000_000,  # 1M cents = 10K
            price=1000,
            for_outcome=False,
            outcome_index=self.the_draw_outcome_index,
        )

        matches = order_book.match_or_put(big_lay_draw_order, True)

        # these are ordered with Python implementation of list
        matches_big_order_taking = [
            match for match in matches if match.taking_order_id == big_lay_draw_order.id
        ]

        self.assertEqual(len(matches_big_order_taking), 5)

        self.assertEqual(matches_big_order_taking[0].matched_price, 6.0)
        self.assertEqual(matches_big_order_taking[0].matched_backer_stake, 7500)
        self.assertEqual(matches_big_order_taking[0].making_order_is_virtual, True)

        self.assertEqual(matches_big_order_taking[1].matched_price, 10.0)
        self.assertEqual(matches_big_order_taking[1].matched_backer_stake, 10000)
        self.assertEqual(matches_big_order_taking[1].making_order_is_virtual, False)

        self.assertEqual(matches_big_order_taking[2].matched_price, 12.0)
        self.assertEqual(matches_big_order_taking[2].matched_backer_stake, 1250)
        self.assertEqual(matches_big_order_taking[2].making_order_is_virtual, True)

        self.assertEqual(matches_big_order_taking[3].matched_price, 50)
        self.assertEqual(matches_big_order_taking[3].matched_backer_stake, 5000)
        self.assertEqual(matches_big_order_taking[3].making_order_is_virtual, False)

        self.assertEqual(matches_big_order_taking[4].matched_price, 1000.0)
        self.assertEqual(matches_big_order_taking[4].matched_backer_stake, 200)
        self.assertEqual(matches_big_order_taking[4].making_order_is_virtual, False)

    def _generate_betfair_example_book(self):
        all_orders = dict()
        ob = OrderBook(outcomes=3)

        def _add_order(price, backers_stake, outcome_index, for_outcome):
            order = _build_order(
                datetime.now(),
                price=price,
                backers_stake=backers_stake,
                outcome_index=outcome_index,
                for_outcome=for_outcome,
            )

            all_orders[order.id] = order

            matches = ob.match_or_put(order, cross_matching=True)
            if len(matches) != 0:
                for match in matches:
                    if match.taking_order_is_virtual:
                        print(
                            f"Matched a virtual order taking {match.matched_backer_stake} @ {match.matched_price} from [{all_orders[match.making_order_id]}]"
                        )
                    elif match.making_order_is_virtual:
                        print(
                            f"Matched [{all_orders[match.taking_order_id]}] taking {match.matched_backer_stake} @ {match.matched_price} from a virtual order"
                        )
                    else:
                        print(
                            f"Matched [{all_orders[match.taking_order_id]}] taking {match.matched_backer_stake} @ {match.matched_price} from [{all_orders[match.making_order_id]}]"
                        )

                self.fail(f"Matched more than zero orders.")

        # Newcastle book

        _add_order(1000, 200, self.newcastle_outcome_index, True)
        _add_order(15, 7500, self.newcastle_outcome_index, True)
        _add_order(4, 12000, self.newcastle_outcome_index, True)
        _add_order(2, 30000, self.newcastle_outcome_index, False)
        _add_order(1.5, 20000, self.newcastle_outcome_index, False)
        _add_order(1.01, 99900, self.newcastle_outcome_index, False)

        # Chelsea book

        _add_order(1000, 200, self.chelsea_outcome_index, True)
        _add_order(20, 1000, self.chelsea_outcome_index, True)
        _add_order(5, 15000, self.chelsea_outcome_index, True)
        _add_order(3, 15000, self.chelsea_outcome_index, False)
        _add_order(2.4, 25000, self.chelsea_outcome_index, False)
        _add_order(1.01, 99900, self.chelsea_outcome_index, False)

        # The Draw book

        _add_order(1000, 200, self.the_draw_outcome_index, True)
        _add_order(50, 5000, self.the_draw_outcome_index, True)
        _add_order(10, 10000, self.the_draw_outcome_index, True)
        _add_order(5, 15000, self.the_draw_outcome_index, False)
        _add_order(3, 25000, self.the_draw_outcome_index, False)
        _add_order(1.01, 99900, self.the_draw_outcome_index, False)

        return ob


if __name__ == "__main__":
    unittest.main()
