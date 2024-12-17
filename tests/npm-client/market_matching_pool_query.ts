import { monaco } from "../util/wrappers";
import * as assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { MarketMatchingPools } from "../../npm-client";
import { Program } from "@coral-xyz/anchor";

describe("Market Matching Pool Queries", () => {
  it("fetch matching pool by market", async () => {
    const marketA = await monaco.create3WayMarket([2.0]);
    const marketB = await monaco.create3WayMarket([2.0]);

    const purchaser = await createWalletWithBalance(monaco.provider);
    await marketA.airdrop(purchaser, 100.0);
    await marketB.airdrop(purchaser, 100.0);

    await marketA.forOrder(0, 1, 2.0, purchaser);
    await marketB.forOrder(0, 1, 2.0, purchaser);

    assert.notEqual(
      marketA.matchingPools[0][2.0].forOutcome.toBase58(),
      marketB.matchingPools[0][2.0].forOutcome.toBase58(),
    );

    const marketMatchingPoolQuery = MarketMatchingPools.marketMatchingPoolQuery(
      monaco.program as Program,
    );

    let response = await marketMatchingPoolQuery
      .filterByMarket(marketA.pk)
      .fetch();
    assert.equal(response.data.accounts.length, 1);
    assert.equal(
      response.data.accounts[0].publicKey.toBase58(),
      marketA.matchingPools[0][2.0].forOutcome.toBase58(),
    );

    response = await marketMatchingPoolQuery.filterByMarket(marketB.pk).fetch();
    assert.equal(response.data.accounts.length, 1);
    assert.equal(
      response.data.accounts[0].publicKey.toBase58(),
      marketB.matchingPools[0][2.0].forOutcome.toBase58(),
    );
  });

  it("fetch matching pool by outcome", async () => {
    const market = await monaco.create3WayMarket([2.0]);

    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 100.0);

    await market.forOrder(0, 1, 2.0, purchaser);
    await market.forOrder(1, 1, 2.0, purchaser);
    await market.forOrder(2, 1, 2.0, purchaser);

    const marketMatchingPoolQuery = MarketMatchingPools.marketMatchingPoolQuery(
      monaco.program as Program,
    ).filterByMarket(market.pk);

    let response = await marketMatchingPoolQuery.fetch();
    assert.equal(response.data.accounts.length, 3);

    response = await marketMatchingPoolQuery
      .filterByMarketOutcomeIndex(0)
      .fetch();
    assert.equal(response.data.accounts.length, 1);
    assert.equal(
      response.data.accounts[0].publicKey.toBase58(),
      market.matchingPools[0][2.0].forOutcome.toBase58(),
    );

    response = await marketMatchingPoolQuery
      .filterByMarketOutcomeIndex(1)
      .fetch();
    assert.equal(response.data.accounts.length, 1);
    assert.equal(
      response.data.accounts[0].publicKey.toBase58(),
      market.matchingPools[1][2.0].forOutcome.toBase58(),
    );

    response = await marketMatchingPoolQuery
      .filterByMarketOutcomeIndex(2)
      .fetch();
    assert.equal(response.data.accounts.length, 1);
    assert.equal(
      response.data.accounts[0].publicKey.toBase58(),
      market.matchingPools[2][2.0].forOutcome.toBase58(),
    );
  });

  it("fetch matching pool by for/against", async () => {
    const market = await monaco.create3WayMarket([2.0]);

    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 100.0);

    await market.forOrder(0, 1, 2.0, purchaser);
    await market.againstOrder(0, 1, 2.0, purchaser);

    const marketMatchingPoolQuery = MarketMatchingPools.marketMatchingPoolQuery(
      monaco.program as Program,
    ).filterByMarket(market.pk);

    let response = await marketMatchingPoolQuery.fetch();
    assert.equal(response.data.accounts.length, 2);

    response = await marketMatchingPoolQuery.filterByForOutcome(true).fetch();
    assert.equal(response.data.accounts.length, 1);
    assert.equal(
      response.data.accounts[0].publicKey.toBase58(),
      market.matchingPools[0][2.0].forOutcome.toBase58(),
    );

    response = await marketMatchingPoolQuery.filterByForOutcome(false).fetch();
    assert.equal(response.data.accounts.length, 1);
    assert.equal(
      response.data.accounts[0].publicKey.toBase58(),
      market.matchingPools[0][2.0].against.toBase58(),
    );
  });
});
