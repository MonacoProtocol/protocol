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
      ["A", "B"],
      [price],
      marketOperator,
    );
    await market.open();

    const balanceMarketCreated = await monaco.provider.connection.getBalance(
      marketOperator.publicKey,
    );
    const outcomeARent = await monaco.provider.connection.getBalance(
      market.outcomePks[0],
    );
    const outcomeBRent = await monaco.provider.connection.getBalance(
      market.outcomePks[1],
    );
    const liquiditiesRent = await monaco.provider.connection.getBalance(
      market.liquiditiesPk,
    );
    const matchingQueueRent = await monaco.provider.connection.getBalance(
      market.matchingQueuePk,
    );
    const paymentsQueueRent = await monaco.provider.connection.getBalance(
      market.paymentsQueuePk,
    );
    const orderRequestQueueRent = await monaco.provider.connection.getBalance(
      market.orderRequestQueuePk,
    );

    await market.voidMarket();
    await market.completeVoid();
    await market.readyToClose();
    await market.closeOutcome(0);
    await market.closeOutcome(1);
    await market.closeMarketQueues();

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
      })
      .rpc()
      .catch((e) => console.log(e));

    const balanceAfterMarketClosed =
      await monaco.provider.connection.getBalance(marketOperator.publicKey);

    // ensure rent has been returned
    const expectedBalanceAfterMarketClosed =
      balanceMarketCreated +
      marketRent +
      escrowRent +
      liquiditiesRent +
      matchingQueueRent +
      paymentsQueueRent +
      orderRequestQueueRent +
      outcomeARent +
      outcomeBRent;
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

    try {
      await monaco.program.methods
        .closeMarket()
        .accounts({
          market: market.pk,
          marketEscrow: market.escrowPk,
          authority: marketOperator.publicKey,
        })
        .rpc();
      assert.fail("MarketNotReadyToClose expected");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "MarketNotReadyToClose");
    }
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

    try {
      await monaco.program.methods
        .closeMarket()
        .accounts({
          market: market.pk,
          marketEscrow: market.escrowPk,
          authority: monaco.operatorPk,
        })
        .rpc();
      assert.fail("CloseAccountPurchaserMismatch expected");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CloseAccountPurchaserMismatch");
    }
  });
});
