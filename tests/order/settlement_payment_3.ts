import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Settlement Payment 3
 */
describe("Order Settlement Payment 3", () => {
  it("Ewan's Sequence: match asap", async () => {
    // Given
    const outcome = 0;
    const priceLadder = [1.97, 1.99, 2.0, 2.01];

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(priceLadder),
    ]);
    await market.airdrop(purchaser, 1000.0);

    // Create orders
    const orderPks = [];

    orderPks.push(await market.forOrder(outcome, 100, 1.97, purchaser)); // 0
    orderPks.push(await market.forOrder(outcome, 100, 1.99, purchaser)); // 1
    orderPks.push(await market.againstOrder(outcome, 200, 2.01, purchaser)); // 2

    await market.match(orderPks[0], orderPks[2]);
    await market.match(orderPks[1], orderPks[2]);

    orderPks.push(await market.againstOrder(outcome, 100, 2.0, purchaser)); // 3
    orderPks.push(await market.againstOrder(outcome, 200, 1.99, purchaser)); // 4
    orderPks.push(await market.forOrder(outcome, 100, 2.01, purchaser)); // 5
    orderPks.push(await market.forOrder(outcome, 250, 1.97, purchaser)); // 6

    await market.match(orderPks[6], orderPks[3]);
    await market.match(orderPks[6], orderPks[4]);

    orderPks.push(await market.againstOrder(outcome, 100, 2, purchaser)); // 7
    orderPks.push(await market.forOrder(outcome, 50, 1.97, purchaser)); // 8

    await market.match(orderPks[8], orderPks[7]);

    orderPks.push(await market.forOrder(outcome, 250, 1.99, purchaser)); // 9

    await market.match(orderPks[9], orderPks[7]);
    await market.match(orderPks[9], orderPks[4]);

    // All orders are created
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][1.97].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][1.99].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.01].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][1.99].against,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.0].against,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.01].against,
        ),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [0, 0, 0], maxExposure: [0, 250, 250] },
        { len: 0, liquidity: 0, matched: 400 },
        { len: 1, liquidity: 150, matched: 200 },
        { len: 1, liquidity: 100, matched: 0 },
        { len: 0, liquidity: 0, matched: 200 },
        { len: 0, liquidity: 0, matched: 200 },
        { len: 0, liquidity: 0, matched: 200 },
        250,
        750,
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
      [{ matched: [0, 0, 0], maxExposure: [0, 250, 250] }, 0, 1000],
    );
  });

  it("Ewan's Sequence: match last", async () => {
    // Given
    const outcome = 0;
    const priceLadder = [1.97, 1.99, 2.0, 2.01];

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(priceLadder),
    ]);
    await market.airdrop(purchaser, 1000.0);

    // Create orders
    const orderPks = [];

    orderPks.push(await market.forOrder(outcome, 100, 1.97, purchaser)); // 0
    orderPks.push(await market.forOrder(outcome, 100, 1.99, purchaser)); // 1
    orderPks.push(await market.againstOrder(outcome, 200, 2.01, purchaser)); // 2
    orderPks.push(await market.againstOrder(outcome, 100, 2.0, purchaser)); // 3
    orderPks.push(await market.againstOrder(outcome, 200, 1.99, purchaser)); // 4
    orderPks.push(await market.forOrder(outcome, 100, 2.01, purchaser)); // 5
    orderPks.push(await market.forOrder(outcome, 250, 1.97, purchaser)); // 6
    orderPks.push(await market.againstOrder(outcome, 100, 2, purchaser)); // 7
    orderPks.push(await market.forOrder(outcome, 50, 1.97, purchaser)); // 8
    orderPks.push(await market.forOrder(outcome, 250, 1.99, purchaser)); // 9

    // All orders are created
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][1.97].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][1.99].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.01].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][1.99].against,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.0].against,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.01].against,
        ),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [0, 0, 0], maxExposure: [600, 850, 850] },
        { len: 3, liquidity: 400, matched: 0 },
        { len: 2, liquidity: 350, matched: 0 },
        { len: 1, liquidity: 100, matched: 0 },
        { len: 1, liquidity: 200, matched: 0 },
        { len: 2, liquidity: 200, matched: 0 },
        { len: 1, liquidity: 200, matched: 0 },
        850,
        150,
      ],
    );

    await market.match(orderPks[0], orderPks[2]);
    await market.match(orderPks[1], orderPks[2]);
    await market.match(orderPks[6], orderPks[3]);
    await market.match(orderPks[6], orderPks[4]);
    await market.match(orderPks[8], orderPks[7]);
    await market.match(orderPks[9], orderPks[7]);
    await market.match(orderPks[9], orderPks[4]);

    // All orders are matched
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaser),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][1.97].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][1.99].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.01].forOutcome,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][1.99].against,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.0].against,
        ),
        monaco.getMarketMatchingPool(
          market.matchingPools[outcome][2.01].against,
        ),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { matched: [0, 0, 0], maxExposure: [0, 250, 250] },
        { len: 0, liquidity: 0, matched: 400 },
        { len: 1, liquidity: 150, matched: 200 },
        { len: 1, liquidity: 100, matched: 0 },
        { len: 0, liquidity: 0, matched: 200 },
        { len: 0, liquidity: 0, matched: 200 },
        { len: 0, liquidity: 0, matched: 200 },
        250,
        750,
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
      [{ matched: [0, 0, 0], maxExposure: [0, 250, 250] }, 0, 1000],
    );
  });
});
