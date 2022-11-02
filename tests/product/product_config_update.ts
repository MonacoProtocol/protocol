import { monaco } from "../util/wrappers";
import { AccountMeta, Keypair, PublicKey } from "@solana/web3.js";
import * as assert from "assert";

describe("Product Config Updates", () => {
  it("Update commission rate success", async () => {
    const multisigGroupPk = await monaco.createMultisigGroup(
      "UPDATE_COMMISSION_RATE",
      [monaco.provider.wallet.publicKey],
      1,
    );

    const [multisigSignerPk] = await PublicKey.findProgramAddress(
      [multisigGroupPk.toBuffer()],
      monaco.program.programId,
    );

    const productConfigPk = await monaco.createProductConfig(
      "UPDATE_COMMISSION_RATE",
      50.0,
      multisigGroupPk,
    );

    const productConfig = await monaco.program.account.productConfig.fetch(
      productConfigPk,
    );
    assert.equal(productConfig.commissionRate, 50.0);

    // accounts required for update_product_commission_rate call
    const instructionAccounts = [
      {
        pubkey: productConfigPk,
        isSigner: false,
        isWritable: true,
      } as AccountMeta,
      {
        pubkey: multisigGroupPk,
        isSigner: false,
        isWritable: true,
      } as AccountMeta,
      {
        pubkey: multisigSignerPk,
        isSigner: true,
        isWritable: false,
      } as AccountMeta,
    ];

    const updatedCommissionRate = 75.75;
    const instructionData = monaco.program.coder.instruction.encode(
      "update_product_commission_rate",
      {
        updatedCommissionRate: updatedCommissionRate,
      },
    );

    const txPk = await monaco.createMultisigTransaction(
      multisigGroupPk,
      monaco.provider.wallet.publicKey,
      instructionData,
      instructionAccounts,
    );

    const productConfigBeforeMultisigExecution =
      await monaco.program.account.productConfig.fetch(productConfigPk);
    assert.equal(productConfigBeforeMultisigExecution.commissionRate, 50.0);

    // execute transaction
    await monaco.executeMultisigTransaction(
      multisigGroupPk,
      txPk,
      multisigSignerPk,
      instructionAccounts,
    );

    const productConfigAfterMultisigExecution =
      await monaco.program.account.productConfig.fetch(productConfigPk);
    assert.equal(
      productConfigAfterMultisigExecution.commissionRate,
      updatedCommissionRate,
    );
  });

  it("Update commission escrow account success", async () => {
    const multisigGroupPk = await monaco.createMultisigGroup(
      "UPDATE_COMMISSION_ESCROW",
      [monaco.provider.wallet.publicKey],
      1,
    );

    const [multisigSignerPk] = await PublicKey.findProgramAddress(
      [multisigGroupPk.toBuffer()],
      monaco.program.programId,
    );

    const productConfigPk = await monaco.createProductConfig(
      "UPDATE_COMMISSION_ESCROW",
      50.0,
      multisigGroupPk,
    );

    const productConfig = await monaco.program.account.productConfig.fetch(
      productConfigPk,
    );
    const commissionEscrowPk = productConfig.commissionEscrow;

    // accounts required for update_product_commission_escrow call
    const instructionAccounts = [
      {
        pubkey: productConfigPk,
        isSigner: false,
        isWritable: true,
      } as AccountMeta,
      {
        pubkey: multisigGroupPk,
        isSigner: false,
        isWritable: true,
      } as AccountMeta,
      {
        pubkey: multisigSignerPk,
        isSigner: true,
        isWritable: false,
      } as AccountMeta,
    ];

    const updatedCommissionEscrow = Keypair.generate().publicKey;
    const instructionData = monaco.program.coder.instruction.encode(
      "update_product_commission_escrow",
      {
        updatedCommissionEscrow: updatedCommissionEscrow,
      },
    );

    const txPk = await monaco.createMultisigTransaction(
      multisigGroupPk,
      monaco.provider.wallet.publicKey,
      instructionData,
      instructionAccounts,
    );

    const productConfigBeforeMultisigExecution =
      await monaco.program.account.productConfig.fetch(productConfigPk);
    assert.equal(
      productConfigBeforeMultisigExecution.commissionEscrow.toBase58(),
      commissionEscrowPk.toBase58(),
    );

    // execute transaction
    await monaco.executeMultisigTransaction(
      multisigGroupPk,
      txPk,
      multisigSignerPk,
      instructionAccounts,
    );

    const productConfigAfterMultisigExecution =
      await monaco.program.account.productConfig.fetch(productConfigPk);
    assert.equal(
      productConfigAfterMultisigExecution.commissionEscrow.toBase58(),
      updatedCommissionEscrow.toBase58(),
    );
  });

  it("Update config - incorrect multisig", async () => {
    const multisigGroupPk = await monaco.createMultisigGroup(
      "TEST",
      [monaco.provider.wallet.publicKey],
      1,
    );

    const [multisigSignerPk] = await PublicKey.findProgramAddress(
      [multisigGroupPk.toBuffer()],
      monaco.program.programId,
    );

    const productConfigPk = await monaco.createProductConfig(
      "TEST",
      50.0,
      multisigGroupPk,
    );

    const incorrectMultisigGroupPk = await monaco.createMultisigGroup(
      "TEST2",
      [monaco.provider.wallet.publicKey],
      1,
    );
    const [incorrectMultisigSignerPk] = await PublicKey.findProgramAddress(
      [multisigGroupPk.toBuffer()],
      monaco.program.programId,
    );

    // accounts required for update_product_commission_rate call
    const instructionAccounts = [
      {
        pubkey: productConfigPk,
        isSigner: false,
        isWritable: true,
      } as AccountMeta,
      {
        pubkey: incorrectMultisigGroupPk,
        isSigner: false,
        isWritable: true,
      } as AccountMeta,
      {
        pubkey: incorrectMultisigSignerPk,
        isSigner: true,
        isWritable: false,
      } as AccountMeta,
    ];

    const updatedCommissionEscrow = Keypair.generate().publicKey;
    const instructionData = monaco.program.coder.instruction.encode(
      "update_product_commission_escrow",
      {
        updatedCommissionEscrow: updatedCommissionEscrow,
      },
    );

    const txPk = await monaco.createMultisigTransaction(
      multisigGroupPk,
      monaco.provider.wallet.publicKey,
      instructionData,
      instructionAccounts,
    );

    // execute transaction
    await monaco
      .executeMultisigTransaction(
        multisigGroupPk,
        txPk,
        multisigSignerPk,
        instructionAccounts,
      )
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "ConstraintHasOne");
      });
  });
});
