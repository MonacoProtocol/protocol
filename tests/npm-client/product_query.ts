import { createProduct, getAnchorProvider } from "../util/test_util";
import { externalPrograms } from "../util/wrappers";
import { Program } from "@coral-xyz/anchor";
import { Products } from "../../npm-client/src/product_query";
import assert from "assert";
import { createProduct as createProductNpm } from "../../npm-client/src/product";
import { Keypair } from "@solana/web3.js";

describe("Products Query", () => {
  it("Get Products", async () => {
    const productProgram = externalPrograms.protocolProduct as Program;
    const productTitle = "MY_XCHANGE";
    const productCommissionRate = 10;
    const product1 = await createProduct(
      productProgram,
      productTitle,
      productCommissionRate,
      getAnchorProvider(),
    );

    const products = await Products.productQuery(productProgram).fetch();

    // should always return MONACO_PROTOCOL product and newly created product (may be more if other tests have ran)
    assert.ok(products.data.productAccounts.length >= 2);

    const returnedProduct = products.data.productAccounts.filter(
      (p) => p.account.productTitle == productTitle,
    )[0];

    assert.equal(returnedProduct.publicKey.toBase58(), product1.toBase58());
    assert.equal(returnedProduct.account.commissionRate, productCommissionRate);
    assert.equal(returnedProduct.account.productTitle, productTitle);
  });

  it("Get Products - filter by authority", async () => {
    const productProgram = externalPrograms.protocolProduct as Program;
    const productTitle = "MY_XCHANGE_AUTHORITY";
    const productCommissionRate = 10;
    const productAuthority = Keypair.generate();
    const product1 = await createProductNpm(
      productProgram,
      productTitle,
      productCommissionRate,
      getAnchorProvider().publicKey,
      productAuthority,
    );

    const products = await Products.productQuery(productProgram)
      .filterByAuthority(productAuthority.publicKey)
      .fetch();

    const returnedProduct = products.data.productAccounts.filter(
      (p) => p.account.productTitle == productTitle,
    )[0];

    assert.equal(
      returnedProduct.publicKey.toBase58(),
      product1.data.productPk.toBase58(),
    );
    assert.equal(
      returnedProduct.account.authority.toBase58(),
      productAuthority.publicKey.toBase58(),
    );
  });

  it("Get Products - filter by payer", async () => {
    const productProgram = externalPrograms.protocolProduct as Program;
    const productTitle = "MY_XCHANGE_PAYER";
    const productCommissionRate = 10;
    const productAuthority = Keypair.generate();
    const product1 = await createProductNpm(
      productProgram,
      productTitle,
      productCommissionRate,
      getAnchorProvider().publicKey,
      productAuthority,
    );

    const products = await Products.productQuery(productProgram)
      .filterByPayer(getAnchorProvider().publicKey)
      .fetch();

    const returnedProduct = products.data.productAccounts.filter(
      (p) => p.account.productTitle == productTitle,
    )[0];

    assert.equal(
      returnedProduct.publicKey.toBase58(),
      product1.data.productPk.toBase58(),
    );
    assert.equal(
      returnedProduct.account.payer.toBase58(),
      getAnchorProvider().publicKey.toBase58(),
    );
  });
});
