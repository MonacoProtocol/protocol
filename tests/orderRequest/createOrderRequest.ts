import * as anchor from "@coral-xyz/anchor";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";
import assert from "assert";

describe("Order Request Creation", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  it("create order request", async function () {
    const prices = [3.0, 4.9];

    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(prices),
    ]);
    await market.airdrop(purchaser, 1000.0);

    await market.forOrderRequest(0, 10.0, prices[0], purchaser);
    await market.againstOrderRequest(1, 10.0, prices[1], purchaser);

    const orderRequestQueue =
      await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      );

    assert.equal(orderRequestQueue.market.toBase58(), market.pk.toBase58());
    assert.equal(orderRequestQueue.orderRequests.len, 2);

    const forOrderRequest = orderRequestQueue.orderRequests.items[0];
    assert.equal(forOrderRequest.marketOutcomeIndex, 0);
    assert.ok(forOrderRequest.forOutcome);
    assert.equal(forOrderRequest.product, null);
    assert.equal(forOrderRequest.stake.toNumber() / 10 ** 6, 10);
    assert.equal(forOrderRequest.expectedPrice, prices[0]);
    assert.equal(
      forOrderRequest.purchaser.toBase58(),
      purchaser.publicKey.toBase58(),
    );
    assert.equal(forOrderRequest.delayExpirationTimestamp.toNumber(), 0);

    const againstOrderRequest = orderRequestQueue.orderRequests.items[1];
    assert.equal(againstOrderRequest.marketOutcomeIndex, 1);
    assert.ok(!againstOrderRequest.forOutcome);
    assert.equal(againstOrderRequest.product, null);
    assert.equal(againstOrderRequest.stake.toNumber() / 10 ** 6, 10);
    assert.equal(againstOrderRequest.expectedPrice, prices[1]);
    assert.equal(
      againstOrderRequest.purchaser.toBase58(),
      purchaser.publicKey.toBase58(),
    );
    assert.equal(againstOrderRequest.delayExpirationTimestamp.toNumber(), 0);
  });

  it("create order request for inplay market", async function () {
    const prices = [3.0, 4.9];
    const inplayDelay = 10;

    const now = Math.floor(new Date().getTime() / 1000);
    const eventStartTimestamp = now + 20;
    const marketLockTimestamp = now + 1000;

    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(
        prices,
        true,
        inplayDelay,
        eventStartTimestamp,
        marketLockTimestamp,
      ),
    ]);

    await market.airdrop(purchaser, 1000.0);
    await market.updateMarketEventStartTimeToNow();
    await market.moveMarketToInplay();
    await market.forOrderRequest(0, 10.0, prices[0], purchaser);
    await market.againstOrderRequest(1, 10.0, prices[1], purchaser);

    const orderRequestQueue =
      await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      );
    assert.equal(orderRequestQueue.orderRequests.len, 2);

    // check that inplay de
    const forOrderRequest = orderRequestQueue.orderRequests.items[0];
    assert.ok(forOrderRequest.forOutcome);
    assert.ok(
      forOrderRequest.delayExpirationTimestamp.toNumber() >
        Math.floor(new Date().getTime() / 1000),
    );

    const againstOrderRequest = orderRequestQueue.orderRequests.items[1];
    assert.ok(!againstOrderRequest.forOutcome);
    assert.ok(
      againstOrderRequest.delayExpirationTimestamp.toNumber() >
        Math.floor(new Date().getTime() / 1000),
    );
  });
});
