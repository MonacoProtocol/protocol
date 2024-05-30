import * as anchor from "@coral-xyz/anchor";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";
import assert from "assert";
import { MarketOrderRequestQueue } from "../../npm-client";

describe("Order Request Processing", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  it("process order request", async function () {
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
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;
    assert.equal(orderRequestQueue.orderRequests.len, 1);
    assert.equal(await market.getTokenBalance(purchaser), 990);

    const orderPk = await market.processNextOrderRequest();

    // queue should have 0 unprocessed orders
    orderRequestQueue =
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;
    assert.equal(orderRequestQueue.orderRequests.len, 0);
    assert.equal(await market.getTokenBalance(purchaser), 990);

    // ensure order account matches the order request spec
    const order = await monaco.program.account.order.fetch(orderPk);
    assert.equal(order.market.toBase58(), market.pk.toBase58());
    assert.equal(order.marketOutcomeIndex, orderRequestOutcomeIndex);
    assert.equal(order.stake.toNumber() / 10 ** 6, orderRequestStake);
    assert.equal(order.expectedPrice, orderRequestPrice);
    assert.equal(order.forOutcome, orderRequestForOutcome);

    const matchingPool = await market.getForMatchingPool(
      orderRequestOutcomeIndex,
      orderRequestPrice,
    );
    assert.equal(matchingPool.liquidity, order.stake.toNumber() / 10 ** 6);
  });

  it("process expired order request", async function () {
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

    const nowUnixTimestamp: number = Math.floor(new Date().getTime() / 1000);
    await market._createOrderRequest(
      orderRequestOutcomeIndex,
      orderRequestForOutcome,
      orderRequestStake,
      orderRequestPrice,
      purchaser,
      {
        expiresOn: nowUnixTimestamp + 1,
      },
    );

    // queue should have 1 unprocessed order
    let orderRequestQueue =
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;
    assert.equal(orderRequestQueue.orderRequests.len, 1);
    assert.equal(await market.getTokenBalance(purchaser), 990);

    const orderPk = await market.processNextOrderRequest();

    // queue should have 0 unprocessed orders
    orderRequestQueue =
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;
    assert.equal(orderRequestQueue.orderRequests.len, 0);
    assert.equal(await market.getTokenBalance(purchaser), 1000);

    // ensure order account matches the order request spec
    try {
      await monaco.fetchOrder(orderPk);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        "Account does not exist or has no data " + orderPk,
      );
    }

    const matchingPool = await market.getForMatchingPool(
      orderRequestOutcomeIndex,
      orderRequestPrice,
    );
    assert.equal(matchingPool.liquidity, 0);
  });

  it("process order request - inplay market, success if delay has passed", async function () {
    const prices = [3.0, 4.9];
    const inplayDelay = 1;

    const orderRequestOutcomeIndex = 0;
    const orderRequestStake = 10.0;
    const orderRequestPrice = 3.0;
    const orderRequestForOutcome = true;

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

    await market.forOrderRequest(
      orderRequestOutcomeIndex,
      orderRequestStake,
      orderRequestPrice,
      purchaser,
    );

    await market.updateMarketEventStartTimeToNow();
    await market.moveMarketToInplay();

    let orderRequestQueue =
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;
    assert.equal(orderRequestQueue.orderRequests.len, 1);

    // Wait for delay to expire and process orders
    await new Promise((resolve) => setTimeout(resolve, inplayDelay * 1000));

    const orderPk = await market.processNextOrderRequest();

    orderRequestQueue =
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;
    assert.equal(orderRequestQueue.orderRequests.len, 0);

    const order = await monaco.program.account.order.fetch(orderPk);
    assert.equal(order.market.toBase58(), market.pk.toBase58());
    assert.equal(order.marketOutcomeIndex, orderRequestOutcomeIndex);
    assert.equal(order.stake.toNumber() / 10 ** 6, orderRequestStake);
    assert.equal(order.expectedPrice, orderRequestPrice);
    assert.equal(order.forOutcome, orderRequestForOutcome);

    const matchingPool = await market.getForMatchingPool(
      orderRequestOutcomeIndex,
      orderRequestPrice,
    );
    assert.equal(matchingPool.liquidity, order.stake.toNumber() / 10 ** 6);
  });

  it("process order request - inplay market, fails if delay hasn't passed", async function () {
    const prices = [3.0, 4.9];
    const inplayDelay = 10;

    const orderRequestOutcomeIndex = 0;
    const orderRequestStake = 10.0;
    const orderRequestPrice = 3.0;

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

    await market.forOrderRequest(
      orderRequestOutcomeIndex,
      orderRequestStake,
      orderRequestPrice,
      purchaser,
    );

    const orderRequestQueue =
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;
    assert.equal(orderRequestQueue.orderRequests.len, 1);

    try {
      await market.processNextOrderRequest();
      assert.fail("processNextOrderRequest should have failed");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "InplayDelay");
    }
  });
});
