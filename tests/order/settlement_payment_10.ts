import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Settlement Payment 10
 *
 * All created orders remain unmatched when settlement happens.
 * Settlement should return payment amount for the orders to the wallet.
 *
 * This test case covers situation when patron creates a for order of $10.00 and an against order of $5.00 for the same market outcome at the same price.
 * Because same patron is creating both orders, some orders' payments and payouts can be reduced to complement eachother.
 * How much funds gets taken/refunded depends greatly on the order in which those best were made therefore we have four scenarios:
 * - for creation, against creation, against settlement, for settlement
 * - for creation, against creation, for settlement, against settlement
 * - against creation, for creation, against settlement, for settlement
 * - against creation, for creation, for settlement, against settlement
 *
 * All scenarios are characterised by:
 * - market's escrow changes sum up to zero
 * - patron's token account changes sum up to zero (we are still not collecting any fees - this will change)
 * - full payment taken for 1st creation and discounted payment for 2nd creation
 *
 * Difference orderween scenario lies in the amounts being transferred at each step:
 * - Scenario 1 (for against against for): -$10.00, $0.00,  $0.00, +$10.00
 * - Scenario 2 (for against for against): -$10.00, $0.00,  $0.00, +$10.00
 * - Scenario 2 (against for against for): -$15.00, $0.00, +$5.00, +$10.00
 * - Scenario 2 (against for for against): -$15.00, $0.00,  $0.00, +$15.00
 *
 */
describe("Order Settlement Payment 10", () => {
  // Create For 10, Create Against 5, Settle Against 5, Settle For 10
  it("Scenario 1: for against against for", async () => {
    // Given
    const outcome = 1;
    const price = 4.0;

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    // Create For 10, Create Against 5
    const forOrderPk = await market.forOrder(outcome, 10.0, price, purchaser);
    const againstOrderPk = await market.againstOrder(
      outcome,
      5.0,
      price,
      purchaser,
    );

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [10, 15, 10] },
        { len: 1, liquidity: 10, matched: 0 },
        { len: 1, liquidity: 5, matched: 0 },
        15,
        85,
      ],
    );

    // Settlement
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(purchaser.publicKey);
    await market.settleOrder(againstOrderPk);
    await market.settleOrder(forOrderPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [{ matched: [0, 0, 0], unmatched: [10, 15, 10] }, 0, 100],
    );
  });

  // Create For 10, Create Against 5, Settle For 10, Settle Against 5
  it("Scenario 2: for against for against", async () => {
    // Given
    const outcome = 1;
    const price = 4.0;

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    // Create For 10, Create Against 5
    const forOrderPk = await market.forOrder(outcome, 10.0, price, purchaser);
    const againstOrderPk = await market.againstOrder(
      outcome,
      5.0,
      price,
      purchaser,
    );

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [10, 15, 10] },
        { len: 1, liquidity: 10, matched: 0 },
        { len: 1, liquidity: 5, matched: 0 },
        15,
        85,
      ],
    );

    // Settlement
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(purchaser.publicKey);
    await market.settleOrder(forOrderPk);
    await market.settleOrder(againstOrderPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [{ matched: [0, 0, 0], unmatched: [10, 15, 10] }, 0, 100],
    );
  });

  // Create Against 5, Create For 10, Settle Against 5, Settle For 10
  it("Scenario 3: against for against for", async () => {
    // Given
    const outcome = 1;
    const price = 4.0;

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    // Create For 10, Create Against 5
    const againstOrderPk = await market.againstOrder(
      outcome,
      5.0,
      price,
      purchaser,
    );
    const forOrderPk = await market.forOrder(outcome, 10.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [10, 15, 10] },
        { len: 1, liquidity: 10, matched: 0 },
        { len: 1, liquidity: 5, matched: 0 },
        15,
        85,
      ],
    );

    // Settlement
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(purchaser.publicKey);
    await market.settleOrder(againstOrderPk);
    await market.settleOrder(forOrderPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [{ matched: [0, 0, 0], unmatched: [10, 15, 10] }, 0, 100],
    );
  });

  // Create Against 5, Create For 10, Settle For 10, Settle Against 5
  it("Scenario 4: against for for against", async () => {
    // Given
    const outcome = 1;
    const price = 4.0;

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    // Create For 10, Create Against 5
    const againstOrderPk = await market.againstOrder(
      outcome,
      5.0,
      price,
      purchaser,
    );
    const forOrderPk = await market.forOrder(outcome, 10.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [10, 15, 10] },
        { len: 1, liquidity: 10, matched: 0 },
        { len: 1, liquidity: 5, matched: 0 },
        15,
        85,
      ],
    );

    // Settlement
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(purchaser.publicKey);
    await market.settleOrder(forOrderPk);
    await market.settleOrder(againstOrderPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [{ matched: [0, 0, 0], unmatched: [10, 15, 10] }, 0, 100],
    );
  });
});
