import assert from "assert";
import { cancelOrderSmart, createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Cancelation Payment 11
 *
 * All created orders are eligible for cancelation before they get fully matched.
 * If the partial match occurs then only unmatched portion fo the order is eligible for cancelation.
 *
 * This test case covers situation when patron creates a pair of matching against and for orders for the same market outcome at the same price but with a different stake.
 * Because same patron is creating both orders, some orders' payments and payouts can be reduced to complement eachother.
 * How much funds gets taken/paid-out depends greatly on the order in which those best were made therefore we have four scenarios:
 * - for creation, against creation, match, reminder against cancelation
 * - against creation, for creation, match, reminder against cancelation
 * - for creation, against creation, match, reminder for cancelation
 * - against creation, for creation, match, reminder for cancelation
 *
 * All scenarios are characterised by:
 * - market's escrow changes sum up to zero
 * - patron's token account changes sum up to zero (we are still not collecting any fees - this will change)
 * - full payment taken for 1st creation and discounted payment for 2nd creation
 *
 * Difference orderween scenario lies in the amounts being transferred at each step:
 * - Scenario 1 (for against against):  -$10.00, $0.00, $0.00
 * - Scenario 2 (against for against):  -$26.40, $0.00, $0.00
 * - Scenario 3 (for against for): -$12.00, $0.00, $0.00
 * - Scenario 4 (against for for): -$22.00, $0.00, $0.00
 *
 */
describe("Order Cancelation Payment 11", () => {
  // Create For 10, Create Against 12, Match 10, Cancel Against 2
  it("Scenario 1: for against match against", async () => {
    // Given
    const outcome = 1;
    const price = 3.2;

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 200.0);

    // Create orders
    const forOrderPk = await market.forOrder(outcome, 10.0, price, purchaser);
    const againstOrderPk = await market.againstOrder(
      outcome,
      12.0,
      price,
      purchaser,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 12, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [10, 26.4, 10] },
        { len: 1, liquidity: 10, matched: 0 },
        { len: 1, liquidity: 12, matched: 0 },
        26.4,
        173.6,
      ],
    );

    // Match orders
    await market.match(forOrderPk, againstOrderPk);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 2, stakeVoided: 0, status: { matched: {} } },
        { matched: [0, 0, 0], maxExposure: [10, 26.4, 10] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 1, liquidity: 2, matched: 10 },
        26.4,
        173.6,
      ],
    );

    // Cancel partially matched against order
    await cancelOrderSmart(againstOrderPk, purchaser);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 2, status: { matched: {} } },
        { matched: [0, 0, 0], maxExposure: [10, 22, 10] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 10 },
        22,
        178,
      ],
    );
  });

  // Create Against 12, Create For 10, Match 10, Cancel Against 2
  it("Scenario 2: against for match against", async () => {
    // Given
    const outcome = 1;
    const price = 3.2;

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 200.0);

    // Create orders
    const againstOrderPk = await market.againstOrder(
      outcome,
      12.0,
      price,
      purchaser,
    );
    const forOrderPk = await market.forOrder(outcome, 10.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 12, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [10, 26.4, 10] },
        { len: 1, liquidity: 10, matched: 0 },
        { len: 1, liquidity: 12, matched: 0 },
        26.4,
        173.6,
      ],
    );

    // Match orders
    await market.match(forOrderPk, againstOrderPk);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 2, stakeVoided: 0, status: { matched: {} } },
        { matched: [0, 0, 0], maxExposure: [10, 26.4, 10] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 1, liquidity: 2, matched: 10 },
        26.4,
        173.6,
      ],
    );

    // Cancel partially matched against order
    await cancelOrderSmart(againstOrderPk, purchaser);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 2, status: { matched: {} } },
        { matched: [0, 0, 0], maxExposure: [10, 22, 10] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 10 },
        22,
        178,
      ],
    );
  });

  // Create For 12, Create Against 10, Match 10, Cancel For 2
  it("Scenario 3: for against match for", async () => {
    // Given
    const outcome = 1;
    const price = 3.2;

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 200.0);

    // Create orders
    const forOrderPk = await market.forOrder(outcome, 12.0, price, purchaser);
    const againstOrderPk = await market.againstOrder(
      outcome,
      10.0,
      price,
      purchaser,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 12, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [12, 22, 12] },
        { len: 1, liquidity: 12, matched: 0 },
        { len: 1, liquidity: 10, matched: 0 },
        22,
        178,
      ],
    );

    // Match orders
    await market.match(forOrderPk, againstOrderPk);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [0, 0, 0], maxExposure: [12, 22, 12] },
        { len: 1, liquidity: 2, matched: 10 },
        { len: 0, liquidity: 0, matched: 10 },
        22,
        178,
      ],
    );

    // Cancel partially matched for order
    await cancelOrderSmart(forOrderPk, purchaser);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 2, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [0, 0, 0], maxExposure: [10, 22, 10] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 10 },
        22,
        178,
      ],
    );
  });

  // Create Against 10, Create For 12, Match 10, Cancel For 2
  it("Scenario 4: against for match for", async () => {
    // Given
    const outcome = 1;
    const price = 3.2;

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 200.0);

    // Create orders
    const againstOrderPk = await market.againstOrder(
      outcome,
      10.0,
      price,
      purchaser,
    );
    const forOrderPk = await market.forOrder(outcome, 12.0, price, purchaser);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 12, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [12, 22, 12] },
        { len: 1, liquidity: 12, matched: 0 },
        { len: 1, liquidity: 10, matched: 0 },
        22,
        178,
      ],
    );

    // Match orders
    await market.match(forOrderPk, againstOrderPk);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [0, 0, 0], maxExposure: [12, 22, 12] },
        { len: 1, liquidity: 2, matched: 10 },
        { len: 0, liquidity: 0, matched: 10 },
        22,
        178,
      ],
    );

    // Cancel partially matched for order
    await cancelOrderSmart(forOrderPk, purchaser);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 2, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [0, 0, 0], maxExposure: [10, 22, 10] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 10 },
        22,
        178,
      ],
    );
  });
});
