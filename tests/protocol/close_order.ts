import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import * as assert from "assert";
import console from "console";

describe("Close order accounts", () => {
  it("close order: success", async () => {
    const price = 2.0;
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);

    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    const forOrder = await market.forOrder(
      0,
      10,
      price,
      purchaserA,
      undefined,
      purchaserA,
    );
    const againstOrder = await market.againstOrder(
      0,
      10,
      price,
      purchaserB,
      undefined,
      purchaserB,
    );

    const balanceOrderCreated = await monaco.provider.connection.getBalance(
      purchaserA.publicKey,
    );

    await market.processMatchingQueue();
    await market.settle(0);
    await market.settleOrder(forOrder);
    await market.settleOrder(againstOrder);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.completeSettlement();
    await market.readyToClose();

    const orderAccountRent = await monaco.provider.connection.getBalance(
      forOrder,
    );

    await monaco.program.methods
      .closeOrder()
      .accounts({
        market: market.pk,
        payer: purchaserA.publicKey,
        order: forOrder,
      })
      .rpc()
      .catch((e) => console.log(e));

    const balanceAfterOrderClosed = await monaco.provider.connection.getBalance(
      purchaserA.publicKey,
    );
    const expectedBalanceAfterOrderClosed =
      balanceOrderCreated + orderAccountRent;

    assert.equal(balanceAfterOrderClosed, expectedBalanceAfterOrderClosed);
  });

  it("close order: market incorrect status", async () => {
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

    await monaco.program.methods
      .closeOrder()
      .accounts({
        market: market.pk,
        payer: monaco.operatorPk,
        order: forOrder,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "MarketNotReadyToClose");
      });
  });

  it("close order: payer mismatch", async () => {
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

    await monaco.program.methods
      .closeOrder()
      .accounts({
        market: market.pk,
        payer: monaco.operatorPk,
        order: forOrder,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountPayerMismatch");
      });
  });

  it("close order: market mismatch", async () => {
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

    await monaco.program.methods
      .closeOrder()
      .accounts({
        market: marketB.pk,
        payer: monaco.operatorPk,
        order: forOrder,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountMarketMismatch");
      });
  });

  it("close order: voided market", async () => {
    const price = 2.0;
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    const forOrderPk = await market.forOrder(0, 10.0, price, purchaser);

    await market.voidMarket();
    await market.voidMarketPositionForPurchaser(purchaser.publicKey);
    await market.voidOrder(forOrderPk);
    await market.completeVoid();
    await market.readyToClose();

    await monaco.program.methods
      .closeOrder()
      .accounts({
        market: market.pk,
        payer: monaco.operatorPk,
        order: forOrderPk,
      })
      .rpc()
      .catch((e) => console.log(e));

    try {
      await monaco.program.account.market.fetch(forOrderPk);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        `Account does not exist or has no data ${forOrderPk.toBase58()}`,
      );
    }
  });
});
