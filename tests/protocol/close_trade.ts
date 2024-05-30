import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import * as assert from "assert";
import console from "console";
import { findTradePda } from "../../npm-client/src";

describe("Close trade accounts", () => {
  it("close trade: success", async () => {
    const price = 2.0;
    const [purchaserA, purchaserB, crankOperator, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);

    // use a different crank operator to make costs/refund easier to calculate
    await monaco.authoriseCrankOperator(crankOperator);

    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    const forOrder = await market.forOrder(0, 10, price, purchaserA);
    const againstOrder = await market.againstOrder(0, 10, price, purchaserB);

    // match orders, creating the new trade accounts
    await market.processMatchingQueue(crankOperator);
    const balanceAfterTrades = await monaco.provider.connection.getBalance(
      crankOperator.publicKey,
    );

    const tradeResponse = await findTradePda(monaco.getRawProgram(), forOrder);
    const tradePk = tradeResponse.data.tradePk;
    const tradeAccountRent = await monaco.provider.connection.getBalance(
      tradePk,
    );

    await market.settle(0);
    await market.settleOrder(forOrder);
    await market.settleOrder(againstOrder);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.completeSettlement();
    await market.readyToClose();

    await monaco.program.methods
      .closeTrade()
      .accounts({
        market: market.pk,
        payer: crankOperator.publicKey,
        trade: tradePk,
      })
      .rpc()
      .catch((e) => console.log(e));

    const balanceAfterTradeClosed = await monaco.provider.connection.getBalance(
      crankOperator.publicKey,
    );
    const expectedBalanceAfterTradeClosed =
      balanceAfterTrades + tradeAccountRent;

    assert.equal(balanceAfterTradeClosed, expectedBalanceAfterTradeClosed);
  });

  it("close trade: market incorrect status", async () => {
    const price = 2.0;
    const [purchaserA, purchaserB, crankOperator, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);

    // use a different crank operator to make costs/refund easier to calculate
    await monaco.authoriseCrankOperator(crankOperator);

    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    const forOrder = await market.forOrder(0, 10, price, purchaserA);
    const againstOrder = await market.againstOrder(0, 10, price, purchaserB);

    // match orders, creating the new trade accounts
    const processMatchingQueueResponse = await market.processMatchingQueue(
      crankOperator,
    );

    await market.settle(0);
    await market.settleOrder(forOrder);
    await market.settleOrder(againstOrder);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.completeSettlement();

    await monaco.program.methods
      .closeTrade()
      .accounts({
        market: market.pk,
        payer: crankOperator.publicKey,
        trade: processMatchingQueueResponse.makerOrderTrade,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "MarketNotReadyToClose");
      });
  });

  it("close trade: market mismatch", async () => {
    const price = 2.0;
    const [purchaserA, purchaserB, crankOperator, marketA, marketB] =
      await Promise.all([
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        monaco.create3WayMarket([price]),
        monaco.create3WayMarket([price]),
      ]);

    // use a different crank operator to make costs/refund easier to calculate
    await monaco.authoriseCrankOperator(crankOperator);

    await marketA.airdrop(purchaserA, 100.0);
    await marketA.airdrop(purchaserB, 100.0);
    const forOrder = await marketA.forOrder(0, 10, price, purchaserA);
    const againstOrder = await marketA.againstOrder(0, 10, price, purchaserB);

    // match orders, creating the new trade accounts
    const processMatchingQueueResponse = await marketA.processMatchingQueue(
      crankOperator,
    );

    await marketA.settle(0);
    await marketA.settleOrder(forOrder);
    await marketA.settleOrder(againstOrder);
    await marketA.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await marketA.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await marketA.completeSettlement();
    await marketA.readyToClose();

    await monaco.program.methods
      .closeTrade()
      .accounts({
        market: marketB.pk,
        payer: crankOperator.publicKey,
        trade: processMatchingQueueResponse.makerOrderTrade,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountMarketMismatch");
      });
  });

  it("close trade: payer mismatch", async () => {
    const price = 2.0;
    const [purchaserA, purchaserB, crankOperator, marketA, marketB] =
      await Promise.all([
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        monaco.create3WayMarket([price]),
        monaco.create3WayMarket([price]),
      ]);

    // use a different crank operator to make costs/refund easier to calculate
    await monaco.authoriseCrankOperator(crankOperator);

    await marketA.airdrop(purchaserA, 100.0);
    await marketA.airdrop(purchaserB, 100.0);
    const forOrder = await marketA.forOrder(0, 10, price, purchaserA);
    const againstOrder = await marketA.againstOrder(0, 10, price, purchaserB);

    // match orders, creating the new trade accounts
    const processMatchingQueueResponse = await marketA.processMatchingQueue(
      crankOperator,
    );

    await marketA.settle(0);
    await marketA.settleOrder(forOrder);
    await marketA.settleOrder(againstOrder);
    await marketA.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await marketA.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await marketA.completeSettlement();
    await marketA.readyToClose();

    await monaco.program.methods
      .closeTrade()
      .accounts({
        market: marketB.pk,
        payer: purchaserA.publicKey,
        trade: processMatchingQueueResponse.makerOrderTrade,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountPayerMismatch");
      });
  });
});
