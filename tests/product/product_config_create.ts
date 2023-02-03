import { monaco } from "../util/wrappers";
import * as assert from "assert";
import { findProductConfigPda } from "../util/pdas";

describe("Product Config Creation", () => {
  it("Creation success", async () => {
    const productTitle = "Ewans Exchange!";

    const productConfigPk = await findProductConfigPda(
      productTitle,
      monaco.getRawProgram(),
    );

    await monaco.createProductConfig(productTitle, 5);

    const productConfig = await monaco.program.account.productConfig.fetch(
      productConfigPk,
    );
    assert.equal(productConfig.commissionRate.toFixed(2), "5.00");
    assert.equal(
      productConfig.authority.toBase58(),
      monaco.provider.publicKey.toBase58(),
    );
    assert.equal(
      productConfig.payer.toBase58(),
      monaco.provider.publicKey.toBase58(),
    );
    assert.equal(productConfig.productTitle, productTitle);
  });

  it("Invalid commission rate", async () => {
    try {
      await monaco.createProductConfig("Will error", 101);
    } catch (e) {
      assert.equal(e.error.errorCode.code, "InvalidCommissionRate");
    }
  });
});
