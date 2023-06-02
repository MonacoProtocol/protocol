import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Creation Payment 2
 *
 * This test case covers situation when patron creates only for orders for different outcomes and recieves refund while doing so.
 *
 * Scenario 1:
 *
 * Patron creates an order of X @ 2.00 for each outcome of the market with three outcomes.
 * Patron's starting market position is [0, 0, 0] and final market position should be [-X, -X, -X].
 * First two orders should each take payment of X, while third should refund X. Total payment taken should be X.
 *
 * Scenario 2:
 *
 * Patron creates an order of X @ 3.00 for each outcome of the market with three outcomes.
 * Patron's starting market position is [0, 0, 0] and final market position should be [0, 0, 0].
 * First two orders should each take payment of X, while third should refund 2*X. Total payment taken should be 0.
 *
 * Scenario 3:
 *
 * Patron creates an order of X @ 4.00 for each outcome of the market with three outcomes.
 * Patron's starting market position is [0, 0, 0] and final market position should be [X, X, X].
 * First two orders should each take payment of X, while third should refund 2*X. Total payment taken should be 0.
 *
 */
describe("Order Creation Payment 2", () => {
  it("Scenario 1: for all outcomes 10.00 @ 2.00", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;
    const price = 2.0;

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    // Create For 10 for Outcome A
    await market.forOrder(outcomeA, 10.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeA, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        {
          matched: [0, 0, 0],
          maxExposure: [0, 10, 10],
          payment: 10,
        },
        { len: 1, liquidity: 10, matched: 0 },
        10,
        90,
      ],
    );

    // Create For 10 for Outcome B
    await market.forOrder(outcomeB, 10.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeB, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        {
          matched: [0, 0, 0],
          maxExposure: [10, 10, 20],
          payment: 20,
        },
        { len: 1, liquidity: 10, matched: 0 },
        20,
        80,
      ],
    );

    // Create For 10 for Outcome C
    await market.forOrder(outcomeC, 10.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeC, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        {
          matched: [0, 0, 0],
          maxExposure: [20, 20, 20],
          payment: 20,
        },
        { len: 1, liquidity: 10, matched: 0 },
        20,
        80,
      ],
    );
  });

  it("Scenario 2: for all outcomes 10.00 @ 3.00", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;
    const price = 3.0;

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    // Create For 10 for Outcome A
    await market.forOrder(outcomeA, 10.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeA, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        {
          matched: [0, 0, 0],
          maxExposure: [0, 10, 10],
          payment: 10,
        },
        { len: 1, liquidity: 10, matched: 0 },
        10,
        90,
      ],
    );

    // Create For 10 for Outcome B
    await market.forOrder(outcomeB, 10.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeB, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        {
          matched: [0, 0, 0],
          maxExposure: [10, 10, 20],
          payment: 20,
        },
        { len: 1, liquidity: 10, matched: 0 },
        20,
        80,
      ],
    );

    // Create For 10 for Outcome C
    await market.forOrder(outcomeC, 10.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeC, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        {
          matched: [0, 0, 0],
          maxExposure: [20, 20, 20],
          payment: 20,
        },
        { len: 1, liquidity: 10, matched: 0 },
        20,
        80,
      ],
    );
  });

  it("Scenario 3: for all outcomes 10.00 @ 4.00", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;
    const price = 4.0;

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    // Create For 10 for Outcome A
    await market.forOrder(outcomeA, 10.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeA, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        {
          matched: [0, 0, 0],
          maxExposure: [0, 10, 10],
          payment: 10,
        },
        { len: 1, liquidity: 10, matched: 0 },
        10,
        90,
      ],
    );

    // Create For 10 for Outcome B
    await market.forOrder(outcomeB, 10.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeB, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        {
          matched: [0, 0, 0],
          maxExposure: [10, 10, 20],
          payment: 20,
        },
        { len: 1, liquidity: 10, matched: 0 },
        20,
        80,
      ],
    );

    // Create For 10 for Outcome C
    await market.forOrder(outcomeC, 10.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeC, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        {
          matched: [0, 0, 0],
          maxExposure: [20, 20, 20],
          payment: 20,
        },
        { len: 1, liquidity: 10, matched: 0 },
        20,
        80,
      ],
    );
  });
});
