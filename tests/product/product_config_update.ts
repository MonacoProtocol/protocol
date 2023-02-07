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
      .updateProductCommissionRate(
        "UPDATE_COMMISSION_RATE",
        updatedCommissionRate,
      )
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
      .updateProductCommissionEscrow(
        "UPDATE_COMMISSION_ESCROW",
        updatedCommissionEscrow,
      )
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
      .updateProductCommissionRate(
        "UPDATE_COMMISSION_RATE_2",
        updatedCommissionRate,
      )
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

  it("Update product authority - system account authority", async () => {
    const productConfigPk = await monaco.createProductConfig(
      "UPDATE_AUTHORITY",
      50.0,
    );
    const updatedAuthority = await createWalletWithBalance(monaco.provider);

    await monaco.program.methods
      .updateProductAuthority("UPDATE_AUTHORITY")
      .accounts({
        productConfig: productConfigPk,
        authority: monaco.provider.publicKey,
        updatedAuthority: updatedAuthority.publicKey,
      })
      .signers([updatedAuthority])
      .rpc();

    const updatedProductConfig =
      await monaco.program.account.productConfig.fetch(productConfigPk);
    assert.equal(
      updatedProductConfig.authority.toBase58(),
      updatedAuthority.publicKey.toBase58(),
    );
  });
});
