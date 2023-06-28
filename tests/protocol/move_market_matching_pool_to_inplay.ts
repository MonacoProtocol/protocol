import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import assert from "assert";

describe("Protocol - Move market matching pool to inplay", () => {
  it("Success", async () => {
    const inplayDelay = 0;

    const now = Math.floor(new Date().getTime() / 1000);
    const eventStartTimestamp = now + 1000;
    const marketLockTimestamp = now + 1000;

    const market = await monaco.create3WayMarket(
      [2.0],
      true,
      inplayDelay,
      eventStartTimestamp,
      marketLockTimestamp,
    );
    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 100.0);
    await market.forOrder(0, 10, 2.0, purchaser);

    const pk = market.matchingPools[0][2.0].forOutcome;
    let matchingPool = await monaco.program.account.marketMatchingPool.fetch(
      pk,
    );
    assert.equal(matchingPool.inplay, false);

    await market.updateMarketEventStartTimeToNow();
    await market.moveMarketToInplay();
    await market.moveMarketMatchingPoolToInplay(0, 2.0, true);

    matchingPool = await monaco.program.account.marketMatchingPool.fetch(pk);
    assert.equal(matchingPool.inplay, true);
  });

  it("Liquidity is zerod if that's the desired behaviour", async () => {
    const inplayDelay = 0;

    const now = Math.floor(new Date().getTime() / 1000);
    const eventStartTimestamp = now + 100;
    const marketLockTimestamp = now + 1000;

    const market = await monaco.create3WayMarket(
      [2.0],
      true,
      inplayDelay,
      eventStartTimestamp,
      marketLockTimestamp,
      { cancelUnmatched: {} },
    );
    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 100.0);
    await market.forOrder(0, 10, 2.0, purchaser);

    let matchingPool = await market.getForMatchingPool(0, 2.0);
    assert.equal(matchingPool.len, 1);
    assert.equal(matchingPool.liquidity, 10);
    assert.equal(matchingPool.matched, 0);

    await market.updateMarketEventStartTimeToNow();
    await market.moveMarketToInplay();
    await market.moveMarketMatchingPoolToInplay(0, 2.0, true);

    matchingPool = await market.getForMatchingPool(0, 2.0);
    assert.equal(matchingPool.len, 0);
    assert.equal(matchingPool.liquidity, 0);
    assert.equal(matchingPool.matched, 0);
  });

  it("Liquidity is not zerod if that's the desired behaviour", async () => {
    const inplayDelay = 0;

    const now = Math.floor(new Date().getTime() / 1000);
    const eventStartTimestamp = now + 100;
    const marketLockTimestamp = now + 1000;

    const market = await monaco.create3WayMarket(
      [2.0],
      true,
      inplayDelay,
      eventStartTimestamp,
      marketLockTimestamp,
      { none: {} },
    );
    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 100.0);
    await market.forOrder(0, 10, 2.0, purchaser);

    let matchingPool = await market.getForMatchingPool(0, 2.0);
    assert.equal(matchingPool.len, 1);
    assert.equal(matchingPool.liquidity, 10);
    assert.equal(matchingPool.matched, 0);

    await market.updateMarketEventStartTimeToNow();
    await market.moveMarketToInplay();
    await market.moveMarketMatchingPoolToInplay(0, 2.0, true);

    matchingPool = await market.getForMatchingPool(0, 2.0);
    assert.equal(matchingPool.len, 1);
    assert.equal(matchingPool.liquidity, 10);
    assert.equal(matchingPool.matched, 0);
  });
});
