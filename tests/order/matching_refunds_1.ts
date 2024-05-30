import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Matching Refunds 1
 */
describe("Order Matching Refunds 1", () => {
  it("Scenario 1: for all outcomes 10.00 @ 2.00", async () => {
    // Given
    const outcome = 1;
    const price_1_96 = 1.96;
    const price_2_01 = 2.01;
    const price_2_20 = 2.2;

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price_1_96, price_2_01, price_2_20]),
    ]);
    await market.airdrop(purchaser, 1000.0);

    const against_11_at_2_01 = await market.againstOrder(
      outcome,
      11.0,
      price_2_01,
      purchaser,
    );
    const for_10_at_1_96 = await market.forOrder(
      outcome,
      10.0,
      price_1_96,
      purchaser,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(against_11_at_2_01),
        monaco.getOrder(for_10_at_1_96),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price_1_96),
        market.getAgainstMatchingPool(outcome, price_2_01),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 11, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [-10, 10.1, -10], unmatched: [0, 11.11, 0] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 1, liquidity: 11, matched: 0 },
        11.11,
        988.89,
      ],
    );

    await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(against_11_at_2_01),
        monaco.getOrder(for_10_at_1_96),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price_1_96),
        market.getAgainstMatchingPool(outcome, price_2_01),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 1, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [0, 0, 0], unmatched: [0, 1.01, 0] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 1, liquidity: 1, matched: 10 },
        1.01,
        998.99,
      ],
    );

    // CREATE --------------------------------------------------------------------

    const against_10_at_2_20 = await market.againstOrder(
      outcome,
      10.0,
      price_2_20,
      purchaser,
    );
    const for_11_at_2_01 = await market.forOrder(
      outcome,
      11.0,
      price_2_01,
      purchaser,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(against_10_at_2_20),
        monaco.getOrder(for_11_at_2_01),
        monaco.getOrder(against_11_at_2_01),
        monaco.getOrder(for_10_at_1_96),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price_1_96),
        market.getForMatchingPool(outcome, price_2_01),
        market.getAgainstMatchingPool(outcome, price_2_01),
        market.getAgainstMatchingPool(outcome, price_2_20),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 1, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [-11, 13.01, -11], unmatched: [0, 13.01, 0] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 11 },
        { len: 1, liquidity: 1, matched: 10 },
        { len: 1, liquidity: 10, matched: 0 },
        13.01,
        986.99,
      ],
    );

    await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(against_10_at_2_20),
        monaco.getOrder(for_11_at_2_01),
        monaco.getOrder(against_11_at_2_01),
        monaco.getOrder(for_10_at_1_96),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price_1_96),
        market.getForMatchingPool(outcome, price_2_01),
        market.getAgainstMatchingPool(outcome, price_2_01),
        market.getAgainstMatchingPool(outcome, price_2_20),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [0, 0, 0], unmatched: [0, 0, 0] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 11 },
        { len: 0, liquidity: 0, matched: 11 },
        { len: 0, liquidity: 0, matched: 10 },
        0,
        1000,
      ],
    );

    // CREATE --------------------------------------------------------------------

    const against_11_at_2_20 = await market.againstOrder(
      outcome,
      11.0,
      price_2_20,
      purchaser,
    );
    const for_10_at_2_01 = await market.forOrder(
      outcome,
      10.0,
      price_2_01,
      purchaser,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(against_11_at_2_20),
        monaco.getOrder(for_10_at_2_01),
        monaco.getOrder(against_10_at_2_20),
        monaco.getOrder(for_11_at_2_01),
        monaco.getOrder(against_11_at_2_01),
        monaco.getOrder(for_10_at_1_96),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price_1_96),
        market.getForMatchingPool(outcome, price_2_01),
        market.getAgainstMatchingPool(outcome, price_2_01),
        market.getAgainstMatchingPool(outcome, price_2_20),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 11, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [-10, 12, -10], unmatched: [0, 13.2, 0] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 21 },
        { len: 0, liquidity: 0, matched: 11 },
        { len: 1, liquidity: 11, matched: 10 },
        13.2,
        986.8,
      ],
    );

    await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(against_11_at_2_20),
        monaco.getOrder(for_10_at_2_01),
        monaco.getOrder(against_10_at_2_20),
        monaco.getOrder(for_11_at_2_01),
        monaco.getOrder(against_11_at_2_01),
        monaco.getOrder(for_10_at_1_96),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price_1_96),
        market.getForMatchingPool(outcome, price_2_01),
        market.getAgainstMatchingPool(outcome, price_2_01),
        market.getAgainstMatchingPool(outcome, price_2_20),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 1, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [0, 0, 0], unmatched: [0, 1.2, 0] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 21 },
        { len: 0, liquidity: 0, matched: 11 },
        { len: 1, liquidity: 1, matched: 20 },
        1.2,
        998.8,
      ],
    );
  });
});
