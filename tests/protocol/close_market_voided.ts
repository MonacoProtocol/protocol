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

    const balanceMarketCreated = await monaco.provider.connection.getBalance(
      marketOperator.publicKey,
    );
    const outcomeARent = await monaco.provider.connection.getBalance(
      market.outcomePks[0],
    );
    const outcomeBRent = await monaco.provider.connection.getBalance(
      market.outcomePks[1],
    );

    await market.open();
    await market.voidMarket();
    await market.completeVoid();
    await market.readyToClose();
    await market.closeOutcome(0);
    await market.closeOutcome(1);

    const marketRent = await monaco.provider.connection.getBalance(market.pk);
    const escrowRent = await monaco.provider.connection.getBalance(
      market.escrowPk,
    );
    const paymentsQueueRent = await monaco.provider.connection.getBalance(
      market.paymentsQueuePk,
    );
    const orderRequestQueueRent = await monaco.provider.connection.getBalance(
      market.orderRequestQueuePk,
    );

    await monaco.program.methods
      .closeMarket()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        authority: marketOperator.publicKey,
        commissionPaymentQueue: market.paymentsQueuePk,
        orderRequestQueue: market.orderRequestQueuePk,
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

    await monaco.program.methods
      .closeMarket()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        authority: marketOperator.publicKey,
        commissionPaymentQueue: market.paymentsQueuePk,
        orderRequestQueue: market.orderRequestQueuePk,
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
        commissionPaymentQueue: market.paymentsQueuePk,
        orderRequestQueue: market.orderRequestQueuePk,
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
      ["A", "B"],
      [price],
      marketOperator,
    );
    const marketB = await monaco.createMarket(
      ["A", "B"],
      [price],
      marketOperator,
    );

    await marketA.open();
    await marketA.voidMarket();
    await marketA.completeVoid();
    await marketA.readyToClose();
    await marketA.closeOutcome(0);
    await marketA.closeOutcome(1);

    await marketB.open();
    await marketB.voidMarket();
    await marketB.completeVoid();
    await marketB.readyToClose();
    await marketB.closeOutcome(0);
    await marketB.closeOutcome(1);

    await monaco.program.methods
      .closeMarket()
      .accounts({
        market: marketB.pk,
        marketEscrow: marketB.escrowPk,
        authority: marketOperator.publicKey,
        commissionPaymentQueue: marketB.paymentsQueuePk,
        orderRequestQueue: marketB.orderRequestQueuePk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "CloseAccountMarketMismatch");
      });
  });

  it("complete void: unclosed accounts", async () => {
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
    await market.voidMarket();

    await monaco.program.methods
      .completeMarketVoid()
      .accounts({
        market: market.pk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(
          e.error.errorCode.code,
          "MarketUnclosedAccountsCountNonZero",
        );
      });
  });
});
