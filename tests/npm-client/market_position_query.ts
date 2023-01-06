import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import { MarketPositions } from "../../npm-client/src/market_position_query";
import * as assert from "assert";

describe("Market Position", () => {
  it("fetch market positions from chain", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const purchaserFor = await createWalletWithBalance(monaco.provider);
    const purchaserAgainst = await createWalletWithBalance(monaco.provider);

    await market.airdrop(purchaserFor, 100.0);
    await market.airdrop(purchaserAgainst, 100.0);

    const forOrder = await market.forOrder(0, 10, 2, purchaserFor);
    const againstOrder = await market.againstOrder(0, 10, 2, purchaserAgainst);

    await market.match(forOrder, againstOrder);

    const marketPositionQuery = await MarketPositions.marketPositionQuery(
      monaco.getRawProgram(),
    )
      .filterByMarket(market.pk)
      .fetch();

    const marketPositions = marketPositionQuery.data.marketPositionAccounts.map(
      (mp) => mp.account,
    );

    const forPosition = marketPositions.filter(
      (position) =>
        position.purchaser.toBase58() == purchaserFor.publicKey.toBase58(),
    )[0];
    assert.equal(
      forPosition.purchaser.toBase58(),
      purchaserFor.publicKey.toBase58(),
    );
    assert.deepEqual(
      forPosition.marketOutcomeSums.map((sum) => sum.toNumber()),
      [10000000, -10000000, -10000000],
    );

    const againstPosition = marketPositions.filter(
      (position) =>
        position.purchaser.toBase58() == purchaserAgainst.publicKey.toBase58(),
    )[0];
    assert.equal(
      againstPosition.purchaser.toBase58(),
      purchaserAgainst.publicKey.toBase58(),
    );
    assert.deepEqual(
      againstPosition.marketOutcomeSums.map((sum) => sum.toNumber()),
      [-10000000, 10000000, 10000000],
    );
  });

  it("fetch market positions by purchaser from chain", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const purchaserFor = await createWalletWithBalance(monaco.provider);
    const purchaserAgainst = await createWalletWithBalance(monaco.provider);

    await market.airdrop(purchaserFor, 100.0);
    await market.airdrop(purchaserAgainst, 100.0);

    const forOrder = await market.forOrder(0, 10, 2, purchaserFor);
    const againstOrder = await market.againstOrder(0, 10, 2, purchaserAgainst);

    await market.match(forOrder, againstOrder);

    const marketPositionQuery = await MarketPositions.marketPositionQuery(
      monaco.getRawProgram(),
    )
      .filterByMarket(market.pk)
      .filterByPurchaser(purchaserFor.publicKey)
      .fetch();

    const marketPositions = marketPositionQuery.data.marketPositionAccounts.map(
      (mp) => mp.account,
    );
    assert.equal(marketPositions.length, 1);

    const forPosition = marketPositions.filter(
      (position) =>
        position.purchaser.toBase58() == purchaserFor.publicKey.toBase58(),
    )[0];
    assert.equal(
      forPosition.purchaser.toBase58(),
      purchaserFor.publicKey.toBase58(),
    );
  });
});
