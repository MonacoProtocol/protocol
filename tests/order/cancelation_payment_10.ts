import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Cancelation Payment 10
 *
 * All created orders are eligible for cancelation before they get fully matched.
 * If the partial match occurs then only unmatched portion fo the order is eligible for cancelation.
 *
 * This test case covers situation when patron creates a for order of $10.00 and an against order of $5.00 for the same market outcome at the same price.
 * Because same patron is creating both orders, some orders' payments and payouts can be reduced to complement eachother.
 * How much funds gets taken/paid-out depends greatly on the order in which those best were made therefore we have four scenarios:
 * - for creation, against creation, against cancelation, for cancelation
 * - for creation, against creation, for cancelation, against cancelation
 * - against creation, for creation, against cancelation, for cancelation
 * - against creation, for creation, for cancelation, against cancelation
 *
 * All scenarios are characterised by:
 * - market's escrow changes sum up to zero
 * - patron's token account changes sum up to zero (we are still not collecting any fees - this will change)
 * - full payment taken for 1st creation and discounted payment for 2nd creation
 *
 * Difference orderween scenario lies in the amounts being transferred at each step:
 * - Scenario 1 (for against against for): -$10.00, +$5.00, -$5.00, +$10.00
 * - Scenario 2 (for against for against): -$10.00, +$5.00, -$10.00, +$15.00
 * - Scenario 2 (against for against for): -$15.00, +$10.00, -$5.00, +$10.00
 * - Scenario 2 (against for for against): -$15.00, +$10.00, -$10.00, +$15.00
 *
 */
describe("Order Cancelation Payment 10", () => {
  // Create For 10, Create Against 5, Cancel Against 5, Cancel For 10
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
        { matched: [5, -15, 5], unmatched: [10, 0, 10] },
        { len: 1, liquidity: 10, matched: 0 },
        { len: 0, liquidity: 0, matched: 5 },
        15,
        85,
      ],
    );

    // Cancel Against 5
    try {
      await market.cancel(againstOrderPk, purchaser);
      assert.fail("expected CancelOrderNotCancellable");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelOrderNotCancellable");
    }

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [5, -15, 5], unmatched: [10, 0, 10] },
        { len: 1, liquidity: 10, matched: 0 },
        { len: 0, liquidity: 0, matched: 5 },
        15,
        85,
      ],
    );

    // Cancel For 10
    await market.cancel(forOrderPk, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [5, -15, 5], unmatched: [5, 0, 5] },
        { len: 1, liquidity: 5, matched: 0 },
        { len: 0, liquidity: 0, matched: 5 },
        15,
        85,
      ],
    );
  });

  // Create For 10, Create Against 5, Cancel For 10, Cancel Against 5
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
        { matched: [5, -15, 5], unmatched: [10, 0, 10] },
        { len: 1, liquidity: 10, matched: 0 },
        { len: 0, liquidity: 0, matched: 5 },
        15,
        85,
      ],
    );

    // Cancel For 10
    await market.cancel(forOrderPk, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [5, -15, 5], unmatched: [5, 0, 5] },
        { len: 1, liquidity: 5, matched: 0 },
        { len: 0, liquidity: 0, matched: 5 },
        15,
        85,
      ],
    );

    // Cancel Against 5
    try {
      await market.cancel(againstOrderPk, purchaser);
      assert.fail("expected CancelOrderNotCancellable");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelOrderNotCancellable");
    }

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [5, -15, 5], unmatched: [5, 0, 5] },
        { len: 1, liquidity: 5, matched: 0 },
        { len: 0, liquidity: 0, matched: 5 },
        15,
        85,
      ],
    );
  });

  // Create Against 5, Create For 10, Cancel Against 5, Cancel For 10
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

    // Create Against 5, Create For 10
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
        { matched: [-5, 15, -5], unmatched: [5, 15, 5] },
        { len: 1, liquidity: 5, matched: 5 },
        { len: 1, liquidity: 5, matched: 0 },
        15,
        85,
      ],
    );

    // Cancel Against 5
    try {
      await market.cancel(againstOrderPk, purchaser);
      assert.fail("expected CancelationLowLiquidity");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelationLowLiquidity");
    }

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [-5, 15, -5], unmatched: [5, 15, 5] },
        { len: 1, liquidity: 5, matched: 5 },
        { len: 1, liquidity: 5, matched: 0 },
        15,
        85,
      ],
    );

    // Cancel For 10
    await market.cancel(forOrderPk, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [-5, 15, -5], unmatched: [0, 15, 0] },
        { len: 0, liquidity: 0, matched: 5 },
        { len: 1, liquidity: 5, matched: 0 },
        15,
        85,
      ],
    );
  });

  // Create Against 5, Create For 10, Cancel For 10, Cancel Against 5
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

    // Create Against 5, Create For 10
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
        { matched: [-5, 15, -5], unmatched: [5, 15, 5] },
        { len: 1, liquidity: 5, matched: 5 },
        { len: 1, liquidity: 5, matched: 0 },
        15,
        85,
      ],
    );

    // Cancel For 10
    await market.cancel(forOrderPk, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [-5, 15, -5], unmatched: [0, 15, 0] },
        { len: 0, liquidity: 0, matched: 5 },
        { len: 1, liquidity: 5, matched: 0 },
        15,
        85,
      ],
    );

    // Cancel Against 5
    try {
      await market.cancel(againstOrderPk, purchaser);
      assert.fail("expected CancelationLowLiquidity");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelationLowLiquidity");
    }

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [-5, 15, -5], unmatched: [0, 15, 0] },
        { len: 0, liquidity: 0, matched: 5 },
        { len: 1, liquidity: 5, matched: 0 },
        15,
        85,
      ],
    );
  });
});
