import { monaco } from "../util/wrappers";
import { Keypair } from "@solana/web3.js";
import * as assert from "assert";
import { findProductConfigPda } from "../util/pdas";

describe("Product Config Creation", () => {
  it("Creation success", async () => {
    const productTitle = "Ewans Exchange!";

    const productConfigPk = await findProductConfigPda(
      productTitle,
      monaco.getRawProgram(),
    );
    const multisigGroupPk = await monaco.createMultisigGroup(
      "EWANS_MULTISIG",
      [monaco.provider.wallet.publicKey],
      1,
    );

    await monaco.createProductConfig(productTitle, 5, multisigGroupPk);

    const productConfig = await monaco.program.account.productConfig.fetch(
      productConfigPk,
    );
    assert.equal(productConfig.commissionRate.toFixed(2), "5.00");
    assert.equal(
      productConfig.multisigGroup.toBase58(),
      multisigGroupPk.toBase58(),
    );
    assert.equal(productConfig.productTitle, productTitle);
  });

  it("Signer not in multisig", async () => {
    const keypair1 = Keypair.generate();
    const keypair2 = Keypair.generate();

    const multisigGroupPk = await monaco.createMultisigGroup(
      "WILL_ERROR",
      [keypair1.publicKey, keypair2.publicKey],
      1,
    );

    try {
      await monaco.createProductConfig("Will error", 5, multisigGroupPk);
    } catch (e) {
      assert.equal(e.error.errorCode.code, "SignerNotFound");
    }
  });

  it("Invalid commission rate", async () => {
    const multisigGroupPk = await monaco.createMultisigGroup(
      "WILL_ERROR2",
      [monaco.provider.wallet.publicKey],
      1,
    );

    try {
      await monaco.createProductConfig("Will error", 101, multisigGroupPk);
    } catch (e) {
      assert.equal(e.error.errorCode.code, "InvalidCommissionRate");
    }
  });
});
