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

    await market.processMatchingQueue();
    await market.settle(0);
    await market.settleOrder(forOrder);
    await market.settleOrder(againstOrder);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.completeSettlement();
    await market.readyToClose();

    const matchingPoolPk = market.matchingPools[0][2.0].forOutcome;

    await monaco.program.methods
      .closeMarketMatchingPool()
      .accounts({
        market: market.pk,
        payer: monaco.operatorPk,
        marketMatchingPool: matchingPoolPk,
      })
      .rpc()
      .catch((e) => console.error(e));

    try {
      await monaco.fetchMarketMatchingPool(matchingPoolPk);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        "Account does not exist or has no data " + matchingPoolPk,
      );
    }
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

    await market.processMatchingQueue();
    await market.settle(0);
    await market.settleOrder(forOrder);
    await market.settleOrder(againstOrder);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.completeSettlement();

    const matchingPoolPk = market.matchingPools[0][2.0].forOutcome;

    await monaco.program.methods
      .closeMarketMatchingPool()
      .accounts({
        market: market.pk,
        payer: monaco.operatorPk,
        marketMatchingPool: matchingPoolPk,
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

    await market.processMatchingQueue();
    await market.settle(0);
    await market.settleOrder(forOrder);
    await market.settleOrder(againstOrder);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.completeSettlement();
    await market.readyToClose();

    const matchingPoolPk = market.matchingPools[0][2.0].forOutcome;

    await monaco.program.methods
      .closeMarketMatchingPool()
      .accounts({
        market: market.pk,
        payer: monaco.operatorPk,
        marketMatchingPool: matchingPoolPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountPayerMismatch");
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

    await marketA.processMatchingQueue();
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

    await monaco.program.methods
      .closeMarketMatchingPool()
      .accounts({
        market: marketB.pk,
        payer: monaco.operatorPk,
        marketMatchingPool: matchingPoolPk,
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

    await marketA.processMatchingQueue();
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

    await monaco.program.methods
      .closeMarketMatchingPool()
      .accounts({
        market: marketA.pk,
        payer: monaco.operatorPk,
        marketMatchingPool: matchingPoolPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "ConstraintSeeds");
      });
  });
});
