import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Wholesale Payment 02
 */
describe("Order Wholesale Payment 02", () => {
  it("Scenario 1: outcome-a wins", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;
    const price = 3.0;

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);

    // CREATE --------------------------------------------------------------------

    const a1AgainstPk = await market.againstOrder(
      outcomeA,
      10,
      price,
      purchaserA,
    );
    const b1ForPk = await market.forOrder(outcomeA, 10, price, purchaserB);

    await market.match(b1ForPk, a1AgainstPk);

    const a2AgainstPk = await market.againstOrder(
      outcomeB,
      10,
      price,
      purchaserA,
    );
    const a3AgainstPk = await market.againstOrder(
      outcomeC,
      10,
      price,
      purchaserA,
    );

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 40 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        30,
        80,
        90,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeA);

    await market.settleOrder(a1AgainstPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 40 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        30,
        80,
        90,
      ],
    );

    await market.settleOrder(a2AgainstPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 20 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        30,
        80,
        90,
      ],
    );

    await market.settleOrder(a3AgainstPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 0 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        30,
        80,
        90,
      ],
    );

    await market.settleOrder(b1ForPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 0 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        0,
        80,
        120,
      ],
    );
  });

  it("Scenario 2: outcome-b wins", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;
    const price = 3.0;

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);

    // CREATE --------------------------------------------------------------------

    const a1AgainstPk = await market.againstOrder(
      outcomeA,
      10,
      price,
      purchaserA,
    );
    const b1ForPk = await market.forOrder(outcomeA, 10, price, purchaserB);

    await market.match(b1ForPk, a1AgainstPk);

    const a2AgainstPk = await market.againstOrder(
      outcomeB,
      10,
      price,
      purchaserA,
    );
    const a3AgainstPk = await market.againstOrder(
      outcomeC,
      10,
      price,
      purchaserA,
    );

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 40 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        30,
        80,
        90,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeB);

    await market.settleOrder(a1AgainstPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 10 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        30,
        80,
        90,
      ],
    );

    await market.settleOrder(a2AgainstPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 0 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        20,
        90,
        90,
      ],
    );

    await market.settleOrder(a3AgainstPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 0 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        0,
        110,
        90,
      ],
    );

    await market.settleOrder(b1ForPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 0 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        0,
        110,
        90,
      ],
    );
  });

  it("Scenario 3: outcome-c wins", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;
    const price = 3.0;

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);

    // CREATE --------------------------------------------------------------------

    const a1AgainstPk = await market.againstOrder(
      outcomeA,
      10,
      price,
      purchaserA,
    );
    const b1ForPk = await market.forOrder(outcomeA, 10, price, purchaserB);

    await market.match(b1ForPk, a1AgainstPk);

    const a2AgainstPk = await market.againstOrder(
      outcomeB,
      10,
      price,
      purchaserA,
    );
    const a3AgainstPk = await market.againstOrder(
      outcomeC,
      10,
      price,
      purchaserA,
    );

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 40 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        30,
        80,
        90,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeC);

    await market.settleOrder(a1AgainstPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 10 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        30,
        80,
        90,
      ],
    );

    await market.settleOrder(a2AgainstPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 0 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        20,
        90,
        90,
      ],
    );

    await market.settleOrder(a3AgainstPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 0 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        0,
        110,
        90,
      ],
    );

    await market.settleOrder(b1ForPk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { matched: [-20, 10, 10], maxExposure: [20, 20, 20], offset: 0 },
        { matched: [20, -10, -10], maxExposure: [0, 10, 10], offset: 0 },
        0,
        110,
        90,
      ],
    );
  });
});
