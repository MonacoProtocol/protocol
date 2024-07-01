import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Settlement Payment 2
 */
describe("Order Settlement Payment 2", () => {
  it("Stuart's Sequence: match asap", async () => {
    // Given
    const outcome = 0;
    const priceLadder = [1.96, 2.01, 2.2];

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(priceLadder),
    ]);
    await market.airdrop(purchaser, 100.0);

    // Create orders
    const orderPks = [];

    orderPks.push(await market.againstOrder(outcome, 11, 2.01, purchaser));
    orderPks.push(await market.forOrder(outcome, 10, 1.96, purchaser));

    await market.processMatchingQueue();

    orderPks.push(await market.againstOrder(outcome, 10, 2.2, purchaser));
    orderPks.push(await market.forOrder(outcome, 11, 2.01, purchaser));

    await market.processMatchingQueue();

    orderPks.push(await market.againstOrder(outcome, 11, 2.2, purchaser));
    orderPks.push(await market.forOrder(outcome, 10, 2.01, purchaser));

    await market.processMatchingQueue();

    // All orders are created
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][1.96].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.01].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.01].against,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.2].against,
        ),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [1.2, 0, 0] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 21 },
        { len: 0, liquidity: 0, matched: 11 },
        { len: 1, liquidity: 1, matched: 20 },
        1.2,
        98.8,
      ],
    );

    // Settlement
    await market.settle(outcome);
    await market.settleMarketPositionForPurchaser(purchaser.publicKey);
    for (const orderPk of orderPks) {
      await market.settleOrder(orderPk);
    }

    // All orders are paid out
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [{ matched: [0, 0, 0], unmatched: [1.2, 0, 0] }, 0, 100],
    );
  });

  it("Stuart's Sequence: match last", async () => {
    // Given
    const outcome = 0;
    const priceLadder = [1.96, 2.01, 2.2];

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(priceLadder),
    ]);
    await market.airdrop(purchaser, 100.0);

    // Create orders
    const orderPks = [];

    orderPks.push(await market.againstOrder(outcome, 11, 2.01, purchaser));
    orderPks.push(await market.forOrder(outcome, 10, 1.96, purchaser));
    orderPks.push(await market.againstOrder(outcome, 10, 2.2, purchaser));
    orderPks.push(await market.forOrder(outcome, 11, 2.01, purchaser));
    orderPks.push(await market.againstOrder(outcome, 11, 2.2, purchaser));
    orderPks.push(await market.forOrder(outcome, 10, 2.01, purchaser));

    // All orders are created
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][1.96].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.01].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.01].against,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.2].against,
        ),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [35.11, -31, -31], unmatched: [36.31, 0, 0] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 21 },
        { len: 1, liquidity: 11, matched: 0 },
        { len: 2, liquidity: 21, matched: 0 },
        36.31,
        63.69,
      ],
    );

    await market.processMatchingQueue();

    // All orders are matched
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][1.96].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.01].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.01].against,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.2].against,
        ),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [1.2, 0, 0] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 21 },
        { len: 0, liquidity: 0, matched: 11 },
        { len: 1, liquidity: 1, matched: 20 },
        1.2,
        98.8,
      ],
    );

    // Settlement
    await market.settle(outcome);
    await market.settleMarketPositionForPurchaser(purchaser.publicKey);
    for (const orderPk of orderPks) {
      await market.settleOrder(orderPk);
    }

    // All orders are paid out
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [{ matched: [0, 0, 0], unmatched: [1.2, 0, 0] }, 0, 100],
    );
  });
});
