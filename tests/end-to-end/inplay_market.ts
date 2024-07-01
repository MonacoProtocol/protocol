import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import assert from "assert";
import { Program } from "@coral-xyz/anchor";
import {
  MarketMatchingPools,
  MarketOutcomes,
  MarketPositions,
  Orders,
  Trades,
} from "../../npm-client/src/";
import console from "console";

describe("End to end test of", () => {
  it("basic lifecycle of inplay market", async () => {
    //TODO
    const inplayDelay = 10;

    const now = Math.floor(new Date().getTime() / 1000);
    const eventStartTimestamp = now + 20;
    const marketLockTimestamp = now + 1000;

    const market = await monaco.create3WayMarket(
      [2.0, 3.0],
      true,
      inplayDelay,
      eventStartTimestamp,
      marketLockTimestamp,
      { cancelUnmatched: {} },
      { cancelUnmatched: {} },
    );
    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 100.0);

    // Liquidity, prior match & No liquidity, prior match
    await market.forOrder(0, 1, 2.0, purchaser);
    await market.againstOrder(0, 1, 2.0, purchaser);
    await market.processMatchingQueue();
    const prePlayOrder0_2 = await market.forOrder(0, 1, 2.0, purchaser);

    // No liquidity, no matches
    const prePlayOrder1_2 = await market.forOrder(1, 1, 2.0, purchaser);

    try {
      await market.moveMarketToInplay();
      assert.fail("Should have thrown error");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "MarketEventNotStarted");
    }

    // Move start time up to now
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await market.updateMarketEventStartTimeToNow();

    // Create an inplay order request before the market inplay flag has been updated
    let matchingPool;
    let orderRequestQueue;
    try {
      orderRequestQueue = await market.getOrderRequestQueue();
      assert.equal(orderRequestQueue.orderRequests.len, 0);
      await market.forOrderRequest(1, 4.2, 3.0, purchaser);
      orderRequestQueue = await market.getOrderRequestQueue();
      assert.equal(orderRequestQueue.orderRequests.len, 1);
    } catch (e) {
      console.log(e);
      throw e;
    }

    await market.moveMarketToInplay();

    // Changes below will be validated after all requests are processed
    //
    // 1. Inplay order into existing non-zero'd preplay matching pool
    // With existing liquidity
    matchingPool = await market.getForMatchingPool(0, 2.0);
    assert.equal(matchingPool.liquidity, 1);

    await market.forOrderRequest(0, 2, 2.0, purchaser);
    matchingPool = await market.getForMatchingPool(0, 2.0);
    assert.equal(matchingPool.liquidity, 1);

    // Without existing liquidity
    matchingPool = await market.getAgainstMatchingPool(0, 2.0);
    assert.equal(matchingPool.liquidity, 0);

    await market.againstOrderRequest(0, 3, 2.0, purchaser);
    matchingPool = await market.getAgainstMatchingPool(0, 2.0);
    assert.equal(matchingPool.liquidity, 0);

    // 2. Inplay order into existing zero'd preplay matching pool
    // With existing liquidity
    matchingPool = await market.getForMatchingPool(1, 2.0);
    assert.equal(matchingPool.liquidity, 1);

    await market.moveMarketMatchingPoolToInplay(1, 2.0, true);

    matchingPool = await market.getForMatchingPool(1, 2.0);
    assert.equal(matchingPool.liquidity, 0);

    await market.forOrderRequest(1, 1, 2.0, purchaser);
    matchingPool = await market.getForMatchingPool(1, 2.0);
    assert.equal(matchingPool.liquidity, 0);

    // 3. Inplay order creates new inplay matching pool
    try {
      await market.getForMatchingPool(2, 2.0);
    } catch (e) {
      expect(e.message).toMatch(/^Account does not exist or has no data/);
    }

    // 4. Inplay order creates a new matching pool but is never used
    await market.forOrderRequest(2, 1, 3.0, purchaser);

    const inPlayOrder21 = await market.forOrderRequest(2, 1, 2.0, purchaser);
    const inPlayOrder22 = await market.againstOrderRequest(
      2,
      1,
      2.0,
      purchaser,
    );

    // Wait for delay to expire and process orders
    await new Promise((resolve) => setTimeout(resolve, inplayDelay * 1000));

    await market.processOrderRequests();

    // Check liquidity that should be visible is visible
    matchingPool = await market.getForMatchingPool(0, 2.0);
    assert.equal(matchingPool.liquidity, 2);
    matchingPool = await market.getAgainstMatchingPool(0, 2.0);
    assert.equal(matchingPool.liquidity, 1);

    matchingPool = await market.getForMatchingPool(1, 2.0);
    assert.equal(matchingPool.liquidity, 1);

    matchingPool = await market.getForMatchingPool(1, 3.0);
    assert.equal(matchingPool.liquidity, 4.2);

    matchingPool = await market.getForMatchingPool(2, 2.0);
    assert.equal(matchingPool.liquidity, 1);
    matchingPool = await market.getAgainstMatchingPool(2, 2.0);
    assert.equal(matchingPool.liquidity, 0);

    // Match order with liquidity that is not yet visible (but should be)
    await market.processMatchingQueue();

    matchingPool = await market.getForMatchingPool(2, 2.0);
    let order = await monaco.getOrder(inPlayOrder21.data.orderPk);
    assert.deepEqual(matchingPool.liquidity, 0);
    assert.equal(order.stakeUnmatched, 0);
    matchingPool = await market.getAgainstMatchingPool(2, 2.0);
    order = await monaco.getOrder(inPlayOrder22.data.orderPk);
    assert.deepEqual(matchingPool.liquidity, 0);
    assert.equal(order.stakeUnmatched, 0);

    // Close orders due to event start
    assert.deepEqual((await market.getAccount()).unsettledAccountsCount, 12);
    order = await monaco.getOrder(prePlayOrder0_2);
    assert.equal(order.stakeUnmatched, 1);
    assert.equal(order.stakeVoided, 0);
    order = await monaco.getOrder(prePlayOrder1_2);
    assert.equal(order.stakeUnmatched, 1);
    assert.equal(order.stakeVoided, 0);

    await market.cancelPreplayOrderPostEventStart(prePlayOrder0_2);
    await market.cancelPreplayOrderPostEventStart(prePlayOrder1_2);

    assert.deepEqual((await market.getAccount()).unsettledAccountsCount, 10);
    order = await monaco.getOrder(prePlayOrder0_2);
    assert.equal(order.stakeUnmatched, 0);
    assert.equal(order.stakeVoided, 1);
    order = await monaco.getOrder(prePlayOrder1_2);
    assert.equal(order.stakeUnmatched, 0);
    assert.equal(order.stakeVoided, 1);

    // Settle market and market positions and orders
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(purchaser.publicKey);
    await Orders.orderQuery(monaco.program as Program)
      .filterByMarket(market.pk)
      .fetchPublicKeys()
      .then(async (response) => {
        for (const order of response.data.publicKeys) {
          await market.settleOrder(order);
        }
      });
    await market.completeSettlement();
    const marketAccount = await market.getAccount();
    assert.equal(marketAccount.unsettledAccountsCount, 0);
    assert.equal(marketAccount.unclosedAccountsCount, 29);

    // Close accounts
    await market.readyToClose();

    await Trades.tradeQuery(monaco.program as Program)
      .filterByMarket(market.pk)
      .fetchPublicKeys()
      .then(async (response) => {
        for (const trade of response.data.publicKeys) {
          await monaco.program.methods
            .closeTrade()
            .accounts({
              market: market.pk,
              trade: trade,
              payer: monaco.operatorPk,
            })
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            });
        }
      });

    await Orders.orderQuery(monaco.program as Program)
      .filterByMarket(market.pk)
      .fetchPublicKeys()
      .then(async (response) => {
        for (const order of response.data.publicKeys) {
          await monaco.program.methods
            .closeOrder()
            .accounts({
              market: market.pk,
              order: order,
              payer: monaco.operatorPk,
            })
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            });
        }
      });

    await MarketPositions.marketPositionQuery(monaco.program as Program)
      .filterByMarket(market.pk)
      .fetchPublicKeys()
      .then(async (response) => {
        for (const marketPosition of response.data.publicKeys) {
          await monaco.program.methods
            .closeMarketPosition()
            .accounts({
              market: market.pk,
              marketPosition: marketPosition,
              payer: purchaser.publicKey,
            })
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            });
        }
      });

    await MarketMatchingPools.marketMatchingPoolQuery(monaco.program as Program)
      .filterByMarket(market.pk)
      .fetchPublicKeys()
      .then(async (response) => {
        for (const marketMatchingPool of response.data.publicKeys) {
          await monaco.program.methods
            .closeMarketMatchingPool()
            .accounts({
              market: market.pk,
              marketMatchingPool: marketMatchingPool,
              payer: monaco.operatorPk,
            })
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            });
        }
      });

    await MarketOutcomes.marketOutcomeQuery(monaco.program as Program)
      .filterByMarket(market.pk)
      .fetchPublicKeys()
      .then(async (response) => {
        for (const marketOutcome of response.data.publicKeys) {
          await monaco.program.methods
            .closeMarketOutcome()
            .accounts({
              market: market.pk,
              marketOutcome: marketOutcome,
              authority: monaco.operatorPk,
            })
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            });
        }
      });

    await monaco.program.methods
      .closeMarketQueues()
      .accounts({
        market: market.pk,
        liquidities: market.liquiditiesPk,
        matchingQueue: market.matchingQueuePk,
        commissionPaymentQueue: market.paymentsQueuePk,
        orderRequestQueue: market.orderRequestQueuePk,
        authority: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => console.log(e));

    await monaco.program.methods
      .closeMarket()
      .accounts({
        market: market.pk,
        authority: monaco.operatorPk,
        marketEscrow: market.escrowPk,
        marketFunding: market.fundingPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  });

  it("market is not enabled for inplay", async () => {
    const now = Math.floor(new Date().getTime() / 1000);
    const eventStartTimestamp = now + 20;
    const marketLockTimestamp = eventStartTimestamp;

    const market = await monaco.create3WayMarket(
      [2.0, 3.0],
      false,
      0,
      eventStartTimestamp,
      marketLockTimestamp,
    );

    try {
      await market.moveMarketToInplay();
      assert.fail("Should have thrown error");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "MarketInplayNotEnabled");
    }
  });
});
