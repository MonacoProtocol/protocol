import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import * as assert from "assert";
import console from "console";
import { authoriseMarketOperator } from "../../npm-admin-client/src";

describe("Close market outcome accounts", () => {
  it("close market outcome: success", async () => {
    const price = 2.0;
    const marketOperator = await createWalletWithBalance(monaco.provider);
    await authoriseMarketOperator(
      monaco.getRawProgram(),
      marketOperator.publicKey,
    );
    const market = await monaco.createMarket(
      ["A", "B", "C"],
      [price],
      marketOperator,
    );

    await market.open();

    const balanceOutcomeCreated = await monaco.provider.connection.getBalance(
      marketOperator.publicKey,
    );

    await market.settle(0);
    await market.completeSettlement();
    await market.readyToClose();

    const marketOutcomePk = market.outcomePks[0];
    const marketOutcomeRent = await monaco.provider.connection.getBalance(
      marketOutcomePk,
    );

    await monaco.program.methods
      .closeMarketOutcome()
      .accounts({
        market: market.pk,
        authority: marketOperator.publicKey,
        marketOutcome: marketOutcomePk,
      })
      .rpc()
      .catch((e) => console.log(e));

    const balanceAfterOutcomeClosed =
      await monaco.provider.connection.getBalance(marketOperator.publicKey);
    const expectedBalanceAfterOutcomeClosed =
      balanceOutcomeCreated + marketOutcomeRent;

    assert.equal(balanceAfterOutcomeClosed, expectedBalanceAfterOutcomeClosed);
  });

  it("close market outcome: market incorrect status", async () => {
    const price = 2.0;
    const marketOperator = await createWalletWithBalance(monaco.provider);
    await authoriseMarketOperator(
      monaco.getRawProgram(),
      marketOperator.publicKey,
    );
    const market = await monaco.createMarket(
      ["A", "B", "C"],
      [price],
      marketOperator,
    );

    await market.open();
    await market.settle(0);
    await market.completeSettlement();

    await monaco.program.methods
      .closeMarketOutcome()
      .accounts({
        market: market.pk,
        authority: marketOperator.publicKey,
        marketOutcome: market.outcomePks[0],
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "MarketNotReadyToClose");
      });
  });

  it("close market outcome: purchaser mismatch", async () => {
    const price = 2.0;
    const marketOperator = await createWalletWithBalance(monaco.provider);
    await authoriseMarketOperator(
      monaco.getRawProgram(),
      marketOperator.publicKey,
    );
    const market = await monaco.createMarket(
      ["A", "B", "C"],
      [price],
      marketOperator,
    );

    await market.open();
    await market.settle(0);
    await market.completeSettlement();
    await market.readyToClose();

    await monaco.program.methods
      .closeMarketOutcome()
      .accounts({
        market: market.pk,
        authority: monaco.operatorPk,
        marketOutcome: market.outcomePks[0],
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountPurchaserMismatch");
      });
  });

  it("close market outcome: market mismatch", async () => {
    const price = 2.0;
    const marketOperator = await createWalletWithBalance(monaco.provider);
    await authoriseMarketOperator(
      monaco.getRawProgram(),
      marketOperator.publicKey,
    );
    const marketA = await monaco.createMarket(
      ["A", "B", "C"],
      [price],
      marketOperator,
    );
    const marketB = await monaco.createMarket(
      ["A", "B", "C"],
      [price],
      marketOperator,
    );

    await marketA.open();
    await marketA.settle(0);
    await marketA.completeSettlement();
    await marketA.readyToClose();

    await marketB.open();
    await marketB.settle(0);
    await marketB.completeSettlement();
    await marketB.readyToClose();

    await monaco.program.methods
      .closeMarketOutcome()
      .accounts({
        market: marketB.pk,
        authority: monaco.operatorPk,
        marketOutcome: marketA.outcomePks[0],
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountMarketMismatch");
      });
  });
});
