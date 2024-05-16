import * as anchor from "@coral-xyz/anchor";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";
import assert from "assert";
import { MarketOrderRequestQueue } from "../../npm-client";

describe("Dequeue Order Request", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  it("success - dequeue and refund order request", async function () {
    const prices = [3.0];

    const [purchaser, purchaser2, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(prices),
    ]);
    await market.airdrop(purchaser, 1000.0);
    await market.airdrop(purchaser2, 1000.0);

    const stake = 10.0;

    await market.forOrderRequest(0, stake, prices[0], purchaser);
    await market.againstOrderRequest(1, stake, prices[0], purchaser2);

    assert.equal(await market.getTokenBalance(purchaser), 1000.0 - stake);
    assert.equal(
      await market.getTokenBalance(purchaser2),
      1000.0 - stake * (prices[0] - 1),
    );

    let orderRequestQueue =
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;

    assert.equal(orderRequestQueue.market.toBase58(), market.pk.toBase58());
    assert.equal(orderRequestQueue.orderRequests.len, 2);

    await market.dequeueOrderRequest();

    orderRequestQueue =
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;

    assert.equal(orderRequestQueue.orderRequests.len, 1);
    assert.equal(await market.getTokenBalance(purchaser), 1000.0);
    assert.equal(
      await market.getTokenBalance(purchaser2),
      1000.0 - stake * (prices[0] - 1),
    );

    await market.dequeueOrderRequest();

    orderRequestQueue =
      await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      );

    assert.equal(orderRequestQueue.orderRequests.len, 0);
    assert.equal(await market.getTokenBalance(purchaser), 1000.0);
    assert.equal(await market.getTokenBalance(purchaser2), 1000.0);
  });
});
