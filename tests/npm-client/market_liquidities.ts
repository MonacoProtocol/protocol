import assert from "assert";
import {
  findMarketLiquiditiesPda,
  getMarketLiquidities,
  MarketLiquidity,
} from "../../npm-client";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";

describe("Market Liquidities", () => {
  it("fetching from chain", async () => {
    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([3.0]),
    ]);
    await market.airdrop(purchaser, 10_000.0);

    // create ORDERS
    await market.forOrder(0, 15, 3.0, purchaser);
    await market.againstOrder(0, 10, 3.0, purchaser);
    await market.processMatchingQueue();

    const marketLiquiditiesPda = await findMarketLiquiditiesPda(
      monaco.program,
      market.pk,
    );

    const marketLiquidities = await getMarketLiquidities(
      monaco.program,
      marketLiquiditiesPda.data.pda,
    );

    assert.deepEqual(
      marketLiquidities.data.account.market.toBase58(),
      market.pk.toBase58(),
    );
    assert.deepEqual(
      marketLiquidities.data.account.stakeMatchedTotal.toNumber(),
      10000000,
    );
    assert.deepEqual(
      marketLiquidities.data.account.liquiditiesFor.map(mapMarketLiquidity),
      [{ liquidity: 5000000, outcome: 0, price: 3 }],
    );
    assert.deepEqual(marketLiquidities.data.account.liquiditiesAgainst, []);
  });
});

function mapMarketLiquidity(marketLiquidity: MarketLiquidity) {
  return {
    outcome: marketLiquidity.outcome,
    price: marketLiquidity.price,
    liquidity: marketLiquidity.liquidity.toNumber(),
  };
}
