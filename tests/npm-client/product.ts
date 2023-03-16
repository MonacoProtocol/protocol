import { externalPrograms, monaco } from "../util/wrappers";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import * as assert from "assert";
import { Product } from "../../npm-client/types/product";
import {
  createProduct,
  updateProductAuthority,
  updateProductCommissionEscrow,
  updateProductCommissionRate,
} from "../../npm-client/src/product";
import { Keypair } from "@solana/web3.js";
import { createWalletWithBalance } from "../util/test_util";

describe("Product creation and update", () => {
  it("Create config", async () => {
    const program = externalPrograms.protocolProduct as Program;
    const provider = monaco.provider as AnchorProvider;

    const productTitle = "NPM_CLIENT_CREATE_PRODUCT";
    const createProductResponse = await createProduct(
      program,
      productTitle,
      5.0,
      provider.publicKey,
    );

    const product = (await program.account.product.fetch(
      createProductResponse.data.productPk,
    )) as Product;
    assert.equal(product.productTitle, productTitle);
    assert.deepEqual(product.commissionEscrow, provider.publicKey);
    assert.deepEqual(product.authority, provider.publicKey);
    assert.deepEqual(product.payer, provider.publicKey);
    assert.equal(product.commissionRate, 5.0);
  });

  it("Update escrow account", async () => {
    const program = externalPrograms.protocolProduct as Program;
    const provider = monaco.provider as AnchorProvider;

    const productTitle = "NPM_CLIENT_UPDATE_ESCROW_ACC";
    const createProductResponse = await createProduct(
      program,
      productTitle,
      5.0,
      provider.publicKey,
    );
    const productPk = createProductResponse.data.productPk;

    const newEscrow = Keypair.generate().publicKey;

    await updateProductCommissionEscrow(
      program,
      productTitle,
      newEscrow,
      provider.publicKey,
    );

    // check escrow account has been updated
    const updatedProduct = (await program.account.product.fetch(
      productPk,
    )) as Product;
    assert.equal(
      updatedProduct.commissionEscrow.toBase58(),
      newEscrow.toBase58(),
    );
  });

  it("Update commission rate ", async () => {
    const program = externalPrograms.protocolProduct as Program;
    const provider = monaco.provider as AnchorProvider;

    const productTitle = "NPM_CLIENT_UPDATE_ESCROW_ACC";
    const createProductResponse = await createProduct(
      program,
      productTitle,
      5.0,
      provider.publicKey,
    );
    const productPk = createProductResponse.data.productPk;

    const newCommissionRate = 10.0;

    await updateProductCommissionRate(
      program,
      productTitle,
      newCommissionRate,
      provider.publicKey,
    );

    // check commission rate has been updated
    const updatedProduct = (await program.account.product.fetch(
      productPk,
    )) as Product;
    assert.equal(updatedProduct.commissionRate, newCommissionRate);
  });

  it("Update product authority", async () => {
    const program = externalPrograms.protocolProduct as Program;
    const provider = monaco.provider as AnchorProvider;

    const productTitle = "NPM_CLIENT_UPDATE_ESCROW_ACC";
    const createProductResponse = await createProduct(
      program,
      productTitle,
      5.0,
      provider.publicKey,
    );
    const productPk = createProductResponse.data.productPk;

    const updatedAuthority = await createWalletWithBalance(monaco.provider);

    await updateProductAuthority(
      program,
      productTitle,
      updatedAuthority,
      provider.publicKey,
    );

    // check escrow account has been updated
    const updatedProduct = (await program.account.product.fetch(
      productPk,
    )) as Product;
    assert.equal(
      updatedProduct.authority.toBase58(),
      updatedAuthority.publicKey.toBase58(),
    );
  });
});
