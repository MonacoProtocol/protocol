import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Wholesale Payment 03
 */
describe("Order Wholesale Payment 03", () => {
  it("Scenario 1: outcome-a wins", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;

    // Create market, purchaser
    const [purchaserA, purchaserB, purchaserC, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([1.5, 1.68, 2.76, 3.0]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    await market.airdrop(purchaserC, 100.0);

    // CREATE --------------------------------------------------------------------

    const purchaserAAgainst1Pk = await market.againstOrder(
      outcomeA,
      10,
      3.0,
      purchaserA,
    );
    const purchaserBFor1Pk = await market.forOrder(
      outcomeA,
      10,
      2.76,
      purchaserB,
    );
    const purchaserAAgainst2Pk = await market.againstOrder(
      outcomeB,
      10,
      1.5,
      purchaserA,
    );
    const purchaserAAgainst3Pk = await market.againstOrder(
      outcomeC,
      10,
      1.68,
      purchaserA,
    );
    const purchaserCFor1Pk = await market.forOrder(
      outcomeB,
      10,
      1.5,
      purchaserC,
    );

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [0, 0, 0], maxExposure: [20, 5, 6.8], offset: 11.8 },
        { matched: [0, 0, 0], maxExposure: [0, 10, 10], offset: 0 },
        { matched: [0, 0, 0], maxExposure: [10, 0, 10], offset: 0 },
        40,
        80,
        90,
        90,
      ],
    );

    // MATCH ---------------------------------------------------------------------

    await market.match(purchaserCFor1Pk, purchaserAAgainst2Pk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [10, -5, 10], maxExposure: [20, 5, 6.8], offset: 11.8 },
        { matched: [0, 0, 0], maxExposure: [0, 10, 10], offset: 0 },
        { matched: [-10, 5, -10], maxExposure: [10, 0, 10], offset: 0 },
        40,
        80,
        90,
        90,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeA);
    await market.settleOrder(purchaserAAgainst1Pk);
    await market.settleOrder(purchaserAAgainst2Pk);
    await market.settleOrder(purchaserAAgainst3Pk);
    await market.settleOrder(purchaserBFor1Pk);
    await market.settleOrder(purchaserCFor1Pk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [10, -5, 10], maxExposure: [20, 5, 6.8], offset: 0 },
        { matched: [0, 0, 0], maxExposure: [0, 10, 10], offset: 0 },
        { matched: [-10, 5, -10], maxExposure: [10, 0, 10], offset: 0 },
        0,
        110,
        100,
        90,
      ],
    );
  });

  it("Scenario 2: outcome-b wins", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;

    // Create market, purchaser
    const [purchaserA, purchaserB, purchaserC, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([1.5, 1.68, 2.76, 3.0]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    await market.airdrop(purchaserC, 100.0);

    // CREATE --------------------------------------------------------------------

    const purchaserAAgainst1Pk = await market.againstOrder(
      outcomeA,
      10,
      3.0,
      purchaserA,
    );
    const purchaserBFor1Pk = await market.forOrder(
      outcomeA,
      10,
      2.76,
      purchaserB,
    );
    const purchaserAAgainst2Pk = await market.againstOrder(
      outcomeB,
      10,
      1.5,
      purchaserA,
    );
    const purchaserAAgainst3Pk = await market.againstOrder(
      outcomeC,
      10,
      1.68,
      purchaserA,
    );
    const purchaserCFor1Pk = await market.forOrder(
      outcomeB,
      10,
      1.5,
      purchaserC,
    );

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [0, 0, 0], maxExposure: [20, 5, 6.8], offset: 11.8 },
        { matched: [0, 0, 0], maxExposure: [0, 10, 10], offset: 0 },
        { matched: [0, 0, 0], maxExposure: [10, 0, 10], offset: 0 },
        40,
        80,
        90,
        90,
      ],
    );

    // MATCH ---------------------------------------------------------------------

    await market.match(purchaserCFor1Pk, purchaserAAgainst2Pk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [10, -5, 10], maxExposure: [20, 5, 6.8], offset: 11.8 },
        { matched: [0, 0, 0], maxExposure: [0, 10, 10], offset: 0 },
        { matched: [-10, 5, -10], maxExposure: [10, 0, 10], offset: 0 },
        40,
        80,
        90,
        90,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeB);
    await market.settleOrder(purchaserAAgainst1Pk);
    await market.settleOrder(purchaserAAgainst2Pk);
    await market.settleOrder(purchaserAAgainst3Pk);
    await market.settleOrder(purchaserBFor1Pk);
    await market.settleOrder(purchaserCFor1Pk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [10, -5, 10], maxExposure: [20, 5, 6.8], offset: 0 },
        { matched: [0, 0, 0], maxExposure: [0, 10, 10], offset: 0 },
        { matched: [-10, 5, -10], maxExposure: [10, 0, 10], offset: 0 },
        0,
        95,
        100,
        105,
      ],
    );
  });

  it("Scenario 3: outcome-c wins", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;

    // Create market, purchaser
    const [purchaserA, purchaserB, purchaserC, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([1.5, 1.68, 2.76, 3.0]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    await market.airdrop(purchaserC, 100.0);

    // CREATE --------------------------------------------------------------------

    const purchaserAAgainst1Pk = await market.againstOrder(
      outcomeA,
      10,
      3.0,
      purchaserA,
    );
    const purchaserBFor1Pk = await market.forOrder(
      outcomeA,
      10,
      2.76,
      purchaserB,
    );
    const purchaserAAgainst2Pk = await market.againstOrder(
      outcomeB,
      10,
      1.5,
      purchaserA,
    );
    const purchaserAAgainst3Pk = await market.againstOrder(
      outcomeC,
      10,
      1.68,
      purchaserA,
    );
    const purchaserCFor1Pk = await market.forOrder(
      outcomeB,
      10,
      1.5,
      purchaserC,
    );

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [0, 0, 0], maxExposure: [20, 5, 6.8], offset: 11.8 },
        { matched: [0, 0, 0], maxExposure: [0, 10, 10], offset: 0 },
        { matched: [0, 0, 0], maxExposure: [10, 0, 10], offset: 0 },
        40,
        80,
        90,
        90,
      ],
    );

    // MATCH ---------------------------------------------------------------------

    await market.match(purchaserCFor1Pk, purchaserAAgainst2Pk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [10, -5, 10], maxExposure: [20, 5, 6.8], offset: 11.8 },
        { matched: [0, 0, 0], maxExposure: [0, 10, 10], offset: 0 },
        { matched: [-10, 5, -10], maxExposure: [10, 0, 10], offset: 0 },
        40,
        80,
        90,
        90,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeC);
    await market.settleOrder(purchaserAAgainst1Pk);
    await market.settleOrder(purchaserAAgainst2Pk);
    await market.settleOrder(purchaserAAgainst3Pk);
    await market.settleOrder(purchaserBFor1Pk);
    await market.settleOrder(purchaserCFor1Pk);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [10, -5, 10], maxExposure: [20, 5, 6.8], offset: 0 },
        { matched: [0, 0, 0], maxExposure: [0, 10, 10], offset: 0 },
        { matched: [-10, 5, -10], maxExposure: [10, 0, 10], offset: 0 },
        0,
        110,
        100,
        90,
      ],
    );
  });
});
