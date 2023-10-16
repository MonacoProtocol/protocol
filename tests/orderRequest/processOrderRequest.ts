import * as anchor from "@coral-xyz/anchor";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";
import assert from "assert";

describe("Order Request Processing", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  it("create order request", async function () {
    const prices = [3.0, 4.9];

    const orderRequestOutcomeIndex = 0;
    const orderRequestStake = 10.0;
    const orderRequestPrice = 3.0;
    const orderRequestForOutcome = true;

    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(prices),
    ]);
    await market.airdrop(purchaser, 1000.0);

    await market.forOrderRequest(
      orderRequestOutcomeIndex,
      orderRequestStake,
      orderRequestPrice,
      purchaser,
    );

    // queue should have 1 unprocessed order
    let orderRequestQueue =
      await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      );
    assert.equal(orderRequestQueue.orderRequests.len, 1);

    const orderPk = await market.processNextOrderRequest();

    // queue should have 0 unprocessed orders
    orderRequestQueue =
      await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      );
    assert.equal(orderRequestQueue.orderRequests.len, 0);

    // ensure order account matches the order request spec
    const order = await monaco.program.account.order.fetch(orderPk);
    assert.equal(order.market.toBase58(), market.pk.toBase58());
    assert.equal(order.marketOutcomeIndex, orderRequestOutcomeIndex);
    assert.equal(order.stake.toNumber() / 10 ** 6, orderRequestStake);
    assert.equal(order.expectedPrice, orderRequestPrice);
    assert.equal(order.forOutcome, orderRequestForOutcome);
  });
});
