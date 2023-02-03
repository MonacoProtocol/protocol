import { monaco } from "../util/wrappers";
import { Keypair } from "@solana/web3.js";
import * as assert from "assert";
import { createWalletWithBalance } from "../util/test_util";

describe("Product Config Updates", () => {
  it("Update commission rate success", async () => {
    const productConfigPk = await monaco.createProductConfig(
      "UPDATE_COMMISSION_RATE",
      50.0,
    );

    const updatedCommissionRate = 75.75;
    await monaco.program.methods
      .updateProductCommissionRate(updatedCommissionRate)
      .accounts({
        productConfig: productConfigPk,
        authority: monaco.provider.publicKey,
      })
      .rpc();

    const updatedProductConfig =
      await monaco.program.account.productConfig.fetch(productConfigPk);
    assert.equal(updatedProductConfig.commissionRate, updatedCommissionRate);
  });

  it("Update commission escrow account success", async () => {
    const productConfigPk = await monaco.createProductConfig(
      "UPDATE_COMMISSION_ESCROW",
      50.0,
    );

    const updatedCommissionEscrow = Keypair.generate().publicKey;
    await monaco.program.methods
      .updateProductCommissionEscrow(updatedCommissionEscrow)
      .accounts({
        productConfig: productConfigPk,
        authority: monaco.provider.publicKey,
      })
      .rpc();

    const updatedProductConfig =
      await monaco.program.account.productConfig.fetch(productConfigPk);
    assert.equal(
      updatedProductConfig.commissionEscrow.toBase58(),
      updatedCommissionEscrow.toBase58(),
    );
  });

  it("Update product, authority different from payer", async () => {
    const authority = await createWalletWithBalance(monaco.provider);
    const productConfigPk = await monaco.createProductConfig(
      "UPDATE_COMMISSION_RATE_2",
      50.0,
      authority,
    );

    const updatedCommissionRate = 75.75;
    await monaco.program.methods
      .updateProductCommissionRate(updatedCommissionRate)
      .accounts({
        productConfig: productConfigPk,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    const updatedProductConfig =
      await monaco.program.account.productConfig.fetch(productConfigPk);
    assert.equal(updatedProductConfig.commissionRate, updatedCommissionRate);
  });
});
