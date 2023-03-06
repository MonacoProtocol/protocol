import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import * as assert from "assert";
import console from "console";

describe("Close market matching pool accounts", () => {
  it("close market matching pool: success", async () => {
    const price = 2.0;
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);

    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    const forOrder = await market.forOrder(0, 10, price, purchaserA);
    const againstOrder = await market.againstOrder(0, 10, price, purchaserB);

    const balanceMatchingPoolCreated =
      await monaco.provider.connection.getBalance(purchaserA.publicKey);

    await market.match(forOrder, againstOrder);
    await market.settle(0);
    await market.settleOrder(forOrder);
    await market.settleOrder(againstOrder);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.completeSettlement();
    await market.readyToClose();

    const matchingPoolPk = market.matchingPools[0][2.0].forOutcome;
    const marketOutcomePk = market.outcomePks[0];

    const matchingPoolRent = await monaco.provider.connection.getBalance(
      matchingPoolPk,
    );

    await monaco.program.methods
      .closeMarketMatchingPool(price, true)
      .accounts({
        market: market.pk,
        marketOutcome: marketOutcomePk,
        purchaser: purchaserA.publicKey,
        marketMatchingPool: matchingPoolPk,
        authorisedOperators: await monaco.findCrankAuthorisedOperatorsPda(),
        crankOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => console.log(e));

    const balanceAfterMatchingPoolClosed =
      await monaco.provider.connection.getBalance(purchaserA.publicKey);
    const expectedBalanceAfterMatchingPoolClosed =
      balanceMatchingPoolCreated + matchingPoolRent;

    assert.equal(
      balanceAfterMatchingPoolClosed,
      expectedBalanceAfterMatchingPoolClosed,
    );
  });

  it("close matching pool: market incorrect status", async () => {
    const price = 2.0;
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);

    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    const forOrder = await market.forOrder(0, 10, price, purchaserA);
    const againstOrder = await market.againstOrder(0, 10, price, purchaserB);

    await market.match(forOrder, againstOrder);
    await market.settle(0);
    await market.settleOrder(forOrder);
    await market.settleOrder(againstOrder);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.completeSettlement();

    const matchingPoolPk = market.matchingPools[0][2.0].forOutcome;
    const marketOutcomePk = market.outcomePks[0];

    await monaco.program.methods
      .closeMarketMatchingPool(price, true)
      .accounts({
        market: market.pk,
        marketOutcome: marketOutcomePk,
        purchaser: purchaserA.publicKey,
        marketMatchingPool: matchingPoolPk,
        authorisedOperators: await monaco.findCrankAuthorisedOperatorsPda(),
        crankOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "MarketNotReadyToClose");
      });
  });

  it("close matching pool: purchaser mismatch", async () => {
    const price = 2.0;
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);

    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    const forOrder = await market.forOrder(0, 10, price, purchaserA);
    const againstOrder = await market.againstOrder(0, 10, price, purchaserB);

    await market.match(forOrder, againstOrder);
    await market.settle(0);
    await market.settleOrder(forOrder);
    await market.settleOrder(againstOrder);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.completeSettlement();
    await market.readyToClose();

    const matchingPoolPk = market.matchingPools[0][2.0].forOutcome;
    const marketOutcomePk = market.outcomePks[0];

    await monaco.program.methods
      .closeMarketMatchingPool(price, true)
      .accounts({
        market: market.pk,
        marketOutcome: marketOutcomePk,
        purchaser: purchaserB.publicKey,
        marketMatchingPool: matchingPoolPk,
        authorisedOperators: await monaco.findCrankAuthorisedOperatorsPda(),
        crankOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountPurchaserMismatch");
      });
  });

  it("close matching pool: market mismatch", async () => {
    const price = 2.0;
    const [purchaserA, purchaserB, marketA, marketB] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
      monaco.create3WayMarket([price]),
    ]);

    await marketA.airdrop(purchaserA, 100.0);
    await marketA.airdrop(purchaserB, 100.0);
    const forOrder = await marketA.forOrder(0, 10, price, purchaserA);
    const againstOrder = await marketA.againstOrder(0, 10, price, purchaserB);

    await marketA.match(forOrder, againstOrder);
    await marketA.settle(0);
    await marketA.settleOrder(forOrder);
    await marketA.settleOrder(againstOrder);
    await marketA.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await marketA.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await marketA.completeSettlement();
    await marketA.readyToClose();

    await marketB.settle(0);
    await marketB.completeSettlement();
    await marketB.readyToClose();

    const matchingPoolPk = marketA.matchingPools[0][2.0].forOutcome;
    const marketOutcomePk = marketA.outcomePks[0];

    await monaco.program.methods
      .closeMarketMatchingPool(price, true)
      .accounts({
        market: marketB.pk,
        marketOutcome: marketOutcomePk,
        purchaser: purchaserA.publicKey,
        marketMatchingPool: matchingPoolPk,
        authorisedOperators: await monaco.findCrankAuthorisedOperatorsPda(),
        crankOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountMarketMismatch");
      });
  });

  it("close matching pool: market outcome mismatch", async () => {
    const price = 2.0;
    const [purchaserA, purchaserB, marketA, marketB] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
      monaco.create3WayMarket([price]),
    ]);

    await marketA.airdrop(purchaserA, 100.0);
    await marketA.airdrop(purchaserB, 100.0);
    const forOrder = await marketA.forOrder(0, 10, price, purchaserA);
    const againstOrder = await marketA.againstOrder(0, 10, price, purchaserB);

    await marketA.match(forOrder, againstOrder);
    await marketA.settle(0);
    await marketA.settleOrder(forOrder);
    await marketA.settleOrder(againstOrder);
    await marketA.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await marketA.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await marketA.completeSettlement();
    await marketA.readyToClose();

    await marketB.settle(0);
    await marketB.completeSettlement();
    await marketB.readyToClose();

    const matchingPoolPk = marketA.matchingPools[0][2.0].forOutcome;
    const marketOutcomePk = marketA.outcomePks[1];

    await monaco.program.methods
      .closeMarketMatchingPool(price, true)
      .accounts({
        market: marketA.pk,
        marketOutcome: marketOutcomePk,
        purchaser: purchaserA.publicKey,
        marketMatchingPool: matchingPoolPk,
        authorisedOperators: await monaco.findCrankAuthorisedOperatorsPda(),
        crankOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "ConstraintSeeds");
      });
  });
});
