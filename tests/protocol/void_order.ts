import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";
import assert from "assert";
import { authoriseMarketOperator } from "../../npm-admin-client";

describe("Void order", () => {
  it("success", async () => {
    const price = 2.0;
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    const forOrderPk = await market.forOrder(0, 10.0, price, purchaser);
    const againstOrderPk = await market.againstOrder(0, 20.0, price, purchaser);

    await market.match(forOrderPk, againstOrderPk);

    await market.voidMarket();
    await market.voidOrder(forOrderPk);
    await market.voidOrder(againstOrderPk);

    const forOrder = await monaco.getOrder(forOrderPk);
    assert.deepEqual(forOrder.status, { voided: {} });
    assert.equal(forOrder.stakeVoided, 10);
    assert.equal(forOrder.stakeUnmatched, 0);

    const againstOrder = await monaco.getOrder(againstOrderPk);
    assert.deepEqual(againstOrder.status, { voided: {} });
    assert.equal(againstOrder.stakeVoided, 20);
    assert.equal(againstOrder.stakeUnmatched, 0);
  });

  it("cannot void order when market not ready to void", async () => {
    const price = 2.0;
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    const forOrderPk = await market.forOrder(0, 10.0, price, purchaser);

    try {
      await market.voidOrder(forOrderPk);
      assert.fail("expected VoidMarketNotReadyForVoid");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "VoidMarketNotReadyForVoid");
    }
  });

  it("order already voided", async () => {
    const price = 2.0;
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    const forOrderPk = await market.forOrder(0, 10.0, price, purchaser);

    await market.voidMarket();
    await market.voidOrder(forOrderPk);

    try {
      await market.voidOrder(forOrderPk);
      assert.fail("expected VoidOrderIsVoided");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "VoidOrderIsVoided");
    }
  });

  it("complete void: unsettled accounts", async () => {
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

    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 100.0);
    await market.open();
    await market.forOrder(0, 10, price, purchaser);
    await market.voidMarket();

    try {
      await monaco.program.methods
        .completeMarketVoid()
        .accounts({
          market: market.pk,
        })
        .rpc();
      assert.fail("MarketUnsettledAccountsCountNonZero expected");
    } catch (e) {
      assert.equal(
        e.error.errorCode.code,
        "MarketUnsettledAccountsCountNonZero",
      );
    }
  });
});
