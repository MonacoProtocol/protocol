import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 */
describe("Protocol: Cross Liquidity", () => {
  it("Scenario 2: for 2-way market", async () => {
    // Given
    // market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.createMarket(["A", "B"], [1.5, 3.0]),
    ]);
    await market.open(true);
    await market.airdrop(purchaser, 1000.0);

    // orders
    await market.forOrder(0, 100.0, 1.5, purchaser);
    await market.againstOrder(1, 100.0, 1.5, purchaser);
    assert.deepEqual(
      await Promise.all([
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [150, 850],
    );

    // When
    await market.updateMarketLiquiditiesWithCrossLiquidity(
      true,
      [{ outcome: 0, price: 1.5 }],
      { outcome: 1, price: 3.0 },
    );
    await market.updateMarketLiquiditiesWithCrossLiquidity(
      false,
      [{ outcome: 1, price: 1.5 }],
      { outcome: 0, price: 3.0 },
    );

    // Then
    assert.deepEqual(await market.getMarketLiquidities(), {
      liquiditiesAgainst: [
        {
          liquidity: 50,
          outcome: 1,
          price: 3,
          sources: [{ outcome: 0, price: 1.5 }],
        },
        { liquidity: 100, outcome: 1, price: 1.5, sources: [] },
      ],
      liquiditiesFor: [
        { liquidity: 100, outcome: 0, price: 1.5, sources: [] },
        {
          liquidity: 50,
          outcome: 0,
          price: 3,
          sources: [{ outcome: 1, price: 1.5 }],
        },
      ],
    });
  });

  it("Scenario 2: for 3-way market", async () => {
    // Given
    // market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.createMarket(["A", "B", "C"], [2.1, 3.0, 5.25]),
    ]);
    await market.open(true);
    await market.airdrop(purchaser, 1000.0);

    // orders
    await market.forOrder(0, 100.0, 2.1, purchaser);
    await market.forOrder(1, 100.0, 3.0, purchaser);
    await market.againstOrder(1, 100.0, 2.1, purchaser);
    await market.againstOrder(2, 100.0, 3.0, purchaser);
    assert.deepEqual(
      await Promise.all([
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
        market.getMarketMatchingQueueLength(),
      ]),
      [400, 600, 0],
    );

    // When
    await market.updateMarketLiquiditiesWithCrossLiquidity(
      true,
      [
        { outcome: 0, price: 2.1 },
        { outcome: 1, price: 3.0 },
      ],
      { outcome: 2, price: 5.25 },
    );
    await market.updateMarketLiquiditiesWithCrossLiquidity(
      false,
      [
        { outcome: 1, price: 2.1 },
        { outcome: 2, price: 3.0 },
      ],
      { outcome: 0, price: 5.25 },
    );

    // Then
    assert.deepEqual(await market.getMarketLiquidities(), {
      liquiditiesAgainst: [
        {
          liquidity: 40,
          outcome: 2,
          price: 5.25,
          sources: [
            { outcome: 0, price: 2.1 },
            { outcome: 1, price: 3 },
          ],
        },
        { liquidity: 100, outcome: 2, price: 3, sources: [] },
        { liquidity: 100, outcome: 1, price: 2.1, sources: [] },
      ],
      liquiditiesFor: [
        { liquidity: 100, outcome: 0, price: 2.1, sources: [] },
        {
          liquidity: 40,
          outcome: 0,
          price: 5.25,
          sources: [
            { outcome: 1, price: 2.1 },
            { outcome: 2, price: 3 },
          ],
        },
        { liquidity: 100, outcome: 1, price: 3, sources: [] },
      ],
    });
  });
});
