import { externalPrograms, monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import { findMarketPositionPda } from "../../npm-client";
import assert from "assert";

describe("Product commissions", () => {
  it("unmatched order - product and commission rate stored on order", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 1000);

    const productCommission = 10;
    const productTitle = "MONACO_EXCHANGE_1";
    const productPk = await externalPrograms.createProduct(
      productTitle,
      productCommission,
    );

    const orderPk = await market.forOrder(0, 10, 2.0, purchaser, productPk);
    const marketPositionPk = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      purchaser.publicKey,
    );

    const order = await monaco.program.account.order.fetch(orderPk);
    const marketPosition = await monaco.program.account.marketPosition.fetch(
      marketPositionPk.data.pda,
    );

    assert.equal(order.product.toBase58(), productPk.toBase58());
    assert.equal(order.productCommissionRate, productCommission);
    assert.ok(marketPosition.matchedRiskPerProduct.length == 0);
  });

  it("matched order - one product stored on market position", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(forPurchaser, 1000);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, 1000);

    const productCommission = 10;
    const productTitle = "MONACO_EXCHANGE_2";
    const productPk = await externalPrograms.createProduct(
      productTitle,
      productCommission,
    );

    const stake = 20;

    await market.forOrder(0, stake, 2.0, forPurchaser, productPk);
    await market.againstOrder(0, stake, 2.0, againstPurchaser, productPk);

    const forMarketPositionPk = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      forPurchaser.publicKey,
    );
    const againstMarketPositionPk = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      againstPurchaser.publicKey,
    );

    await market.processMatchingQueue();

    const forMarketPosition = await monaco.program.account.marketPosition.fetch(
      forMarketPositionPk.data.pda,
    );
    const againstMarketPosition =
      await monaco.program.account.marketPosition.fetch(
        againstMarketPositionPk.data.pda,
      );

    const expectedMatchedStake = stake * 10 ** market.mintInfo.decimals;

    assert.ok(forMarketPosition.matchedRiskPerProduct.length == 1);
    assert.ok(againstMarketPosition.matchedRiskPerProduct.length == 1);

    assert.equal(
      forMarketPosition.matchedRiskPerProduct[0].product.toBase58(),
      productPk.toBase58(),
    );
    assert.equal(
      againstMarketPosition.matchedRiskPerProduct[0].product.toBase58(),
      productPk.toBase58(),
    );

    assert.equal(
      forMarketPosition.matchedRiskPerProduct[0].risk.toNumber(),
      expectedMatchedStake,
    );
    assert.equal(
      forMarketPosition.matchedRiskPerProduct[0].rate,
      productCommission,
    );
    assert.equal(
      againstMarketPosition.matchedRiskPerProduct[0].risk.toNumber(),
      expectedMatchedStake,
    );
    assert.equal(
      againstMarketPosition.matchedRiskPerProduct[0].rate,
      productCommission,
    );
  });

  it("matched order - default product should not count towards contributions ", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(forPurchaser, 1000);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, 1000);

    const stake = 20;

    await market.forOrder(0, stake, 2.0, forPurchaser);
    await market.againstOrder(0, stake, 2.0, againstPurchaser);

    const forMarketPositionPk = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      forPurchaser.publicKey,
    );
    const againstMarketPositionPk = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      againstPurchaser.publicKey,
    );

    await market.processMatchingQueue();

    const forMarketPosition = await monaco.program.account.marketPosition.fetch(
      forMarketPositionPk.data.pda,
    );
    const againstMarketPosition =
      await monaco.program.account.marketPosition.fetch(
        againstMarketPositionPk.data.pda,
      );

    assert.ok(forMarketPosition.matchedRiskPerProduct.length == 0);
    assert.ok(againstMarketPosition.matchedRiskPerProduct.length == 0);
  });

  it("matched orders - multiple matches on same product, same rate", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(forPurchaser, 1000);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, 1000);

    const productCommission = 10;
    const productTitle = "MONACO_EXCHANGE_3";
    const productPk = await externalPrograms.createProduct(
      productTitle,
      productCommission,
    );

    const stake = 20;

    await market.forOrder(0, stake, 2.0, forPurchaser, productPk);
    await market.againstOrder(0, 10, 2.0, againstPurchaser, productPk);
    await market.againstOrder(0, 10, 2.0, againstPurchaser, productPk);

    const forMarketPositionPk = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      forPurchaser.publicKey,
    );

    await market.processMatchingQueueOnce();
    await market.processMatchingQueueOnce();

    const forMarketPositionMatch1 =
      await monaco.program.account.marketPosition.fetch(
        forMarketPositionPk.data.pda,
      );
    const expectedMatchedStake = 10 * 10 ** market.mintInfo.decimals;

    assert.ok(forMarketPositionMatch1.matchedRiskPerProduct.length == 1);
    assert.equal(
      forMarketPositionMatch1.matchedRiskPerProduct[0].product.toBase58(),
      productPk.toBase58(),
    );

    assert.equal(
      forMarketPositionMatch1.matchedRiskPerProduct[0].risk.toNumber(),
      expectedMatchedStake,
    );
    assert.equal(
      forMarketPositionMatch1.matchedRiskPerProduct[0].rate,
      productCommission,
    );

    await market.processMatchingQueueOnce();
    await market.processMatchingQueueOnce();

    const forMarketPositionMatch2 =
      await monaco.program.account.marketPosition.fetch(
        forMarketPositionPk.data.pda,
      );
    const expectedMatchedStakeMatch2 = stake * 10 ** market.mintInfo.decimals;

    assert.ok(forMarketPositionMatch2.matchedRiskPerProduct.length == 1);
    assert.equal(
      forMarketPositionMatch2.matchedRiskPerProduct[0].product.toBase58(),
      productPk.toBase58(),
    );

    assert.equal(
      forMarketPositionMatch2.matchedRiskPerProduct[0].risk.toNumber(),
      expectedMatchedStakeMatch2,
    );
    assert.equal(
      forMarketPositionMatch2.matchedRiskPerProduct[0].rate,
      productCommission,
    );
  });

  it("matched orders - multiple orders match on same product, same rate", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(forPurchaser, 1000);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, 1000);

    const productCommission = 10;
    const productTitle = "MONACO_EXCHANGE_4";
    const productPk = await externalPrograms.createProduct(
      productTitle,
      productCommission,
    );

    const stake = 20;
    await market.forOrder(0, stake, 2.0, forPurchaser, productPk);
    await market.againstOrder(0, stake, 2.0, againstPurchaser, productPk);
    await market.processMatchingQueue();

    await market.forOrder(0, stake, 2.0, forPurchaser, productPk);
    await market.againstOrder(0, stake, 2.0, againstPurchaser, productPk);
    await market.processMatchingQueue();

    const forMarketPositionPk = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      forPurchaser.publicKey,
    );
    const forMarketPosition = await monaco.program.account.marketPosition.fetch(
      forMarketPositionPk.data.pda,
    );
    const expectedMatchedStake = 2 * stake * 10 ** market.mintInfo.decimals;

    assert.ok(forMarketPosition.matchedRiskPerProduct.length == 1);

    const matchedStakeForProduct = forMarketPosition.matchedRiskPerProduct[0];
    assert.equal(
      matchedStakeForProduct.product.toBase58(),
      productPk.toBase58(),
    );
    assert.equal(matchedStakeForProduct.risk.toNumber(), expectedMatchedStake);
    assert.equal(matchedStakeForProduct.rate, productCommission);
  });

  it("matched orders - multiple matches on same product, different commission rates", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(forPurchaser, 1000);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, 1000);

    const productCommission = 10;
    const productTitle = "MONACO_EXCHANGE_5";
    const productPk = await externalPrograms.createProduct(
      productTitle,
      productCommission,
    );

    const stake = 20;
    await market.forOrder(0, stake, 2.0, forPurchaser, productPk);
    await market.againstOrder(0, stake, 2.0, againstPurchaser, productPk);
    await market.processMatchingQueue();

    const productCommission2 = 5;
    await externalPrograms.updateProductCommission(
      productTitle,
      productCommission2,
    );

    await market.forOrder(0, stake, 2.0, forPurchaser, productPk);
    await market.againstOrder(0, stake, 2.0, againstPurchaser, productPk);
    await market.processMatchingQueue();

    const forMarketPositionPk = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      forPurchaser.publicKey,
    );
    const forMarketPosition = await monaco.program.account.marketPosition.fetch(
      forMarketPositionPk.data.pda,
    );
    const expectedMatchedStake = stake * 10 ** market.mintInfo.decimals;

    assert.ok(forMarketPosition.matchedRiskPerProduct.length == 2);

    const product1MatchedStakeRate1 =
      forMarketPosition.matchedRiskPerProduct[0];
    assert.equal(
      product1MatchedStakeRate1.product.toBase58(),
      productPk.toBase58(),
    );

    assert.equal(
      product1MatchedStakeRate1.risk.toNumber(),
      expectedMatchedStake,
    );
    assert.equal(product1MatchedStakeRate1.rate, productCommission);

    const product1MatchedStakeRate2 =
      forMarketPosition.matchedRiskPerProduct[1];
    assert.equal(
      product1MatchedStakeRate2.risk.toNumber(),
      expectedMatchedStake,
    );
    assert.equal(product1MatchedStakeRate2.rate, productCommission2);
  });

  it("matched orders - multiple matches on different products", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(forPurchaser, 1000);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, 1000);

    const productCommission = 10;
    const productPk = await externalPrograms.createProduct(
      "MONACO_EXCHANGE_6",
      productCommission,
    );

    const stake = 20;
    await market.forOrder(0, stake, 2.0, forPurchaser, productPk);
    await market.againstOrder(0, stake, 2.0, againstPurchaser, productPk);
    await market.processMatchingQueue();

    const productCommission2 = 5;
    const productPk2 = await externalPrograms.createProduct(
      "MONACO_EXCHANGE_7",
      productCommission2,
    );

    await market.forOrder(0, stake, 2.0, forPurchaser, productPk2);
    await market.againstOrder(0, stake, 2.0, againstPurchaser, productPk);
    await market.processMatchingQueue();

    const forMarketPositionPk = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      forPurchaser.publicKey,
    );
    const forMarketPosition = await monaco.program.account.marketPosition.fetch(
      forMarketPositionPk.data.pda,
    );
    const expectedMatchedStake = stake * 10 ** market.mintInfo.decimals;

    assert.ok(forMarketPosition.matchedRiskPerProduct.length == 2);

    const matchedStakeForProduct = forMarketPosition.matchedRiskPerProduct[0];
    assert.equal(
      matchedStakeForProduct.product.toBase58(),
      productPk.toBase58(),
    );
    assert.equal(matchedStakeForProduct.risk.toNumber(), expectedMatchedStake);
    assert.equal(matchedStakeForProduct.rate, productCommission);

    const matchedStakeForProduct2 = forMarketPosition.matchedRiskPerProduct[1];
    assert.equal(
      matchedStakeForProduct2.product.toBase58(),
      productPk2.toBase58(),
    );
    assert.equal(matchedStakeForProduct2.risk.toNumber(), expectedMatchedStake);
    assert.equal(matchedStakeForProduct2.rate, productCommission2);
  });

  it("matched order - against order liability tracked correctly", async () => {
    const price = 3.0;
    const market = await monaco.create3WayMarket([price]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(forPurchaser, 1000);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, 1000);

    const productCommission = 10;
    const productTitle = "MONACO_EXCHANGE_8";
    const productPk = await externalPrograms.createProduct(
      productTitle,
      productCommission,
    );

    const layStake = 10;

    await market.forOrder(0, layStake * 10, price, forPurchaser, productPk);
    await market.againstOrder(0, layStake, price, againstPurchaser, productPk);

    const againstMarketPositionPk = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      againstPurchaser.publicKey,
    );

    await market.processMatchingQueue();

    let marketPosition = await monaco.program.account.marketPosition.fetch(
      againstMarketPositionPk.data.pda,
    );

    const match1ExpectedRisk =
      layStake * (price - 1) * 10 ** market.mintInfo.decimals;
    assert.equal(
      marketPosition.matchedRiskPerProduct[0].risk.toNumber(),
      match1ExpectedRisk,
    );

    const layStake2 = layStake * 2;
    await market.againstOrder(0, layStake2, price, againstPurchaser, productPk);
    await market.processMatchingQueue();

    marketPosition = await monaco.program.account.marketPosition.fetch(
      againstMarketPositionPk.data.pda,
    );

    const match2ExpectedRisk =
      match1ExpectedRisk +
      layStake2 * (price - 1) * 10 ** market.mintInfo.decimals;
    assert.equal(
      marketPosition.matchedRiskPerProduct[0].risk.toNumber(),
      match2ExpectedRisk,
    );
  });

  it("matched orders - single match for the same user with different products", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 1000);

    const product1Commission = 5;
    const product1Pk = await externalPrograms.createProduct(
      "MONACO_EXCHANGE_9A",
      product1Commission,
    );
    const product2Commission = 10;
    const product2Pk = await externalPrograms.createProduct(
      "MONACO_EXCHANGE_9B",
      product2Commission,
    );

    const stake = 20;
    await market.forOrder(0, stake, 2.0, purchaser, product1Pk);
    await market.againstOrder(0, stake, 2.0, purchaser, product2Pk);
    await market.processMatchingQueue();

    const marketPositionPk = await findMarketPositionPda(
      monaco.getRawProgram(),
      market.pk,
      purchaser.publicKey,
    );
    const marketPosition = await monaco.fetchMarketPosition(
      marketPositionPk.data.pda,
    );

    assert.equal(marketPosition.matchedRisk.toNumber(), stake * 2 * 1_000_000); // two stakes of 20
    assert.deepEqual(
      marketPosition.matchedRiskPerProduct.map((matchedRisk) => [
        matchedRisk.product.toBase58(),
        matchedRisk.rate,
        matchedRisk.risk.toNumber(),
      ]),
      [
        ["4ymGSSeQRu4pQCNjWiK7Np9gAL4o6xF9WAfk8dUQiYhM", 10, 20000000],
        ["DMEHdhuy2GQLUL6RSoAefQz1a529JznHZT6FhuwRcBN5", 5, 20000000],
      ],
    );
  });
});
