import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";
import assert from "assert";

describe("Force void market", () => {
  it("void while items remain in matching queue", async () => {
    const price = 2.0;
    const [p1, p2, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);

    // set up purchasers
    await market.airdrop(p1, 100.0);
    await market.airdrop(p2, 200.0);
    const p1Balance = await market.getTokenBalance(p1.publicKey);
    const p2Balance = await market.getTokenBalance(p2.publicKey);

    // create orders
    const p1OrderPk = await market.forOrder(0, 10.0, price, p1);
    const p2OrderPk = await market.againstOrder(0, 20.0, price, p2);

    // ensure there are items still on matching queue
    const matchingQueueLen = await market.getMarketMatchingQueueLength();
    assert.equal(matchingQueueLen, 2);

    // force void market
    await market.voidMarket(true);

    const matchingQueueLenPostVoid =
      await market.getMarketMatchingQueueLength();
    assert.equal(matchingQueueLenPostVoid, 0);

    // void market positions to return funds to purchasers
    await market.voidMarketPositionForPurchaser(p1.publicKey);
    await market.voidMarketPositionForPurchaser(p2.publicKey);

    // check balances
    const p1BalanceAfter = await market.getTokenBalance(p1.publicKey);
    const p2BalanceAfter = await market.getTokenBalance(p2.publicKey);
    assert.equal(p1Balance, p1BalanceAfter);
    assert.equal(p2Balance, p2BalanceAfter);

    // ensure market voiding can be completed
    await market.voidOrder(p1OrderPk);
    await market.voidOrder(p2OrderPk);
    await market.completeVoid();
    const voidedMarket = await monaco.program.account.market.fetch(market.pk);
    assert.ok(voidedMarket.marketStatus.voided);

    // set market ready to close
    await market.readyToClose();
    const closingMarket = await monaco.program.account.market.fetch(market.pk);
    assert.ok(closingMarket.marketStatus.readyToClose);

    // ensure market can be closed
    await market.closeOrder(p1OrderPk);
    await market.closeOrder(p2OrderPk);
    await market.closeMarketPosition(p1.publicKey);
    await market.closeMarketPosition(p2.publicKey);
    await market.closeMarketMatchingPool(0, price, true);
    await market.closeMarketMatchingPool(0, price, false);
    await market.closeOutcome(0);
    await market.closeOutcome(1);
    await market.closeOutcome(2);
    await market.closeMarketQueues();
    await market.close();

    try {
      await monaco.program.account.market.fetch(market.pk);
      assert.fail("expected Account does not exist or has no data...");
    } catch (e) {
      assert.equal(
        e.message,
        `Account does not exist or has no data ${market.pk.toBase58()}`,
      );
    }
  });
});
