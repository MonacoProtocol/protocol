import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import * as assert from "assert";
import console from "console";
import { authoriseMarketOperator } from "../../npm-admin-client/src";

describe("Close market accounts", () => {
  it("close market: success", async () => {
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

    const balanceMarketCreated = await monaco.provider.connection.getBalance(
      marketOperator.publicKey,
    );

    await market.open();
    await market.settle(0);
    await market.completeSettlement();
    await market.readyToClose();

    const marketRent = await monaco.provider.connection.getBalance(market.pk);
    const escrowRent = await monaco.provider.connection.getBalance(
      market.escrowPk,
    );

    await monaco.program.methods
      .closeMarket()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        authority: marketOperator.publicKey,
        authorisedOperators: await monaco.findCrankAuthorisedOperatorsPda(),
        crankOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => console.log(e));

    const balanceAfterMarketClosed =
      await monaco.provider.connection.getBalance(marketOperator.publicKey);
    const expectedBalanceAfterMarketClosed =
      balanceMarketCreated + marketRent + escrowRent;

    assert.equal(balanceAfterMarketClosed, expectedBalanceAfterMarketClosed);
  });

  it("close market: market incorrect status", async () => {
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
      .closeMarket()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        authority: marketOperator.publicKey,
        authorisedOperators: await monaco.findCrankAuthorisedOperatorsPda(),
        crankOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "MarketNotReadyToClose");
      });
  });

  it("close market: purchaser mismatch", async () => {
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
      .closeMarket()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        authority: monaco.operatorPk,
        authorisedOperators: await monaco.findCrankAuthorisedOperatorsPda(),
        crankOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountPurchaserMismatch");
      });
  });

  it("close market: market mismatch", async () => {
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
      .closeMarket()
      .accounts({
        market: marketB.pk,
        marketEscrow: marketB.escrowPk,
        authority: marketOperator.publicKey,
        authorisedOperators: await monaco.findCrankAuthorisedOperatorsPda(),
        crankOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountMarketMismatch");
      });
  });
});
