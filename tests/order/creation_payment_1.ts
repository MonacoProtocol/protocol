import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Creation Payment 1
 *
 * This test case covers situation when patron creates combination of for and against orders that result in refund.
 *
 * Scenario 1:
 *
 * Patron creates an order of X @ 3.00 for an outcome of the market with three outcomes.
 * Subsequently patron creates two orders of X @ 3.90 against the same outcome.
 * Patron's starting market position is [0, 0, 0] and final market position should be [-5.8*X, X, X].
 * First order should take payment of X. Second order should take 0.9*X as opposed to 2.9*X if it was created on its own.
 * Third order should take payment of 2.9*X as expected.
 * Total payment taken should be 5.8*X as opposed to 6.8*X if they were created each on their own.
 *
 */
describe("Order Creation Payment 1", () => {
  it("Scenario 1: partial payment for against after for", async () => {
    // Given
    const outcome = 0;
    const prices = [3.0, 4.9];

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(prices),
    ]);
    await market.airdrop(purchaser, 100.0);

    // Create For 10 @ 3.0 for Outcome A
    await market.forOrder(outcome, 10.0, prices[0], purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, prices[0]),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        {
          matched: [0, 0, 0],
          maxExposure: [0, 10, 10],
        },
        { len: 1, liquidity: 10, matched: 0 },
        10,
        90,
      ],
    );

    // Create Against 10 @ 4.9 for Outcome A
    await market.againstOrder(outcome, 10.0, prices[1], purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, prices[0]),
        market.getAgainstMatchingPool(outcome, prices[1]),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        {
          matched: [0, 0, 0],
          maxExposure: [39, 10, 10],
        },
        { len: 1, liquidity: 10, matched: 0 },
        { len: 1, liquidity: 10, matched: 0 },
        39,
        61,
      ],
    );

    // Create Against 10 @ 4.9 for Outcome A
    await market.againstOrder(outcome, 10.0, prices[1], purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, prices[0]),
        market.getAgainstMatchingPool(outcome, prices[1]),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        {
          matched: [0, 0, 0],
          maxExposure: [78, 10, 10],
        },
        { len: 1, liquidity: 10, matched: 0 },
        { len: 2, liquidity: 20, matched: 0 },
        78,
        22,
      ],
    );
  });
});
