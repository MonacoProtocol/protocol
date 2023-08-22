from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from functools import total_ordering
from pprint import PrettyPrinter
from queue import PriorityQueue
from typing import Dict, Optional, List
from uuid import UUID, uuid4

import math


@dataclass
@total_ordering
class Order:
    """

    Order Class
    -----------

    This class represents an order in a betting exchange.

    Attributes:
        id (UUID): The unique identifier for the order.
        placed_time (datetime): The time when the order was placed.
        backer_stake (int): In cents. The liability of the backing counterparty if this order is matched fully.
                            (if for_outcome is true, this is the liability of the placer of this order)
        price (float): The decimal price sought by the order placer.
        outcome_index (int): The index of the outcome for the order.
        for_outcome (bool): Indicates whether the order is for or against the outcome specified by the outcome_index.
                            (for_outcome == True -> this is a back/buy order, otherwise this is a lay/sell order)
        unmatched_backer_stake (int): In cents. The backer's stake remaining to be matched for this order.
        is_virtual (bool): Indicates whether the order is virtual or not.

    Properties:
        completely_matched (bool): Returns True if the order is completely matched, False otherwise.

    Methods:
        __str__(): Returns a string representation of the order.

    """

    id: UUID
    placed_time: datetime
    backer_stake: int
    price: float
    outcome_index: int
    for_outcome: bool
    unmatched_backer_stake: int
    is_virtual: bool = False

    @property
    def completely_matched(self):
        return self.unmatched_backer_stake == 0

    @property
    def partially_matched(self):
        return self.unmatched_backer_stake != self.backer_stake

    def __str__(self):
        return f"{self.unmatched_backer_stake}@{self.price:.2f} {'back' if self.for_outcome else 'lay'} {self.outcome_index}"

    def __lt__(self, other):
        return self.placed_time < other.placed_time

    def __gt__(self, other):
        return self.placed_time > other.placed_time


@dataclass
class Match:
    """

    The Match class represents a match between two orders in a trading system.

    Attributes:
        making_order_id (UUID): The unique identifier of the making order. (the order of the making counterparty, i.e. an order that was not completely matched upon arrival in the book, i.e. is MAKING liquidity for the book)
        taking_order_id (UUID): The unique identifier of the taking order. (the order of the taking counterparty, i.e. an order that is being at least partially matched upon arrival in the book, i.e. is TAKING liquidity from the book)
        matched_price (float): The price at which the orders were matched.
        matched_backer_stake (int): In cents. The liability of the backing party of the match.
        unmatched_backer_stake_before_executing_making_order (int): In cents. The backer's stake of the making order that was left to be matched before this match execution
        unmatched_backer_stake_before_executing_taking_order (int): In cents. The backer's stake of the taking order that was left to be matched before this match execution
        unmatched_backer_stake_after_executing_making_order (int): In cents. The backer's stake of the making order that is left to be matched after this match execution
        unmatched_backer_stake_after_executing_taking_order (int): In cents. The backer's stake of the taking order that is left to be matched after this match execution
        making_order_is_virtual (bool): Indicates whether the making order is virtual.
        taking_order_is_virtual (bool): Indicates whether the taking order is virtual.


    Methods:
    - from_orders(taking_order: Order, making_order: Order, matched_backer_stake: int) -> Match: Creates a Match instance from two orders and the matched stake amount.
    """

    making_order_id: UUID
    taking_order_id: UUID
    matched_price: float
    matched_backer_stake: int
    unmatched_backer_stake_before_executing_making_order: int
    unmatched_backer_stake_before_executing_taking_order: int
    unmatched_backer_stake_after_executing_making_order: int
    unmatched_backer_stake_after_executing_taking_order: int
    making_order_is_virtual: bool = False
    taking_order_is_virtual: bool = False

    @staticmethod
    def from_orders(
        taking_order: Order, making_order: Order, matched_backer_stake: int
    ) -> "Match":
        return Match(
            making_order_id=making_order.id,
            taking_order_id=taking_order.id,
            matched_price=making_order.price,
            matched_backer_stake=matched_backer_stake,
            unmatched_backer_stake_before_executing_making_order=making_order.unmatched_backer_stake,
            unmatched_backer_stake_before_executing_taking_order=taking_order.unmatched_backer_stake,
            unmatched_backer_stake_after_executing_making_order=making_order.unmatched_backer_stake
            - matched_backer_stake,
            unmatched_backer_stake_after_executing_taking_order=taking_order.unmatched_backer_stake
            - matched_backer_stake,
            taking_order_is_virtual=taking_order.is_virtual,
            making_order_is_virtual=making_order.is_virtual,
        )

    def pretty_print(self):
        PrettyPrinter().pprint(self)


class PriceLevelSideOrders:
    """

    Class PriceLevelSideOrders

    This class represents a collection of orders on a price level side. It uses a priority queue to store the orders for the same price, with the highest priority being the oldest order.

    Methods:
        - __init__(): Initializes an instance of PriceLevelSideOrders.
        - peek() -> Optional[Order]: Returns the top order without removing it from the collection.
        - pop() -> Optional[Order]: Removes and returns the top order from the collection.
        - put(order: Order): Adds an order to the collection.
        - put_all(orders: List[Order]): Adds multiple orders to the collection.
        - empty() -> bool: Checks if the collection is empty.
        - clear_virtual_orders(): Removes all virtual orders from the collection.
        - get_virtual_orders() -> List[Order]: Returns a list of all virtual orders in the collection.
        - __str__() -> str: Returns a string representation of the PriceLevelSideOrders object.

    Attributes:
        - _priority_queue: A PriorityQueue object used to store the orders.

    Example usage:
    ```python
    price_level_orders = PriceLevelSideOrders()

    # Add an order
    order1 = Order(...)
    price_level_orders.put(order1)

    # Peek at the top order
    top_order = price_level_orders.peek()

    # Remove and retrieve the top order
    popped_order = price_level_orders.pop()

    # Check if the collection is empty
    is_empty = price_level_orders.empty()

    # Clear virtual orders
    price_level_orders.clear_virtual_orders()

    # Get all virtual orders
    virtual_orders = price_level_orders.get_virtual_orders()

    # Print the object representation
    print(price_level_orders)
    ```
    """

    def __init__(self):
        self._priority_queue = PriorityQueue()

    def peek(self) -> Optional[Order]:
        if self._priority_queue.empty():
            return None
        temp = self.pop()
        self._priority_queue.put(temp)
        return temp

    def pop(self) -> Optional[Order]:
        return None if self._priority_queue.empty() else self._priority_queue.get()

    def put(self, order: Order):
        self._priority_queue.put(order)

    def put_all(self, orders: List[Order]):
        for item in orders:
            self.put(item)

    @property
    def empty(self) -> bool:
        return self._priority_queue.empty()

    def clear_virtual_orders(self):
        non_virtual = [
            order for order in self._priority_queue.queue if not order.is_virtual
        ]
        self._priority_queue.queue.clear()
        self.put_all(non_virtual)

    def get_virtual_orders(self) -> List[Order]:
        return [order for order in self._priority_queue.queue if order.is_virtual]

    def __str__(self):
        return (
            "PriceLevelSideOrders("
            + " ".join([f"{k}={v}" for k, v in self.__dict__.items()])
            + ")"
        )


@dataclass
class OrderBook:
    """
    Class representing an order book for a Market.

    The market outcomes are assumed to be mutually exclusive and exhaustive (i.e. at settlement time, one and only one
    outcome will be settled as winner, and the rest as losers).

    Attributes:
        outcomes (int): The number of possible outcomes for the Market.
        bids_by_outcome (Dict[int, Dict[float, PriceLevelSideOrders]]): A dictionary that stores bids for each outcome
            and price levels.
        offers_by_outcome (Dict[int, Dict[float, PriceLevelSideOrders]]): A dictionary that stores offers for each
            outcome and price levels.

    Methods:
        match_or_put: Matches an order against the order book or adds it to the order book if there is no matching
            opportunity (or if it's been just partially matched)
    """

    outcomes: int = 2
    bids_by_outcome: Dict[int, Dict[float, PriceLevelSideOrders]] = field(
        default_factory=lambda: defaultdict(
            lambda: defaultdict(lambda: PriceLevelSideOrders())
        )
    )
    offers_by_outcome: Dict[int, Dict[float, PriceLevelSideOrders]] = field(
        default_factory=lambda: defaultdict(
            lambda: defaultdict(lambda: PriceLevelSideOrders())
        )
    )

    def match_or_put(self, order: Order, cross_matching: bool = False) -> List[Match]:
        """
        :param order: An instance of Order class representing the order to be matched or put.
        :param cross_matching: A boolean indicating whether cross-matching is allowed or not.
        :return: A list of Match instances representing the matches made for the given order.
        """
        assert 0 <= order.outcome_index < self.outcomes
        assert not (cross_matching and order.is_virtual)
        return self._match_or_put(order, cross_matching, not order.is_virtual)

    def _match_or_put(
        self, order: Order, cross_matching: bool, clear_virtual_orders: bool
    ) -> List[Match]:

        matches = []

        other_side_orders: Dict[float, PriceLevelSideOrders] = self._get_orders(
            order.outcome_index, not order.for_outcome
        )

        while order.unmatched_backer_stake > 0:
            # this is the main matching loop. We can break out from this loop for 3 reasons (marked in the code):
            # 1. there are no more (virtual or real) executable orders. Whatever is left unmatched of the order
            #    will be added to the book
            # 2. the taking order is completely matched and the last making order that was matched against is also
            #    completely matched
            # 3. the order is completely matched but the last making order that was matched against is only
            #    partially matched, so it will need to be re-added to the book

            if (
                clear_virtual_orders
            ):  # we clear virtual orders when the taking order is not virtual
                self._clear_virtual_orders()
            if cross_matching:
                # this is the main novelty to the matching algo: adding virtual orders to be matched against real
                # orders
                self._generate_virtual_orders(order)

            maybe_best_executable_making_order: Optional[
                Order
            ] = self._find_best_executable_making_order(
                other_side_orders, order.price, order.for_outcome
            )

            if (
                not maybe_best_executable_making_order
            ):  # Exit reason number 1: no more executable prices
                # add order to order book (with whatever unmatched stake is left)
                assert not order.completely_matched
                self._put(order)
                if clear_virtual_orders:
                    self._clear_virtual_orders()
                break

            best_executable_making_order = maybe_best_executable_making_order  # rename variable to make clear is not None
            assert best_executable_making_order is not None  # check it anyway

            # Invariant: a virtual order never matches against a virtual order
            assert not (order.is_virtual and best_executable_making_order.is_virtual)

            # Invariant: virtual orders are ephemeral: whenever they are matched fully or partially, they are removed
            # forcibly from the book when the taking order, during the match of which they were created, finishes matching
            # In other words, they cannot stay on the book partially matched
            if order.is_virtual:
                # (by the way: it means we are matching a virtual dual order)
                assert not order.partially_matched

            if best_executable_making_order.is_virtual:
                assert not best_executable_making_order.partially_matched

            if (
                best_executable_making_order.unmatched_backer_stake
                <= order.unmatched_backer_stake
            ):
                # match fully the best executable making order, partially or fully the taking order

                matched_backer_stake = (
                    best_executable_making_order.unmatched_backer_stake
                )
                match = Match.from_orders(
                    order, best_executable_making_order, matched_backer_stake
                )

                # adjust orders stakes
                best_executable_making_order.unmatched_backer_stake = 0
                order.unmatched_backer_stake -= (
                    matched_backer_stake  # may be 0, must be non-negative
                )

                assert match.unmatched_backer_stake_after_executing_making_order == 0
                assert order.unmatched_backer_stake >= 0
                matches.append(match)

                # making order is fully matched, no need to add it back to the order book

                if best_executable_making_order.is_virtual:
                    # match virtual dual orders with real ones, too. No need to calculate the stake, as the virtual making
                    # order has been completely matched (hence the other virtual orders will match completely too)

                    virtual_dual_orders = self._find_virtual_dual_orders(
                        order.outcome_index, order.for_outcome
                    )

                    # sanity check: if the best executable making order is virtual, we expect to find a virtual order
                    # on all the outcome indexes different from the taking order one, on the opposide side of the taking
                    # order and nothing on the taking order outcome index

                    assert all(virtual_dual_orders.values())
                    assert order.outcome_index not in virtual_dual_orders
                    for virtual_dual_order in virtual_dual_orders.values():
                        assert virtual_dual_order.is_virtual
                        assert virtual_dual_order.for_outcome == (not order.for_outcome)

                    # The virtual dual orders has been built to match against real order, there's nothing more to do
                    # than just matching them
                    for virtual_dual_order in virtual_dual_orders.values():
                        matches.extend(self.match_or_put(virtual_dual_order, False))

                if order.completely_matched:
                    # Exit reason number 2: the taking order is completely matched against the making order (which is
                    # also completely matched)
                    break
                else:
                    # the taking order is only partially matched, there may be more making orders to match with
                    continue

            else:  # best_executable_making_order.unmatched_stake > order.unmatched_stake ->
                # match partially the best executable making order, fully the taking order

                matched_backer_stake = order.unmatched_backer_stake
                match = Match.from_orders(
                    order, best_executable_making_order, matched_backer_stake
                )

                # adjust orders stakes
                best_executable_making_order.unmatched_backer_stake -= (
                    order.unmatched_backer_stake
                )
                order.unmatched_backer_stake = 0

                # the making order was only partially matched so:
                assert (
                    not best_executable_making_order.completely_matched
                )  # there is leftover unmatched stake

                matches.append(match)

                if best_executable_making_order.is_virtual:
                    # match virtual orders with real ones, too. We need to calculate the stakes, as the virtual making
                    # order has been only partially matched (hence the other virtual orders will match partially too)
                    # to calculate the stakes, we need the following quantity
                    stake_times_price = math.floor(
                        best_executable_making_order.backer_stake
                        * best_executable_making_order.price
                    )

                    virtual_dual_orders = self._find_virtual_dual_orders(
                        order.outcome_index, order.for_outcome
                    )

                    # sanity check: if the best executable making order is virtual, we expect to find a virtual order
                    # on all the outcome indexes different from the taking order one, on the same side of the taking
                    # order and nothing on the taking order outcome index

                    assert all(virtual_dual_orders.values())
                    assert order.outcome_index not in virtual_dual_orders
                    for virtual_dual_order in virtual_dual_orders.values():
                        assert virtual_dual_order.is_virtual
                        assert virtual_dual_order.for_outcome == (not order.for_outcome)
                        # remember, the taking order is virtual but hasn't matched completely. This means that to
                        # offset it, we need to adjust the stakes on the virtual dual orders
                        adjusted_stake = float(
                            stake_times_price / virtual_dual_order.price
                        )
                        virtual_dual_order.unmatched_backer_stake = adjusted_stake
                        virtual_dual_order.backer_stake = adjusted_stake

                    # The virtual dual orders has been built to match against real order, now that the stake has been adjusted,
                    # there's nothing more to do than just matching them
                    for virtual_dual_order in virtual_dual_orders.values():
                        matches.extend(self.match_or_put(virtual_dual_order, False))

                else:
                    self._put(
                        best_executable_making_order
                    )  # put back the making order to the order book

                # Exit reason number 3: the taking order is completely matched
                break

        if clear_virtual_orders:
            self._clear_virtual_orders()

        return matches

    # region private methods

    def _get_bids(self, outcome_index: int) -> Dict[float, PriceLevelSideOrders]:
        return self.bids_by_outcome[outcome_index]

    def _get_offers(self, outcome_index: int) -> Dict[float, PriceLevelSideOrders]:
        return self.offers_by_outcome[outcome_index]

    def _get_orders(
        self, outcome_index: int, get_bids: bool
    ) -> Dict[float, PriceLevelSideOrders]:
        return (
            self._get_bids(outcome_index)
            if get_bids
            else self._get_offers(outcome_index)
        )

    def _put(self, order: Order):
        same_side_orders = self._get_orders(order.outcome_index, order.for_outcome)
        same_side_orders[order.price].put(order)

    def _generate_virtual_orders(self, taking_order: Order):
        # (make sure to read about virtual matching order and virtual dual orders in the readme)

        # - if taking order is backing, the virtual matching order will need to be laying
        # - the virtual matching order will have virtual duals on the same side (lay side in this case)
        # - to add virtual duals on the lay side, we need corresponding real orders on the back side
        # in other words: we need to look for real orders on the same side of the taking order

        # let's put these in variables for clarity
        virtual_matching_order_for_outcome = not taking_order.for_outcome
        virtual_dual_orders_for_outcome = virtual_matching_order_for_outcome
        other_outcomes_real_orders_for_outcome = not virtual_dual_orders_for_outcome

        other_outcomes_real_orders_by_outcome = {
            outcome: price_levels
            for outcome, price_levels in (
                self.bids_by_outcome
                if other_outcomes_real_orders_for_outcome
                else self.offers_by_outcome
            ).items()
            if outcome != taking_order.outcome_index
        }

        # now we need to find the best executable real orders (those that would be executed against virtual dual orders)
        # in this case, the virtual dual orders will act as the taking orders
        other_outcomes_best_real_prices_by_outcome: Dict[int, Optional[float]] = {
            outcome: self._find_best_executable_making_price(
                making_orders=real_orders_price_levels,
                taking_price=None,
                taking_is_backing=virtual_dual_orders_for_outcome,
            )
            for outcome, real_orders_price_levels in other_outcomes_real_orders_by_outcome.items()
        }

        # these are all the indexes of the other outcomes
        all_other_outcome_indexes = set(range(self.outcomes)) - {
            taking_order.outcome_index
        }

        if (
            not other_outcomes_best_real_prices_by_outcome
            or all_other_outcome_indexes
            != set(
                other_outcomes_best_real_prices_by_outcome.keys()
            )  # we need real prices on ALL the outcomes
            or any(
                maybe_price is None
                for maybe_price in other_outcomes_best_real_prices_by_outcome.values()
            )
        ):
            # not all the outcomes have orders, no virtual order can be created
            return

        other_outcomes_best_real_orders_by_outcome: Dict[int, Order] = {
            outcome: self._get_orders(outcome, taking_order.for_outcome)[price].peek()
            for outcome, price in other_outcomes_best_real_prices_by_outcome.items()
        }

        other_outcomes_best_real_orders_implied_probabilities = [
            1.0 / o.price for o in other_outcomes_best_real_orders_by_outcome.values()
        ]

        other_outcomes_best_real_orders_total_book = sum(
            other_outcomes_best_real_orders_implied_probabilities
        )
        if other_outcomes_best_real_orders_total_book > 0.99:
            return  # cannot create virtual order as cannot create a 100% book

        virtual_matching_order_price = round(
            1.0 / (1.0 - sum(other_outcomes_best_real_orders_implied_probabilities)), 2
        )

        virtual_matching_order_stake = math.floor(
            min(
                [
                    o.price * o.unmatched_backer_stake
                    for o in other_outcomes_best_real_orders_by_outcome.values()
                ]
            )
            / virtual_matching_order_price
        )

        assert (
            virtual_matching_order_stake >= 0
        ), f"Virtual matching order price {virtual_matching_order_price}, other ourcomes implied probs {other_outcomes_best_real_orders_implied_probabilities} , price * stakes {[o.price * o.backer_stake for o in other_outcomes_best_real_orders_by_outcome.values()]}"
        if virtual_matching_order_stake == 0:
            # no virtual orders can be created
            return

        # virtual matching order (other side wrt taking order)
        self._put(
            Order(
                uuid4(),
                datetime.now(),
                virtual_matching_order_stake,
                virtual_matching_order_price,
                taking_order.outcome_index,
                virtual_matching_order_for_outcome,
                virtual_matching_order_stake,
                True,
            )
        )

        # virtual dual orders (other side wrt taking order)
        for outcome, order in other_outcomes_best_real_orders_by_outcome.items():
            stake = math.floor(
                virtual_matching_order_stake
                * virtual_matching_order_price
                / order.price
            )
            self._put(
                Order(
                    uuid4(),
                    datetime.now(),
                    stake,
                    order.price,
                    outcome,
                    virtual_dual_orders_for_outcome,
                    stake,
                    True,
                )
            )

    def _find_virtual_dual_orders(
        self, taking_order_outcome_index: int, taking_is_backing
    ) -> Dict[int, Optional[Order]]:
        # we'll find virtual dual orders at the opposite side of the real taking order
        same_side_orders_by_outcome = {
            outcome_index: orders_by_price
            for outcome_index, orders_by_price in (
                self.offers_by_outcome if taking_is_backing else self.bids_by_outcome
            ).items()
            if outcome_index != taking_order_outcome_index
        }

        virtual_dual_orders = dict()
        for (
            outcome_index,
            price_level_orders_by_price,
        ) in same_side_orders_by_outcome.items():
            virtual_orders_for_this_outcome_index = []
            for price_level_orders in price_level_orders_by_price.values():
                virtual_orders_for_this_outcome_index.extend(
                    price_level_orders.get_virtual_orders()
                )
                # there should be at most one virtual dual order per price level: we add virtual orders, just one
                # per price level, and we remove them after each cycle in the matching phase
            assert len(virtual_orders_for_this_outcome_index) <= 1

            virtual_dual_orders[outcome_index] = (
                virtual_orders_for_this_outcome_index[0]
                if virtual_orders_for_this_outcome_index
                else None
            )

        return virtual_dual_orders

    @staticmethod
    def _find_best_executable_making_price(
        making_orders: Dict[float, PriceLevelSideOrders],
        taking_price: Optional[float],
        taking_is_backing: bool,
    ) -> Optional[float]:

        available_making_side_prices = [
            price for price, orders in making_orders.items() if not orders.empty
        ]

        def is_executable(price):
            if taking_price:
                return (
                    price >= taking_price
                    if taking_is_backing
                    else price <= taking_price
                )
            else:
                return True

        executable_other_side_prices = [
            price for price in available_making_side_prices if is_executable(price)
        ]

        if executable_other_side_prices:
            return (
                max(executable_other_side_prices)
                if taking_is_backing
                else min(executable_other_side_prices)
            )
        else:
            return None

    @staticmethod
    def _find_best_executable_making_order(
        making_orders: Dict[float, PriceLevelSideOrders],
        taking_price: float,
        taking_is_backing: bool,
    ) -> Optional[Order]:

        maybe_best_executable_price = OrderBook._find_best_executable_making_price(
            making_orders, taking_price, taking_is_backing
        )

        return (
            making_orders[maybe_best_executable_price].pop()
            if maybe_best_executable_price
            else None
        )

    def _clear_virtual_orders(self):
        for side_by_outcome in (self.bids_by_outcome, self.offers_by_outcome):
            for side in side_by_outcome.values():
                for orders in side.values():
                    orders.clear_virtual_orders()

    # endregion
