import { monaco } from "../util/wrappers";
import { AnchorProvider } from "@coral-xyz/anchor";
import * as assert from "assert";
import { ProductConfig } from "../../npm-client/types/product_config";
import {
  createProductConfig,
  updateProductAuthority,
  updateProductCommissionEscrow,
  updateProductCommissionRate,
} from "../../npm-client/src/product_config";
import { Keypair } from "@solana/web3.js";
import { createWalletWithBalance } from "../util/test_util";

describe("Product config creation and update", () => {
  it("Create product config", async () => {
    const program = monaco.getRawProgram();
    const provider = monaco.provider as AnchorProvider;

    const productTitle = "NPM_CLIENT_CREATE_PRODUCT";
    const createProductConfigResponse = await createProductConfig(
      program,
      productTitle,
      5.0,
      provider.publicKey,
      provider.publicKey,
    );

    const productConfig = (await program.account.productConfig.fetch(
      createProductConfigResponse.data.productConfigPk,
    )) as ProductConfig;
    assert.equal(productConfig.productTitle, productTitle);
    assert.deepEqual(productConfig.commissionEscrow, provider.publicKey);
    assert.deepEqual(productConfig.authority, provider.publicKey);
    assert.deepEqual(productConfig.payer, provider.publicKey);
    assert.equal(productConfig.commissionRate, 5.0);
  });

  it("Update escrow account", async () => {
    const program = monaco.getRawProgram();
    const provider = monaco.provider as AnchorProvider;

    const productTitle = "NPM_CLIENT_UPDATE_ESCROW_ACC";
    const createProductConfigResponse = await createProductConfig(
      program,
      productTitle,
      5.0,
      provider.publicKey,
      provider.publicKey,
    );
    const productConfigPk = createProductConfigResponse.data.productConfigPk;

    const newEscrow = Keypair.generate().publicKey;

    await updateProductCommissionEscrow(
      monaco.getRawProgram(),
      productTitle,
      newEscrow,
      provider.publicKey,
    );

    // check escrow account has been updated
    const updatedProductConfig = (await program.account.productConfig.fetch(
      productConfigPk,
    )) as ProductConfig;
    assert.equal(
      updatedProductConfig.commissionEscrow.toBase58(),
      newEscrow.toBase58(),
    );
  });

  it("Update commission rate ", async () => {
    const program = monaco.getRawProgram();
    const provider = monaco.provider as AnchorProvider;

    const productTitle = "NPM_CLIENT_UPDATE_ESCROW_ACC";
    const createProductConfigResponse = await createProductConfig(
      program,
      productTitle,
      5.0,
      provider.publicKey,
      provider.publicKey,
    );
    const productConfigPk = createProductConfigResponse.data.productConfigPk;

    const newCommissionRate = 10.0;

    await updateProductCommissionRate(
      monaco.getRawProgram(),
      productTitle,
      newCommissionRate,
      provider.publicKey,
    );

    // check commission rate has been updated
    const updatedProductConfig = (await program.account.productConfig.fetch(
      productConfigPk,
    )) as ProductConfig;
    assert.equal(updatedProductConfig.commissionRate, newCommissionRate);
  });

  it("Update product authority", async () => {
    const program = monaco.getRawProgram();
    const provider = monaco.provider as AnchorProvider;

    const productTitle = "NPM_CLIENT_UPDATE_ESCROW_ACC";
    const createProductConfigResponse = await createProductConfig(
      program,
      productTitle,
      5.0,
      provider.publicKey,
      provider.publicKey,
    );
    const productConfigPk = createProductConfigResponse.data.productConfigPk;

    const updatedAuthority = await createWalletWithBalance(monaco.provider);

    await updateProductAuthority(
      monaco.getRawProgram(),
      productTitle,
      updatedAuthority,
      provider.publicKey,
    );

    // check escrow account has been updated
    const updatedProductConfig = (await program.account.productConfig.fetch(
      productConfigPk,
    )) as ProductConfig;
    assert.equal(
      updatedProductConfig.authority.toBase58(),
      updatedAuthority.publicKey.toBase58(),
    );
  });
});
