# BetDex Cross Matching algorithm

This repository contains a Python implementation of the cross-matching algorithm. By using cross-matching, an exchange can match orders across market outcomes without the need for a market agent to intervene. All orders have a better change of being matched earlier and/or against a better price. 

Even though the audience is expert, I would like to write just a couple of lines to agree on some jargon and give a 10000 feet view of the main idea behind the cross matching algorithm.

## Lingo, assumptions et similia

- I will use interchangeably the words buy, back, bet for an outcome to represent the intention of placing an order that, if matched, will result in a positive cash flow if the outcome that was bought, backed, bet for is verified.
Similarly, I will say sell, lay and bet against an outcome to signify orders with the opposite intention.
- I assume an order can be matched either partially or fully. When an order is received, I assume the system tries to immediately match it (or part of it) and, if that's not possible (or entirely possible) then the order (or part of it) is added to the book and can be matched against new orders.
- If an order is sitting on the book, I will say it's a making order (because it's making liquidity for the exchange). Conversely, an order in the process of being matched against other orders on the book will be said to be a taking order (because it takes liquidity off the exchange)
- I assume the book follows a price-time priority policy (oldest orders at the same price level have priority and best price execution favours taking orders)
- I assume the orders are matched one after another, not concurrently
- I didn't implement any order cancellation in this repository, as it doesn't affect the cross-matching algorithm
- I always consider the backer's stake as a measure of order quantity, even if the order is a lay order

## Cross matching

Cross-matching is based on the idea that, in an N outcomes market, backing an outcome is equivalent to laying all other N-1 at the same time (and conversely laying an outcome is equivalent to backing all the others at the same time). I will make the previous statement more precise:

- Given an N-outcomes market
- Given an order with backer's stake S, price p and a certain side 
- there exist N-1 backer's stakes S_1 ... S_{N-1} and N-1 prices p_1, ... p_{n-1} 
- such that having placed and matched the original order or all of the N-1 orders yields the same exact cash flow for all outcomes (i.e. fixed an outcome, the returns on that outcome are the same)

This means that a market agent could, at the same time, place the N orders (the original one and the derived N-1) and walk away with no profit and no loss (modulo the exchange commission, naturally)

It can be shown that the set of prices {p, p_1, ... p_{N-1}} must form a 100% book (i.e. sum_{i=1}^{N-1} 1/p_i + 1/p = 1.0)

In a nutshell, cross-matching works as follows:

- when matching a certain order X, take the best orders on the SAME SIDE of X and calculate what is the best equivalent order that could exist on the OPPOSITE side of X
- create virtual orders (i.e. pretend these orders are on the book). In particular I call:
  - matching virtual order the candidate virtual order on THE OPPOSITE side of X (equivalent to the real orders on the same side of X, but on other outcomes)
  - virtual dual orders the orders, on the OPPOSITE side of X on other outcomes, that would match with the real orders equivalent to the virtual matching order
- match accordingly, observing that the virtual orders, so to speak, "cancel out"


The rules to do this are:
- virtual orders are added to the book before matching (even partially) a real taking order 
- a virtual order matches always with a non virtual one
- virtual orders are ephemeral: after the real taking order has been matched (even partially), they are immediately removed from the book

Effectively, this means that we can reuse the same matching algorithm already existing on the exchange to match orders across different outcomes. 

There are obviously some small caveats that I hope will be clear from the implementation.


## Warnings

- This implementation has been written with the sole purpose of illustrating the algorithm, so:
  - it's not efficient
  - it's not elegant
  - it's full of sanity checks
  - in no means it's production-like code
- it relies on how Python works (i.e. lists are ordered, the PriorityQueue implementation has a certain behaviour ... ). Everything should be very close to the way any other language works, but caution is advised 
- data is accessed and modified sequentially, there is no notion of concurrency (bear in mind of side effects in the matching method)


