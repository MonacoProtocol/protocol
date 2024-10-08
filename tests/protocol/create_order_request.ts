import { createWalletWithBalance } from "../util/test_util";
import assert from "assert";
import { DEFAULT_PRICE_LADDER } from "../../npm-client/";
import { monaco } from "../util/wrappers";

describe("Protocol - Create Order Request", () => {
  it("fill up the queue", async () => {
    const prices = DEFAULT_PRICE_LADDER;

    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(prices),
    ]);
    await market.airdrop(purchaser, 1000.0);

    let i = 0;
    try {
      for (; i < 100; i += 1) {
        await market.forOrderRequest(0, 1.0, prices[i], purchaser);
      }
      fail("expected OrderRequestCreationQueueFull.");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "OrderRequestCreationQueueFull");
    }

    assert.equal((await market.getOrderRequestQueue()).orderRequests.len, 50);

    await market.processNextOrderRequest();

    assert.equal((await market.getOrderRequestQueue()).orderRequests.len, 49);

    try {
      await market.forOrderRequest(0, 1.0, prices[i], purchaser);
    } catch (e) {
      fail(e);
    }

    try {
      await market.forOrderRequest(0, 1.0, prices[i], purchaser);
      fail("expected OrderRequestCreationQueueFull.");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "OrderRequestCreationQueueFull");
    }
    assert.equal((await market.getOrderRequestQueue()).orderRequests.len, 50);
  });
});
