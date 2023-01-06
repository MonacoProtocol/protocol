import { monaco } from "../util/wrappers";
import {
  findAllMarketMatchingPoolPks,
  getAllMarketMatchingPools,
} from "../../npm-client/src/market_matching_pools";
import * as assert from "assert";
import {
  createWalletsWithBalance,
  createWalletWithBalance,
} from "../util/test_util";

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
      matchingPoolPks.data.publicKeys.length,
      expectedNumberOfMatchingPools,
    );
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
    assert.equal(matchingPools.data.marketMatchingPools.length, 0);

    await Promise.all([
      market.forOrder(0, 1, priceLadder[0], purchaser),
      market.forOrder(0, 1, priceLadder[1], purchaser),
      market.forOrder(0, 1, priceLadder[2], purchaser),
    ]);

    matchingPools = await getAllMarketMatchingPools(
      monaco.getRawProgram(),
      market.pk,
    );

    // 3 back orders have been placed at different price points
    assert.equal(matchingPools.data.marketMatchingPools.length, 3);
  });

  it("fetch market matching pools - large number of pools", async () => {
    const priceLadder = [
      1.001, 1.002, 1.003, 1.004, 1.005, 1.006, 1.007, 1.008, 1.009, 1.01, 1.02,
      1.03, 1.04, 1.05, 1.06, 1.07, 1.08, 1.09, 1.1, 1.11, 1.12, 1.13, 1.14,
      1.15, 1.16, 1.17, 1.18, 1.19, 1.2, 1.21, 1.22, 1.23, 1.24, 1.25, 1.26,
      1.27, 1.28, 1.29, 1.3, 1.31, 1.32, 1.33, 1.34, 1.35, 1.36, 1.37, 1.38,
      1.39, 1.4, 1.5, 1.6, 1.7, 1.8,
    ];
    const market = await monaco.create3WayMarket(priceLadder);
    const purchasers = await createWalletsWithBalance(
      monaco.provider,
      6,
      100000000000,
    );
    for (const purchaser of purchasers) {
      await market.airdrop(purchaser, 10000.0);
    }

    let matchingPools = await getAllMarketMatchingPools(
      monaco.getRawProgram(),
      market.pk,
    );

    // matching pools do not exist until order placement
    assert.equal(matchingPools.data.marketMatchingPools.length, 0);

    await Promise.all(
      priceLadder.map(async (price) => {
        await Promise.all([
          market.forOrder(0, 1, price, purchasers[0]),
          market.forOrder(1, 1, price, purchasers[1]),
          market.forOrder(2, 1, price, purchasers[2]),
          market.againstOrder(0, 1, price, purchasers[3]),
          market.againstOrder(1, 1, price, purchasers[4]),
          market.againstOrder(2, 1, price, purchasers[5]),
        ]);
      }),
    );

    matchingPools = await getAllMarketMatchingPools(
      monaco.getRawProgram(),
      market.pk,
    );

    const expectedNumberOfMatchingPools = priceLadder.length * 3 * 2;
    assert.equal(
      matchingPools.data.marketMatchingPools.length,
      expectedNumberOfMatchingPools,
    );
  });
});
