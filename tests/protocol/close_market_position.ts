import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import * as assert from "assert";
import console from "console";
import { findMarketPositionPda } from "../../npm-client/src";

describe("Close market position accounts", () => {
  it("close market position: success", async () => {
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

    const balancePositionCreated = await monaco.provider.connection.getBalance(
      purchaserA.publicKey,
    );

    await market.match(forOrder, againstOrder);
    await market.settle(0);
    await market.settleOrder(forOrder);
    await market.settleOrder(againstOrder);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);
    await market.completeSettlement();
    await market.readyToClose();

    const marketPosition = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      purchaserA.publicKey,
    );
    const marketPositionPk = marketPosition.data.pda;
    const marketPositionRent = await monaco.provider.connection.getBalance(
      marketPositionPk,
    );

    await monaco.program.methods
      .closeMarketPosition()
      .accounts({
        market: market.pk,
        purchaser: purchaserA.publicKey,
        marketPosition: marketPositionPk,
      })
      .rpc()
      .catch((e) => console.log(e));

    const balanceAfterPositionClosed =
      await monaco.provider.connection.getBalance(purchaserA.publicKey);
    const expectedBalanceAfterPositionClosed =
      balancePositionCreated + marketPositionRent;

    assert.equal(
      balanceAfterPositionClosed,
      expectedBalanceAfterPositionClosed,
    );
  });

  it("close market position: market incorrect status", async () => {
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

    const marketPosition = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      purchaserA.publicKey,
    );
    const marketPositionPk = marketPosition.data.pda;

    await monaco.program.methods
      .closeMarketPosition()
      .accounts({
        market: market.pk,
        purchaser: purchaserA.publicKey,
        marketPosition: marketPositionPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "MarketNotReadyToClose");
      });
  });

  it("close market position: purchaser mismatch", async () => {
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

    const marketPosition = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      purchaserA.publicKey,
    );
    const marketPositionPk = marketPosition.data.pda;

    await monaco.program.methods
      .closeMarketPosition()
      .accounts({
        market: market.pk,
        purchaser: purchaserB.publicKey,
        marketPosition: marketPositionPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountPurchaserMismatch");
      });
  });

  it("close market position: market mismatch", async () => {
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

    const marketPosition = await findMarketPositionPda(
      monaco.getRawProgram(),
      marketA.pk,
      purchaserA.publicKey,
    );
    const marketPositionPk = marketPosition.data.pda;

    await monaco.program.methods
      .closeMarketPosition()
      .accounts({
        market: marketB.pk,
        purchaser: purchaserA.publicKey,
        marketPosition: marketPositionPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountMarketMismatch");
      });
  });
});
