import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import * as assert from "assert";
import console from "console";
import { authoriseMarketOperator } from "../../npm-admin-client/src";

describe("Close market accounts (voided)", () => {
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
    await market.voidMarket();
    await market.completeVoid();
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

    // ensure rent has been returned
    const expectedBalanceAfterMarketClosed =
      balanceMarketCreated + marketRent + escrowRent;
    assert.equal(balanceAfterMarketClosed, expectedBalanceAfterMarketClosed);

    await monaco.program.account.market.fetch(market.pk).catch((e) => {
      assert.equal(
        e.message,
        `Account does not exist or has no data ${market.pk.toBase58()}`,
      );
    });

    await monaco.provider.connection
      .getAccountInfo(market.escrowPk)
      .catch((e) => {
        assert.equal(
          e.message,
          `Account does not exist or has no data ${market.escrowPk.toBase58()}`,
        );
      });
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
    await market.voidMarket();
    await market.completeVoid();

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
    await market.voidMarket();
    await market.completeVoid();
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
    await marketA.void();
    await marketA.completeVoid();
    await marketA.readyToClose();

    await marketB.open();
    await marketB.void();
    await marketB.completeVoid();
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
