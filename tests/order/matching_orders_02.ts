import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";
import { AnchorError } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

describe("Order Matching: Cross Liquidity", () => {
  it("fractional matches", async () => {
    const PRICES = [2.7, 3.0, 3.3];
    const [purchaserA, purchaserB, purchaserC, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.createMarket(["A", "B", "C"], PRICES),
    ]);
    await market.open(true);

    await Promise.all([
      market.airdrop(purchaserA, 1),
      market.airdrop(purchaserB, 1),
      market.airdrop(purchaserC, 1),
    ]);

    // orders
    const orderA = await market.forOrder(0, 0.008, PRICES[0], purchaserA);
    const orderB = await market.forOrder(1, 0.009, PRICES[1], purchaserB);

    // cross liquidities
    await market.updateMarketLiquiditiesWithCrossLiquidity(
      true,
      [
        { outcome: 0, price: PRICES[0] },
        { outcome: 1, price: PRICES[1] },
      ],
      { outcome: 2, price: 3.375 },
    );

    // validate expected liquidity
    assert.deepEqual(await monaco.getMarketLiquidities(market.liquiditiesPk), {
      liquiditiesAgainst: [
        {
          liquidity: 0.006,
          outcome: 2,
          price: 3.375,
          sources: [
            { outcome: 0, price: 2.7 },
            { outcome: 1, price: 3 },
          ],
        },
      ],
      liquiditiesFor: [
        { liquidity: 0.008, outcome: 0, price: 2.7, sources: [] },
        { liquidity: 0.009, outcome: 1, price: 3, sources: [] },
      ],
    });

    // match cross liquidity
    await market.forOrder(2, 0.005, 3.375, purchaserC).then(
      function (_) {
        assert.fail("CreationInvalidPrice expected");
      },
      function (e: AnchorError) {
        assert.equal(e.error.errorCode.code, "CreationInvalidPrice");
      },
    );
    const orderC = await market.forOrder(2, 0.005, PRICES[2], purchaserC);
    await market.processMatchingQueue();

    assert.deepEqual(await monaco.getMarketLiquidities(market.liquiditiesPk), {
      liquiditiesAgainst: [
        {
          liquidity: 0.001,
          outcome: 2,
          price: 3.375,
          sources: [
            { outcome: 0, price: 2.7 },
            { outcome: 1, price: 3 },
          ],
        },
      ],
      liquiditiesFor: [
        { liquidity: 0.001_75, outcome: 0, price: 2.7, sources: [] },
        { liquidity: 0.003_375, outcome: 1, price: 3, sources: [] },
      ],
    });
    assert.deepEqual(
      await Promise.all([
        getOrderLocal(orderA), // outcome 0
        getOrderLocal(orderB), // outcome 1
        getOrderLocal(orderC), // outcome 2
      ]),
      [
        {
          stake: 0.008,
          stakeUnmatched: 0.001_75,
          stakeVoided: 0,
          payout: 0.016_875,
          price: 2.7,
        },
        {
          payout: 0.016_875,
          price: 3,
          stake: 0.009,
          stakeUnmatched: 0.003_375,
          stakeVoided: 0,
        },
        {
          payout: 0.016_875,
          price: 3.3,
          stake: 0.005,
          stakeUnmatched: 0,
          stakeVoided: 0,
        },
      ],
    );
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getTokenBalance(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getTokenBalance(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getTokenBalance(purchaserC),
        market.getEscrowBalance(),
      ]),
      [
        {
          matched: [0.010625, -0.00625, -0.00625],
          unmatched: [0, 0.00175, 0.00175],
        },
        0.992,
        {
          matched: [-0.005625, 0.01125, -0.005625],
          unmatched: [0.003375, 0, 0.003375],
        },
        0.991,
        { matched: [-0.005, -0.005, 0.011875], unmatched: [0, 0, 0] },
        0.995,
        0.022,
      ],
    );

    // match reminder
    await market.againstOrder(0, 0.001_8, PRICES[0], purchaserA).then(
      function (_) {
        assert.fail("CreationStakePrecisionIsTooHigh expected");
      },
      function (e: AnchorError) {
        assert.equal(e.error.errorCode.code, "CreationStakePrecisionIsTooHigh");
      },
    );
    const orderD = await market.againstOrder(0, 0.002, PRICES[0], purchaserA);
    await market.processMatchingQueue();

    assert.deepEqual(await monaco.getMarketLiquidities(market.liquiditiesPk), {
      liquiditiesAgainst: [
        {
          liquidity: 0.001,
          outcome: 2,
          price: 3.375,
          sources: [
            { outcome: 0, price: 2.7 },
            { outcome: 1, price: 3 },
          ],
        },
        { liquidity: 0.000_25, outcome: 0, price: 2.7, sources: [] },
      ],
      liquiditiesFor: [
        { liquidity: 0.003_375, outcome: 1, price: 3, sources: [] },
      ],
    });
    assert.deepEqual(
      await Promise.all([
        getOrderLocal(orderA), // outcome 0
        getOrderLocal(orderB), // outcome 1
        getOrderLocal(orderC), // outcome 2
        getOrderLocal(orderD), // outcome 2
      ]),
      [
        {
          payout: 0.021_6,
          price: 2.7,
          stake: 0.008,
          stakeUnmatched: 0,
          stakeVoided: 0,
        },
        {
          payout: 0.016_875,
          price: 3,
          stake: 0.009,
          stakeUnmatched: 0.003_375,
          stakeVoided: 0,
        },
        {
          payout: 0.016_875,
          price: 3.3,
          stake: 0.005,
          stakeUnmatched: 0,
          stakeVoided: 0,
        },
        {
          payout: 0.004_725,
          price: 2.7,
          stake: 0.002,
          stakeUnmatched: 0.000_25,
          stakeVoided: 0,
        },
      ],
    );
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getTokenBalance(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getTokenBalance(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getTokenBalance(purchaserC),
        market.getEscrowBalance(),
      ]),
      [
        {
          matched: [0.010625, -0.00625, -0.00625],
          unmatched: [0.000425, 0, 0],
        },
        0.993_75,
        {
          matched: [-0.005625, 0.01125, -0.005625],
          unmatched: [0.003375, 0, 0.003375],
        },
        0.991,
        { matched: [-0.005, -0.005, 0.011875], unmatched: [0, 0, 0] },
        0.995,
        0.020_25,
      ],
    );

    // Settlement before commission
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey, false);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey, false);
    await market.settleMarketPositionForPurchaser(purchaserC.publicKey, false);
    await market.settleOrder(orderA);
    await market.settleOrder(orderB);
    await market.settleOrder(orderC);
    await market.settleOrder(orderD);

    const balances = await Promise.all([
      market.getTokenBalance(purchaserA),
      market.getTokenBalance(purchaserB),
      market.getTokenBalance(purchaserC),
      market.getEscrowBalance(),
    ]);
    assert.deepEqual(
      [balances, balances.reduce((sum, current) => sum + current, 0)],
      [[1.009563, 0.994375, 0.995, 0.001062], 3],
    );
  });

  it("after cancellation", async () => {
    const PRICES = [2.7, 3.0, 3.3];
    const [purchaserA, purchaserB, purchaserC, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.createMarket(["A", "B", "C"], PRICES),
    ]);
    await market.open(true);

    await Promise.all([
      market.airdrop(purchaserA, 1),
      market.airdrop(purchaserB, 1),
      market.airdrop(purchaserC, 1),
    ]);

    // orders
    const orderA = await market.forOrder(0, 0.008, PRICES[0], purchaserA);
    const orderB = await market.forOrder(1, 0.009, PRICES[1], purchaserB);

    // cross liquidities
    await market.updateMarketLiquiditiesWithCrossLiquidity(
      true,
      [
        { outcome: 0, price: PRICES[0] },
        { outcome: 1, price: PRICES[1] },
      ],
      { outcome: 2, price: 3.375 },
    );

    // cancel one of the sources
    await market.cancel(orderA, purchaserA);

    // validate expected liquidity (cancellation does not remove cross liquidity)
    assert.deepEqual(await monaco.getMarketLiquidities(market.liquiditiesPk), {
      liquiditiesAgainst: [
        {
          liquidity: 0.006,
          outcome: 2,
          price: 3.375,
          sources: [
            { outcome: 0, price: 2.7 },
            { outcome: 1, price: 3 },
          ],
        },
      ],
      liquiditiesFor: [{ liquidity: 0.009, outcome: 1, price: 3, sources: [] }],
    });

    // match cross liquidity
    const orderC = await market.forOrder(2, 0.005, PRICES[2], purchaserC);
    await market.processMatchingQueue();

    // validate expected liquidity (match attempt does remove cross liquidity)
    assert.deepEqual(await monaco.getMarketLiquidities(market.liquiditiesPk), {
      liquiditiesAgainst: [],
      liquiditiesFor: [
        { liquidity: 0.009, outcome: 1, price: 3, sources: [] },
        { liquidity: 0.005, outcome: 2, price: 3.3, sources: [] },
      ],
    });
    assert.deepEqual(
      await Promise.all([
        //getOrderLocal(orderA), // outcome 0
        getOrderLocal(orderB), // outcome 1
        getOrderLocal(orderC), // outcome 2
      ]),
      [
        {
          payout: 0,
          price: 3,
          stake: 0.009,
          stakeUnmatched: 0.009,
          stakeVoided: 0,
        },
        {
          payout: 0,
          price: 3.3,
          stake: 0.005,
          stakeUnmatched: 0.005,
          stakeVoided: 0,
        },
      ],
    );
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getTokenBalance(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getTokenBalance(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getTokenBalance(purchaserC),
        market.getEscrowBalance(),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [0, 0, 0] },
        1,
        { matched: [0, 0, 0], unmatched: [0.009, 0, 0.009] },
        0.991,
        { matched: [0, 0, 0], unmatched: [0.005, 0.005, 0] },
        0.995,
        0.014,
      ],
    );

    // Settlement before commission
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey, false);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey, false);
    await market.settleMarketPositionForPurchaser(purchaserC.publicKey, false);
    // await market.settleOrder(orderA); canceled
    await market.settleOrder(orderB);
    await market.settleOrder(orderC);

    const balances = await Promise.all([
      market.getTokenBalance(purchaserA),
      market.getTokenBalance(purchaserB),
      market.getTokenBalance(purchaserC),
      market.getEscrowBalance(),
    ]);
    assert.deepEqual(
      [balances, balances.reduce((sum, current) => sum + current, 0)],
      [[1, 1, 1, 0], 3],
    );
  });
});

async function getOrderLocal(orderPk: PublicKey) {
  const decimalsMultiplier = 10 ** 6;
  const order = await monaco.fetchOrder(orderPk);
  return {
    stake: order.stake.toNumber() / decimalsMultiplier,
    stakeUnmatched: order.stakeUnmatched.toNumber() / decimalsMultiplier,
    stakeVoided: order.voidedStake.toNumber() / decimalsMultiplier,
    price: order.expectedPrice,
    payout: order.payout.toNumber() / decimalsMultiplier,
  };
}
