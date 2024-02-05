import { monaco } from "../util/wrappers";
import {
  findAllMarketMatchingPoolPks,
  findMarketMatchingPoolPda,
  getAllMarketMatchingPools,
} from "../../npm-client/src/market_matching_pools";
import * as assert from "assert";
import { createWalletWithBalance } from "../util/test_util";

describe("Market Matching Pools", () => {
  it("fetch market matching pool pks", async () => {
    const priceLadder = [2.0, 3.0, 4.0];
    const market = await monaco.create3WayMarket(priceLadder);

    // priceLadder.length * number of outcomes * forOutcome (true/false)
    const expectedNumberOfMatchingPools = priceLadder.length * 3 * 2;

    const matchingPoolPks = await findAllMarketMatchingPoolPks(
      monaco.getRawProgram(),
      market.pk,
    );

    assert.equal(
      matchingPoolPks.data.marketMatchingPoolPksWithSeeds.map(
        (i) => i.publicKey,
      ).length,
      expectedNumberOfMatchingPools,
    );
  });

  it("fetch market matching pool pks - verify seeds returned match pk", async () => {
    const priceLadder = [2.0];
    const numberOfOutcomes = 3;
    const market = await monaco.create3WayMarket(priceLadder);

    const matchingPoolPks = await findAllMarketMatchingPoolPks(
      monaco.getRawProgram(),
      market.pk,
    );

    for (
      let outcomeIndex = 0;
      outcomeIndex < numberOfOutcomes;
      outcomeIndex++
    ) {
      for (const forOutcome of [true, false]) {
        const pda = await findMarketMatchingPoolPda(
          monaco.getRawProgram(),
          market.pk,
          outcomeIndex,
          2.0,
          forOutcome,
        );
        const matchingPk =
          matchingPoolPks.data.marketMatchingPoolPksWithSeeds.find((pk) => {
            const seeds = pk.seeds;
            return (
              seeds.forOutcome == forOutcome.toString() &&
              seeds.outcomeIndex == outcomeIndex.toString() &&
              seeds.price == "2.000"
            );
          });

        assert.equal(pda.data.pda.toBase58(), matchingPk.publicKey.toBase58());
      }
    }
  });

  it("fetch market matching pools", async () => {
    const priceLadder = [2.0, 3.0, 4.0];
    const market = await monaco.create3WayMarket(priceLadder);
    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 100.0);

    let matchingPools = await getAllMarketMatchingPools(
      monaco.getRawProgram(),
      market.pk,
    );

    // matching pools do not exist until order placement
    assert.equal(matchingPools.data.marketMatchingPoolsWithSeeds.length, 0);

    await Promise.all([
      market.forOrderRequest(0, 1, priceLadder[0], purchaser),
      market.forOrderRequest(0, 1, priceLadder[1], purchaser),
      market.forOrderRequest(0, 1, priceLadder[2], purchaser),
    ]);

    await market.processOrderRequests();

    matchingPools = await getAllMarketMatchingPools(
      monaco.getRawProgram(),
      market.pk,
    );

    // 3 back orders have been placed at different price points
    assert.equal(matchingPools.data.marketMatchingPoolsWithSeeds.length, 3);
  });

  it("fetch market matching pools - verify seeds returned match pools", async () => {
    const numberOfOutcomes = 3;
    const priceLadder = [2.0];
    const market = await monaco.create3WayMarket(priceLadder);
    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 100.0);

    await Promise.all([
      market.forOrderRequest(0, 1, priceLadder[0], purchaser),
      market.forOrderRequest(1, 1, priceLadder[0], purchaser),
      market.forOrderRequest(2, 1, priceLadder[0], purchaser),

      market.againstOrderRequest(0, 1, priceLadder[0], purchaser),
      market.againstOrderRequest(1, 1, priceLadder[0], purchaser),
      market.againstOrderRequest(2, 1, priceLadder[0], purchaser),
    ]);

    await market.processOrderRequests();

    const matchingPools = await getAllMarketMatchingPools(
      monaco.getRawProgram(),
      market.pk,
    );

    for (
      let outcomeIndex = 0;
      outcomeIndex < numberOfOutcomes;
      outcomeIndex++
    ) {
      for (const forOutcome of [true, false]) {
        const pda = await findMarketMatchingPoolPda(
          monaco.getRawProgram(),
          market.pk,
          outcomeIndex,
          2.0,
          forOutcome,
        );
        const matchingPool =
          matchingPools.data.marketMatchingPoolsWithSeeds.find((pool) => {
            const seeds = pool.account.seeds;
            return (
              seeds.forOutcome == forOutcome.toString() &&
              seeds.outcomeIndex == outcomeIndex.toString() &&
              seeds.price == "2.000"
            );
          });

        assert.equal(
          pda.data.pda.toBase58(),
          matchingPool.publicKey.toBase58(),
        );
      }
    }
  });
});
