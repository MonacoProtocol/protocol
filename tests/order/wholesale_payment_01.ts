import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Wholesale Payment 01
 */
describe("Order Wholesale Payment 01", () => {
  it("Scenario 1: outcome-a wins", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;
    const price = 3.0;

    // Create market, purchaser
    const [purchaserA, purchaserB, purchaserC, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    await market.airdrop(purchaserC, 100.0);

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
    const c1ForPk = await market.forOrder(outcomeB, 10, price, purchaserC);

    await market.match(c1ForPk, a2AgainstPk);

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
        { matched: [-10, -10, 20], maxExposure: [0, 0, 20] },
        { matched: [20, -10, -10], maxExposure: [0, 0, 0] },
        { matched: [-10, 20, -10], maxExposure: [0, 0, 0] },
        40,
        80,
        90,
        90,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeA);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserC.publicKey);
    await market.settleOrder(a1AgainstPk);
    await market.settleOrder(a2AgainstPk);
    await market.settleOrder(a3AgainstPk);
    await market.settleOrder(b1ForPk);
    await market.settleOrder(c1ForPk);

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
        { matched: [-10, -10, 20], maxExposure: [0, 0, 20] },
        { matched: [20, -10, -10], maxExposure: [0, 0, 0] },
        { matched: [-10, 20, -10], maxExposure: [0, 0, 0] },
        0,
        90,
        118,
        90,
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
    const [purchaserA, purchaserB, purchaserC, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    await market.airdrop(purchaserC, 100.0);

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
    const c1ForPk = await market.forOrder(outcomeB, 10, price, purchaserC);

    await market.match(c1ForPk, a2AgainstPk);

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
        { matched: [-10, -10, 20], maxExposure: [0, 0, 20] },
        { matched: [20, -10, -10], maxExposure: [0, 0, 0] },
        { matched: [-10, 20, -10], maxExposure: [0, 0, 0] },
        40,
        80,
        90,
        90,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeB);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserC.publicKey);
    await market.settleOrder(a1AgainstPk);
    await market.settleOrder(a2AgainstPk);
    await market.settleOrder(a3AgainstPk);
    await market.settleOrder(b1ForPk);
    await market.settleOrder(c1ForPk);

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
        { matched: [-10, -10, 20], maxExposure: [0, 0, 20] },
        { matched: [20, -10, -10], maxExposure: [0, 0, 0] },
        { matched: [-10, 20, -10], maxExposure: [0, 0, 0] },
        0,
        90,
        90,
        118,
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
    const [purchaserA, purchaserB, purchaserC, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    await market.airdrop(purchaserC, 100.0);

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
    const c1ForPk = await market.forOrder(outcomeB, 10, price, purchaserC);

    await market.match(c1ForPk, a2AgainstPk);

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
        { matched: [-10, -10, 20], maxExposure: [0, 0, 20] },
        { matched: [20, -10, -10], maxExposure: [0, 0, 0] },
        { matched: [-10, 20, -10], maxExposure: [0, 0, 0] },
        40,
        80,
        90,
        90,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeC);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserC.publicKey);
    await market.settleOrder(a1AgainstPk);
    await market.settleOrder(a2AgainstPk);
    await market.settleOrder(a3AgainstPk);
    await market.settleOrder(b1ForPk);
    await market.settleOrder(c1ForPk);

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
        { matched: [-10, -10, 20], maxExposure: [0, 0, 20] },
        { matched: [20, -10, -10], maxExposure: [0, 0, 0] },
        { matched: [-10, 20, -10], maxExposure: [0, 0, 0] },
        0,
        118,
        90,
        90,
      ],
    );
  });
});
