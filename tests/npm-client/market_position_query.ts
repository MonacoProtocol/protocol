import { ProductMatchedRiskAndRate, MarketPositions } from "../../npm-client";
import { externalPrograms, monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import * as assert from "assert";

describe("Market Position", () => {
  it("fetch market positions from chain", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const productPk = await externalPrograms.createProduct(
      "SOME_EXCHANGE2",
      99,
    );
    const purchaserFor = await createWalletWithBalance(monaco.provider);
    const purchaserAgainst = await createWalletWithBalance(monaco.provider);

    await market.airdrop(purchaserFor, 100.0);
    await market.airdrop(purchaserAgainst, 100.0);

    await market.forOrder(0, 10, 2, purchaserFor, productPk);
    await market.againstOrder(0, 10, 2, purchaserAgainst);

    await market.processMatchingQueue();

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
    assert.deepEqual(
      forPosition.unmatchedExposures.map((sum) => sum.toNumber()),
      [0, 0, 0],
    );
    assert.equal(forPosition.matchedRisk.toNumber(), 10000000);
    assert.equal(forPosition.matchedRiskPerProduct.length, 1);
    assert.deepEqual(forPosition.matchedRiskPerProduct[0], {
      product: productPk,
      rate: 99,
      risk: forPosition.matchedRisk,
    } as ProductMatchedRiskAndRate);

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
    assert.deepEqual(
      againstPosition.unmatchedExposures.map((sum) => sum.toNumber()),
      [0, 0, 0],
    );
  });

  it("fetch market positions by purchaser from chain", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const purchaserFor = await createWalletWithBalance(monaco.provider);
    const purchaserAgainst = await createWalletWithBalance(monaco.provider);

    await market.airdrop(purchaserFor, 100.0);
    await market.airdrop(purchaserAgainst, 100.0);

    await market.forOrder(0, 10, 2, purchaserFor);
    await market.againstOrder(0, 10, 2, purchaserAgainst);

    await market.processMatchingQueue();

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

  it("fetch market positions by paid from chain", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const purchaserFor = await createWalletWithBalance(monaco.provider);
    const purchaserAgainst = await createWalletWithBalance(monaco.provider);

    await market.airdrop(purchaserFor, 100.0);
    await market.airdrop(purchaserAgainst, 100.0);

    await market.forOrder(0, 10, 2, purchaserFor);
    await market.againstOrder(0, 10, 2, purchaserAgainst);

    await market.processMatchingQueue();
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(purchaserFor.publicKey);

    const marketPositionQueryPaid = await MarketPositions.marketPositionQuery(
      monaco.getRawProgram(),
    )
      .filterByMarket(market.pk)
      .filterByPaid(true)
      .fetch();
    const marketPositionQueryNotPaid =
      await MarketPositions.marketPositionQuery(monaco.getRawProgram())
        .filterByMarket(market.pk)
        .filterByPaid(false)
        .fetch();

    const paidMarketPositions =
      marketPositionQueryPaid.data.marketPositionAccounts.map(
        (mp) => mp.account,
      );
    assert.equal(paidMarketPositions.length, 1);
    const notPaidMarketPositions =
      marketPositionQueryNotPaid.data.marketPositionAccounts.map(
        (mp) => mp.account,
      );
    assert.equal(notPaidMarketPositions.length, 1);

    const forPosition = paidMarketPositions.filter(
      (position) =>
        position.purchaser.toBase58() == purchaserFor.publicKey.toBase58(),
    )[0];
    assert.equal(
      forPosition.purchaser.toBase58(),
      purchaserFor.publicKey.toBase58(),
    );
    assert.equal(forPosition.paid, true);

    const againstPosition = notPaidMarketPositions.filter(
      (position) =>
        position.purchaser.toBase58() == purchaserAgainst.publicKey.toBase58(),
    )[0];
    assert.equal(
      againstPosition.purchaser.toBase58(),
      purchaserAgainst.publicKey.toBase58(),
    );
    assert.equal(againstPosition.paid, false);
  });
});
