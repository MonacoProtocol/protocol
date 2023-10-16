import { Program } from "@coral-xyz/anchor";
import assert from "assert";
import { getMarketPrices } from "../../npm-client/src";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";

describe("Market Prices", () => {
  const prices = [2.0, 3.0];
  const stake = 10000000;
  const stakeSimple = 10.0;

  it("Market no prices", async () => {
    const market = await monaco.create3WayMarket(prices);

    const response = await getMarketPrices(
      monaco.program as Program,
      market.pk,
    );

    assert(response.success);
    assert(response.data.market);
    assert(response.data.marketOutcomeAccounts);
    assert.deepEqual(response.errors, []);
    assert.deepEqual(response.data.pendingOrders, []);
    assert.deepEqual(response.data.marketPrices, []);
    assert.deepEqual(response.data.marketOutcomeAccounts.length, 3);
  });

  it("Market single price per outcome", async () => {
    const market = await monaco.create3WayMarket(prices);

    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, stake);

    await market.forOrder(0, stakeSimple, prices[0], purchaser);
    await market.forOrder(1, stakeSimple, prices[0], purchaser);
    await market.forOrder(2, stakeSimple, prices[0], purchaser);

    const response = await getMarketPrices(
      monaco.program as Program,
      market.pk,
    );

    assert.deepEqual(response.data.pendingOrders.length, 3);
    assert.deepEqual(response.data.marketPrices.length, 3);
    assert.deepEqual(
      response.data.pendingOrders[0].account.stakeUnmatched.toNumber(),
      stake,
    );
    assert.deepEqual(
      response.data.pendingOrders[0].account.stake.toNumber(),
      stake,
    );
  });

  it("Market multiple prices for outcome", async () => {
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
    await market.forOrder(0, stakeSimple, prices[1], purchaser);
    await market.forOrder(0, stakeSimple, prices[0], purchaser2);

    const response = await getMarketPrices(
      monaco.program as Program,
      market.pk,
    );

    assert(response.success);
    assert.deepEqual(response.errors, []);
    assert.deepEqual(response.data.pendingOrders.length, 3);
    assert.deepEqual(response.data.marketPrices.length, 2);
  });

  it("Market partially matched and fully matched", async () => {
    const market = await monaco.create3WayMarket(prices);

    const [purchaser, purchaser2] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
    ]);
    await Promise.all([
      market.airdrop(purchaser, stake),
      market.airdrop(purchaser2, stake),
    ]);

    const order1 = await market.forOrder(0, stakeSimple, prices[0], purchaser);
    const order2 = await market.againstOrder(
      0,
      stakeSimple + 1,
      prices[0],
      purchaser2,
    );

    await market.match(order1, order2);
    await new Promise((e) => setTimeout(e, 1000));

    const response = await getMarketPrices(
      monaco.program as Program,
      market.pk,
    );

    assert(response.success);
    assert.deepEqual(response.errors, []);
    assert.deepEqual(response.data.pendingOrders.length, 1);
    assert.deepEqual(response.data.marketPrices.length, 1);
    assert.deepEqual(
      response.data.pendingOrders[0].account.stakeUnmatched.toNumber(),
      1000000,
    );
  });
});
