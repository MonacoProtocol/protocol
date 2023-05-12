import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";
import assert from "assert";

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
    assert.deepEqual(forOrder.status, { cancelled: {} });
    assert.equal(forOrder.stakeVoided, 0);

    const againstOrder = await monaco.getOrder(againstOrderPk);
    assert.deepEqual(againstOrder.status, { cancelled: {} });
    assert.equal(againstOrder.stakeVoided, 10);
  });

  it("market not ready to void", async () => {
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
});
