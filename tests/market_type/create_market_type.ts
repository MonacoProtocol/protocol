import { monaco } from "../util/wrappers";
import assert from "assert";
import { PublicKey } from "@solana/web3.js";

describe("Attempt to create market types with", () => {
  it("a valid name and a duplicate name", async () => {
    const name = "NAME";

    const [marketTypePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market_type"), Buffer.from(name)],
      monaco.program.programId,
    );

    try {
      await monaco.program.methods
        .createMarketType(name, false, false)
        .accounts({
          marketType: marketTypePda,
          authority: monaco.provider.publicKey,
        })
        .rpc();
    } catch (e) {
      console.error(e);
      throw e;
    }

    const marketTypeAccount = await monaco.program.account.marketType.fetch(
      marketTypePda,
    );
    assert.equal(marketTypeAccount.name, name);

    try {
      await monaco.program.methods
        .createMarketType(name, false, false)
        .accounts({
          marketType: marketTypePda,
          authority: monaco.provider.publicKey,
        })
        .rpc();
      assert.fail("Expected to fail");
    } catch (e) {
      expect(e.logs).toEqual(
        expect.arrayContaining([
          expect.stringMatching(new RegExp(/.*Address.*already in use/)),
        ]),
      );
    }
  });
});
