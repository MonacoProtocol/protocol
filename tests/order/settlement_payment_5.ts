import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Settlement Payment 4
 */
describe("Order Settlement Payment 5", () => {
  it("Gabriele Sequence: outcome 0 wins", async () => {
    const { market, orderPks, purchaserA, purchaserB } = await setup();

    // Settlement
    await market.settle(0);

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
        { matched: [-5, -17, 25], maxExposure: [20, 27, 0], offset: 0 },
        { matched: [5, 17, -25], maxExposure: [15, 10, 25], offset: 0 },
        0,
        95,
        105,
      ],
    );
  });

  it("Gabriele Sequence: outcome 1 wins", async () => {
    const { market, orderPks, purchaserA, purchaserB } = await setup();

    // Settlement
    await market.settle(1);

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
        { matched: [-5, -17, 25], maxExposure: [20, 27, 0], offset: 0 },
        { matched: [5, 17, -25], maxExposure: [15, 10, 25], offset: 0 },
        0,
        83,
        117,
      ],
    );
  });

  it("Gabriele Sequence: outcome 2 wins", async () => {
    const { market, orderPks, purchaserA, purchaserB } = await setup();

    // Settlement
    await market.settle(2);

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
        { matched: [-5, -17, 25], maxExposure: [20, 27, 0], offset: 0 },
        { matched: [5, 17, -25], maxExposure: [15, 10, 25], offset: 0 },
        0,
        125,
        75,
      ],
    );
  });
});

async function setup() {
  // Given
  const priceLadder = [3.0, 2.8];

  // Create market, purchaser
  const [purchaserA, purchaserB, market] = await Promise.all([
    createWalletWithBalance(monaco.provider),
    createWalletWithBalance(monaco.provider),
    monaco.create3WayMarket(priceLadder),
  ]);
  await market.airdrop(purchaserA, 100.0);
  await market.airdrop(purchaserB, 100.0);

  // Create orders
  const orderPks = [];

  orderPks.push(await market.againstOrder(0, 10, 3.0, purchaserA)); // 0
  orderPks.push(await market.againstOrder(1, 15, 2.8, purchaserA)); // 1
  orderPks.push(await market.forOrder(0, 10, 3.0, purchaserB)); // 2
  orderPks.push(await market.forOrder(1, 15, 2.8, purchaserB)); // 3

  await market.match(orderPks[2], orderPks[0]);
  await market.match(orderPks[3], orderPks[1]);

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
      { matched: [-5, -17, 25], maxExposure: [20, 27, 0], offset: 20 },
      { matched: [5, 17, -25], maxExposure: [15, 10, 25], offset: 0 },
      52,
      73,
      75,
    ],
  );

  return { market, orderPks, purchaserA, purchaserB };
}

