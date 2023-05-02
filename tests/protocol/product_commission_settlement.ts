import { externalPrograms, monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import assert from "assert";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";

describe("Product commission - settlement", () => {
  it("one product - one rate (20%)", async () => {
    const price = 3.0;
    const market = await monaco.create3WayMarket([price]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    const purchaserBalance = 1000;
    await market.airdrop(forPurchaser, purchaserBalance);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, purchaserBalance);

    const productCommission = 20;
    const productTitle = "ONE_PRODUCT_20_RATE";
    const productPk = await externalPrograms.createProduct(
      productTitle,
      productCommission,
    );

    const stake = 10;
    const forPk = await market.forOrder(
      0,
      stake,
      price,
      forPurchaser,
      productPk,
    );
    const againstPk = await market.againstOrder(
      0,
      stake,
      price,
      againstPurchaser,
      productPk,
    );
    await market.match(forPk, againstPk);

    const product =
      await externalPrograms.protocolProduct.account.product.fetch(productPk);
    const productTokenEscrow = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      product.commissionEscrow,
      true,
    );
    assert.equal(productTokenEscrow.amount, 0);

    const forTokenPreSettlement = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      forPurchaser.publicKey,
      true,
    );
    const forBalanceBeforeSettlement =
      new BN(forTokenPreSettlement.amount).toNumber() / 10 ** 6;
    assert.equal(forBalanceBeforeSettlement, purchaserBalance - stake);

    const againstTokenPreSettlement = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      againstPurchaser.publicKey,
      true,
    );
    const againstBalanceBeforeSettlement =
      new BN(againstTokenPreSettlement.amount).toNumber() / 10 ** 6;
    assert.equal(
      againstBalanceBeforeSettlement,
      purchaserBalance - stake * (price - 1),
    );

    const profit = (await market.getMarketPosition(forPurchaser)).matched[0];
    assert.equal(profit, stake * (price - 1)); // 20

    await market.settle(0);
    await market.settleMarketPositionForPurchaser(forPurchaser.publicKey);

    // expected => profit * (productCommission / 100) => 20 * 0.2
    const tokenEscrowPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        productTokenEscrow.address,
      );
    const expectedEscrowBalance = 4;
    assert.equal(
      tokenEscrowPostSettlement.value.uiAmount,
      expectedEscrowBalance,
    );

    // expected => balanceBeforeSettlement + stake + (profit * 0.7) => 990 + 10 + (20 * 0.7)
    const forPurchaserTokenPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        forTokenPreSettlement.address,
      );
    const expectedForPurchaserBalance = 1014;
    assert.equal(
      forPurchaserTokenPostSettlement.value.uiAmount,
      expectedForPurchaserBalance,
    );

    // loser should have same balance
    const againstPurchaserTokenPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        againstTokenPreSettlement.address,
      );
    assert.equal(
      againstPurchaserTokenPostSettlement.value.uiAmount,
      againstBalanceBeforeSettlement,
    );

    // escrow should be empty - cannot assert an exact balance for protocol commission as it is shared between tests
    const marketEscrowPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(market.escrowPk);
    assert.equal(marketEscrowPostSettlement.value.uiAmount, 0);
  });

  it("one product - one rate (0%)", async () => {
    const price = 3.0;
    const market = await monaco.create3WayMarket([price]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    const purchaserBalance = 1000;
    await market.airdrop(forPurchaser, purchaserBalance);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, purchaserBalance);

    const productCommission = 0;
    const productTitle = "ONE_PRODUCT_0_RATE";
    const productPk = await externalPrograms.createProduct(
      productTitle,
      productCommission,
    );

    const stake = 10;
    await market.match(
      await market.forOrder(0, stake, price, forPurchaser, productPk),
      await market.againstOrder(0, stake, price, againstPurchaser, productPk),
    );

    const product =
      await externalPrograms.protocolProduct.account.product.fetch(productPk);
    const productTokenEscrow = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      product.commissionEscrow,
      true,
    );
    assert.equal(productTokenEscrow.amount, 0);

    const forTokenPreSettlement = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      forPurchaser.publicKey,
      true,
    );
    const forBalanceBeforeSettlement =
      new BN(forTokenPreSettlement.amount).toNumber() / 10 ** 6;
    assert.equal(forBalanceBeforeSettlement, purchaserBalance - stake);

    const profit = (await market.getMarketPosition(forPurchaser)).matched[0];
    assert.equal(profit, stake * (price - 1)); // 20

    await market.settle(0);
    await market.settleMarketPositionForPurchaser(forPurchaser.publicKey);

    // expected => profit * (productCommission / 100) => 20 * 0.2
    const tokenEscrowPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        productTokenEscrow.address,
      );
    const expectedEscrowBalance = 0;
    assert.equal(
      tokenEscrowPostSettlement.value.uiAmount,
      expectedEscrowBalance,
    );

    // expected => balanceBeforeSettlement + stake + (profit * 0.9) => 990 + 10 + (20 * 0.7)
    const forPurchaserTokenPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        forTokenPreSettlement.address,
      );
    const expectedForPurchaserBalance = 1018;
    assert.equal(
      forPurchaserTokenPostSettlement.value.uiAmount,
      expectedForPurchaserBalance,
    );

    // escrow should be empty - cannot assert an exact balance for protocol commission as it is shared between tests
    const marketEscrowPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(market.escrowPk);
    assert.equal(marketEscrowPostSettlement.value.uiAmount, 0);
  });

  it("one product - multiple rates (10%, 20%)", async () => {
    const price = 3.0;
    const market = await monaco.create3WayMarket([price]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    const purchaserBalance = 1000;
    await market.airdrop(forPurchaser, purchaserBalance);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, purchaserBalance);

    const productCommission = 10;
    const productTitle = "ONE_PRODUCT_MULTI_RATE";
    const productPk = await externalPrograms.createProduct(
      productTitle,
      productCommission,
    );

    const stake = 10;
    await market.match(
      await market.forOrder(0, stake, price, forPurchaser, productPk),
      await market.againstOrder(0, stake, price, againstPurchaser, productPk),
    );

    await externalPrograms.updateProductCommission(productTitle, 20);

    await market.match(
      await market.forOrder(0, stake, price, forPurchaser, productPk),
      await market.againstOrder(0, stake, price, againstPurchaser, productPk),
    );

    const product =
      await externalPrograms.protocolProduct.account.product.fetch(productPk);
    const productTokenEscrow = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      product.commissionEscrow,
      true,
    );
    assert.equal(productTokenEscrow.amount, 0);

    const forTokenPreSettlement = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      forPurchaser.publicKey,
      true,
    );
    const forBalanceBeforeSettlement =
      new BN(forTokenPreSettlement.amount).toNumber() / 10 ** 6;
    assert.equal(forBalanceBeforeSettlement, purchaserBalance - 2 * stake);

    const profit = (await market.getMarketPosition(forPurchaser)).matched[0];
    assert.equal(profit, 2 * (stake * (price - 1))); // 40

    await market.settle(0);
    await market.settleMarketPositionForPurchaser(forPurchaser.publicKey);

    // profit is split equally between commission rates - so product entitled to 50% of profit at rate 1, and 50% at rate 2
    // profitPortion = profit / (number of different commission rates) => 40 / 2
    // expected => (profitPortion * rate1) + (profitPortion * rate2) => (20 * 0.1) + (20 * 0.2) => 6
    const tokenEscrowPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        productTokenEscrow.address,
      );
    const expectedEscrowBalance = 6;
    assert.equal(
      tokenEscrowPostSettlement.value.uiAmount,
      expectedEscrowBalance,
    );

    // expected => balanceBeforeSettlement + stake - productCommission - protocolCommission => 1000 + 40 - 6  - 4
    const forPurchaserTokenPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        forTokenPreSettlement.address,
      );
    const expectedForPurchaserBalance = 1030;
    assert.equal(
      forPurchaserTokenPostSettlement.value.uiAmount,
      expectedForPurchaserBalance,
    );

    // escrow should be empty - cannot assert an exact balance for protocol commission as it is shared between tests
    const marketEscrowPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(market.escrowPk);
    assert.equal(marketEscrowPostSettlement.value.uiAmount, 0);
  });

  it("multiple product - multiple rates (10%, 20%)", async () => {
    const price = 3.0;
    const market = await monaco.create3WayMarket([price]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    const purchaserBalance = 1000;
    await market.airdrop(forPurchaser, purchaserBalance);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, purchaserBalance);

    const productCommission = 20;
    const productPk = await externalPrograms.createProduct(
      "FIRST_PRODUCT",
      productCommission,
    );

    const stake = 10;
    await market.match(
      await market.forOrder(0, stake, price, forPurchaser, productPk),
      await market.againstOrder(0, stake, price, againstPurchaser, productPk),
    );

    const productCommission2 = 10;
    const productPk2 = await externalPrograms.createProduct(
      "SECOND_PRODUCT",
      productCommission2,
    );
    await market.match(
      await market.forOrder(0, stake, price, forPurchaser, productPk2),
      await market.againstOrder(0, stake, price, againstPurchaser, productPk2),
    );

    const product =
      await externalPrograms.protocolProduct.account.product.fetch(productPk);
    const productTokenEscrow = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      product.commissionEscrow,
      true,
    );
    assert.equal(productTokenEscrow.amount, 0);

    const product2 =
      await externalPrograms.protocolProduct.account.product.fetch(productPk2);
    const productTokenEscrow2 = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      product2.commissionEscrow,
      true,
    );
    assert.equal(productTokenEscrow2.amount, 0);

    const forTokenPreSettlement = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      forPurchaser.publicKey,
      true,
    );
    const forBalanceBeforeSettlement =
      new BN(forTokenPreSettlement.amount).toNumber() / 10 ** 6;
    assert.equal(forBalanceBeforeSettlement, purchaserBalance - 2 * stake);

    const profit = (await market.getMarketPosition(forPurchaser)).matched[0];
    assert.equal(profit, 2 * (stake * (price - 1))); // 40

    await market.settle(0);
    await market.settleMarketPositionForPurchaser(forPurchaser.publicKey);

    // profit is split equally between products - so both products are entitled to take commission from 50% of profit
    // profitPortion = profit / (number of different product/commission rates) => 40 / 2

    // expected => (profitPortion * rate1)  => (20 * 0.2) => 4
    const tokenEscrowPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        productTokenEscrow.address,
      );
    const expectedEscrowBalance = 4;
    assert.equal(
      tokenEscrowPostSettlement.value.uiAmount,
      expectedEscrowBalance,
    );

    // expected => (profitPortion * rate1)  => (20 * 0.1) => 2
    const tokenEscrowPostSettlement2 =
      await monaco.provider.connection.getTokenAccountBalance(
        productTokenEscrow2.address,
      );
    const expectedEscrowBalance2 = 2;
    assert.equal(
      tokenEscrowPostSettlement2.value.uiAmount,
      expectedEscrowBalance2,
    );

    // expected => balanceBeforeSettlement + stake - productCommission - protocolCommission => 1000 + 40 - 6  - 4
    const forPurchaserTokenPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        forTokenPreSettlement.address,
      );
    const expectedForPurchaserBalance = 1030;
    assert.equal(
      forPurchaserTokenPostSettlement.value.uiAmount,
      expectedForPurchaserBalance,
    );

    // escrow should be empty - cannot assert an exact balance for protocol commission as it is shared between tests
    const marketEscrowPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(market.escrowPk);
    assert.equal(marketEscrowPostSettlement.value.uiAmount, 0);
  });

  it("commission rate totals 100% - 0 profit paid to user", async () => {
    const price = 3.0;
    const market = await monaco.create3WayMarket([price]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    const purchaserBalance = 1000;
    await market.airdrop(forPurchaser, purchaserBalance);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, purchaserBalance);

    const productCommission = 90;
    const productTitle = "90_RATE";
    const productPk = await externalPrograms.createProduct(
      productTitle,
      productCommission,
    );

    const stake = 10;
    await market.match(
      await market.forOrder(0, stake, price, forPurchaser, productPk),
      await market.againstOrder(0, stake, price, againstPurchaser, productPk),
    );

    const product =
      await externalPrograms.protocolProduct.account.product.fetch(productPk);
    const productTokenEscrow = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      product.commissionEscrow,
      true,
    );
    assert.equal(productTokenEscrow.amount, 0);

    const forTokenPreSettlement = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      forPurchaser.publicKey,
      true,
    );

    const forBalanceBeforeSettlement =
      new BN(forTokenPreSettlement.amount).toNumber() / 10 ** 6;
    assert.equal(forBalanceBeforeSettlement, purchaserBalance - stake);

    const profit = (await market.getMarketPosition(forPurchaser)).matched[0];
    assert.equal(profit, stake * (price - 1)); // 20

    await market.settle(0);
    await market.settleMarketPositionForPurchaser(forPurchaser.publicKey);

    // expected => profit * (productCommission / 100) => 20 * 0.9
    const tokenEscrowPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        productTokenEscrow.address,
      );
    const expectedEscrowBalance = 18;
    assert.equal(
      tokenEscrowPostSettlement.value.uiAmount,
      expectedEscrowBalance,
    );

    // expected => balanceBeforeSettlement + stake + (profit * 0.7) => 990 + 10 + (20 * 0.7)
    const forPurchaserTokenPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        forTokenPreSettlement.address,
      );
    const expectedForPurchaserBalance = 1000;
    assert.equal(
      forPurchaserTokenPostSettlement.value.uiAmount,
      expectedForPurchaserBalance,
    );

    // escrow should be empty - cannot assert an exact balance for protocol commission as it is shared between tests
    const marketEscrowPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(market.escrowPk);
    assert.equal(marketEscrowPostSettlement.value.uiAmount, 0);
  });

  it("product commission rate 100% - reduced to 90% as protocol commission rate 10%", async () => {
    const price = 3.0;
    const market = await monaco.create3WayMarket([price]);
    const forPurchaser = await createWalletWithBalance(monaco.provider);
    const purchaserBalance = 1000;
    await market.airdrop(forPurchaser, purchaserBalance);

    const againstPurchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(againstPurchaser, purchaserBalance);

    const productCommission = 100;
    const productTitle = "100_RATE";
    const productPk = await externalPrograms.createProduct(
      productTitle,
      productCommission,
    );

    const stake = 10;
    await market.match(
      await market.forOrder(0, stake, price, forPurchaser, productPk),
      await market.againstOrder(0, stake, price, againstPurchaser, productPk),
    );

    const product =
      await externalPrograms.protocolProduct.account.product.fetch(productPk);
    const productTokenEscrow = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      product.commissionEscrow,
      true,
    );
    assert.equal(productTokenEscrow.amount, 0);

    const forTokenPreSettlement = await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      monaco.operatorWallet.payer,
      market.mintPk,
      forPurchaser.publicKey,
      true,
    );

    const forBalanceBeforeSettlement =
      new BN(forTokenPreSettlement.amount).toNumber() / 10 ** 6;
    assert.equal(forBalanceBeforeSettlement, purchaserBalance - stake);

    const profit = (await market.getMarketPosition(forPurchaser)).matched[0];
    assert.equal(profit, stake * (price - 1)); // 20

    await market.settle(0);
    await market.settleMarketPositionForPurchaser(forPurchaser.publicKey);

    // expected => profit * (productCommission / 100) => 20 * 0.9
    const tokenEscrowPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        productTokenEscrow.address,
      );
    const expectedEscrowBalance = 18;
    assert.equal(
      tokenEscrowPostSettlement.value.uiAmount,
      expectedEscrowBalance,
    );

    // expected => balanceBeforeSettlement + stake + (profit * 0.7) => 990 + 10 + (20 * 0.7)
    const forPurchaserTokenPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(
        forTokenPreSettlement.address,
      );
    const expectedForPurchaserBalance = 1000;
    assert.equal(
      forPurchaserTokenPostSettlement.value.uiAmount,
      expectedForPurchaserBalance,
    );

    // escrow should be empty - cannot assert an exact balance for protocol commission as it is shared between tests
    const marketEscrowPostSettlement =
      await monaco.provider.connection.getTokenAccountBalance(market.escrowPk);
    assert.equal(marketEscrowPostSettlement.value.uiAmount, 0);
  });
});
