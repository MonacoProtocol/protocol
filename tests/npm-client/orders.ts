import { Program } from "@coral-xyz/anchor";
import assert from "assert";
import {
  getPendingOrdersForMarketByOutcomeIndex,
  filterByMarketAndMarketOutcomeIndexAndStatusAndForOutcome,
  getPendingOrdersForMarket,
} from "../../npm-client/src";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";

describe("Pending Orders", () => {
  const prices = [2.0, 3.0];
  const stake = 10000000;
  const stakeSimple = 10.0;

  it("Includes partially matched and open orders", async () => {
    const market = await monaco.create3WayMarket(prices);

    const [purchaser, purchaser2] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
    ]);
    await Promise.all([
      market.airdrop(purchaser, stake),
      market.airdrop(purchaser2, stake),
    ]);
    await market.forOrder(0, stakeSimple, prices[0], purchaser);
    await market.againstOrder(0, stakeSimple + 1, prices[0], purchaser2);

    await market.processMatchingQueue();
    await market.forOrder(0, stakeSimple, prices[1], purchaser);
    await new Promise((e) => setTimeout(e, 1000));

    const response = await getPendingOrdersForMarket(
      monaco.program as Program,
      market.pk,
    );

    assert(response.success);
    assert.deepEqual(response.errors, []);
    assert.deepEqual(response.data.pendingOrders.length, 2);
  });
});

describe("Pending Orders by index", () => {
  const prices = [2.0, 3.0];
  const stake = 10000000;
  const stakeSimple = 10.0;

  it("Has pending open orders for each outcome", async () => {
    const market = await monaco.create3WayMarket(prices);

    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, stake);
    await market.forOrder(0, stakeSimple, prices[0], purchaser);
    await market.forOrder(1, stakeSimple, prices[0], purchaser);
    await market.forOrder(2, stakeSimple, prices[0], purchaser);

    const [response0, response1, response2] = await Promise.all([
      await getPendingOrdersForMarketByOutcomeIndex(
        monaco.program as Program,
        market.pk,
        0,
      ),
      await getPendingOrdersForMarketByOutcomeIndex(
        monaco.program as Program,
        market.pk,
        1,
      ),
      await getPendingOrdersForMarketByOutcomeIndex(
        monaco.program as Program,
        market.pk,
        2,
      ),
    ]);

    assert(response0.success);
    assert.deepEqual(response0.errors, []);
    assert.deepEqual(response0.data.pendingOrders.length, 1);
    assert.deepEqual(response1.data.pendingOrders.length, 1);
    assert.deepEqual(response2.data.pendingOrders.length, 1);
  });

  it("Includes partially matched and open orders", async () => {
    const market = await monaco.create3WayMarket(prices);

    const [purchaser, purchaser2] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
    ]);
    await Promise.all([
      market.airdrop(purchaser, stake),
      market.airdrop(purchaser2, stake),
    ]);
    await market.forOrder(0, stakeSimple, prices[0], purchaser);
    await market.againstOrder(0, stakeSimple + 1, prices[0], purchaser2);

    // match orders and place an additional order
    await market.processMatchingQueue();
    await market.forOrder(0, stakeSimple, prices[1], purchaser);
    await new Promise((e) => setTimeout(e, 1000));

    const response = await getPendingOrdersForMarketByOutcomeIndex(
      monaco.program as Program,
      market.pk,
      0,
    );

    assert(response.success);
    assert.deepEqual(response.errors, []);
    assert.deepEqual(response.data.pendingOrders.length, 2);
  });
});

describe("Pending Orders by index and for order", () => {
  const prices = [2.0, 3.0];
  const stake = 10000000;
  const stakeSimple = 10.0;
  const outcomeIndex = 0;

  it("Filters by forOrder and includes partially matched and open orders", async () => {
    const market = await monaco.create3WayMarket(prices);

    const [purchaser, purchaser2] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
    ]);
    await Promise.all([
      market.airdrop(purchaser, stake),
      market.airdrop(purchaser2, stake),
    ]);
    await market.forOrder(outcomeIndex, stakeSimple, prices[0], purchaser);
    await market.againstOrder(
      outcomeIndex,
      stakeSimple + 1,
      prices[0],
      purchaser2,
    );

    const [preMatchResponseFor, preMatchResponseAgainst] = await Promise.all([
      filterByMarketAndMarketOutcomeIndexAndStatusAndForOutcome(
        monaco.program as Program,
        market.pk,
        outcomeIndex,
        true,
      ),
      filterByMarketAndMarketOutcomeIndexAndStatusAndForOutcome(
        monaco.program as Program,
        market.pk,
        outcomeIndex,
        false,
      ),
    ]);

    assert.deepEqual(preMatchResponseFor.errors, []);
    assert.deepEqual(preMatchResponseAgainst.errors, []);
    assert.deepEqual(preMatchResponseFor.data.pendingOrders.length, 1);
    assert.deepEqual(preMatchResponseAgainst.data.pendingOrders.length, 1);

    // match orders and place an additional order
    await market.processMatchingQueue();
    await market.forOrder(0, stakeSimple, prices[1], purchaser);
    await new Promise((e) => setTimeout(e, 1000));

    const [postMatchResponseFor, postMatchResponseAgainst] = await Promise.all([
      filterByMarketAndMarketOutcomeIndexAndStatusAndForOutcome(
        monaco.program as Program,
        market.pk,
        outcomeIndex,
        true,
      ),
      filterByMarketAndMarketOutcomeIndexAndStatusAndForOutcome(
        monaco.program as Program,
        market.pk,
        outcomeIndex,
        false,
      ),
    ]);

    assert(postMatchResponseFor.success);
    assert.deepEqual(postMatchResponseFor.errors, []);
    assert.deepEqual(postMatchResponseFor.data.pendingOrders.length, 1);
    assert.deepEqual(postMatchResponseAgainst.data.pendingOrders.length, 1);
  });
});
