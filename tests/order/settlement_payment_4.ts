import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Settlement Payment 4
 */
describe("Order Settlement Payment 4", () => {
  it("Varun's Sequence: 2 against 2 for", async () => {
    // Given
    const priceLadder = [3.0];

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(priceLadder),
    ]);
    await market.airdrop(purchaserA, 1000.0);
    await market.airdrop(purchaserB, 1000.0);

    // Create orders
    const orderPks = [];

    orderPks.push(await market.againstOrder(0, 10, 3.0, purchaserA)); // 0
    orderPks.push(await market.againstOrder(1, 10, 3.0, purchaserA)); // 1
    orderPks.push(await market.forOrder(0, 10, 3.0, purchaserB)); // 2
    orderPks.push(await market.forOrder(1, 10, 3.0, purchaserB)); // 3

    await market.processMatchingQueue();

    // All orders are created
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-10, -10, 20], unmatched: [0, 0, 0] },
        { matched: [10, 10, -20], unmatched: [0, 0, 0] },
        30,
        990,
        980,
      ],
    );

    // Settlement
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    for (const orderPk of orderPks) {
      await market.settleOrder(orderPk);
    }

    // All orders are paid out
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-10, -10, 20], unmatched: [0, 0, 0] },
        { matched: [10, 10, -20], unmatched: [0, 0, 0] },
        0,
        990,
        1009,
      ],
    );
  });

  it("Varun's Sequence: 2 againsts 1 for", async () => {
    // Given
    const priceLadder = [3.0];

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(priceLadder),
    ]);
    await market.airdrop(purchaserA, 1000.0);
    await market.airdrop(purchaserB, 1000.0);

    // Create orders
    const orderPks = [];

    orderPks.push(await market.againstOrder(0, 10, 3.0, purchaserA)); // 0
    orderPks.push(await market.againstOrder(1, 10, 3.0, purchaserA)); // 1
    orderPks.push(await market.forOrder(0, 10, 3.0, purchaserB)); // 2

    await market.processMatchingQueue();

    // All orders are created
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        monaco.getMarketMatchingPool(market.matchingPools[0][3.0].forOutcome),
        monaco.getMarketMatchingPool(market.matchingPools[0][3.0].against),
        monaco.getMarketMatchingPool(market.matchingPools[1][3.0].against),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], unmatched: [0, 20, 0] },
        { matched: [20, -10, -10], unmatched: [0, 0, 0] },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 1, liquidity: 10, matched: 0 },
        30,
        980,
        990,
      ],
    );

    // Settlement
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    for (const orderPk of orderPks) {
      await market.settleOrder(orderPk);
    }

    // All orders are paid out
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], unmatched: [0, 20, 0] },
        { matched: [20, -10, -10], unmatched: [0, 0, 0] },
        0,
        980,
        1018,
      ],
    );
  });
});
