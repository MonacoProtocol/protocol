import assert from "assert";
import {
  findMarketLiquiditiesPda,
  getCrossMatchEnabledMarketLiquidities,
  getMarketLiquidities,
  MarketLiquidity,
} from "../../npm-client";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";

describe("Market Liquidities", () => {
  it("fetch by public-key", async () => {
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

  it("fetch all enabled for cross matching", async () => {
    // Create market, purchaser
    const [_1, _2, market3] = await Promise.all([
      monaco.create3WayMarket([3.0]),
      monaco.create3WayMarket([3.0]),
      monaco.createMarket(["A", "B", "C"], [2.1, 3.0, 5.25]),
    ]);
    await market3.open(true);

    const accounts = await getCrossMatchEnabledMarketLiquidities(
      monaco.program,
    );
    assert.equal(accounts.data.accounts.length, 1);
    assert.equal(
      accounts.data.accounts[0].publicKey.toBase58(),
      market3.liquiditiesPk.toBase58(),
    );
  });
});

function mapMarketLiquidity(marketLiquidity: MarketLiquidity) {
  return {
    outcome: marketLiquidity.outcome,
    price: marketLiquidity.price,
    liquidity: marketLiquidity.liquidity.toNumber(),
  };
}
