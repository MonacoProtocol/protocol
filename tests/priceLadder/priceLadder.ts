import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MonacoProtocol } from "../../target/types/monaco_protocol";
import assert from "assert";

describe("PriceLadder support includes", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  it("creating, populating, and resizing a price ladder", async function () {
    const program: Program<MonacoProtocol> = anchor.workspace.MonacoProtocol;
    const distinctSeed = "DISTINCT_PRICE_LADDER";
    const [priceLadderPk, _] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("price_ladder"),
        program.provider.publicKey.toBuffer(),
        Buffer.from(distinctSeed),
      ],
      program.programId,
    );
    try {
      await program.methods
        .createPriceLadder(distinctSeed, 3)
        .accounts({
          priceLadder: priceLadderPk,
          authority: program.provider.publicKey,
        })
        .rpc();
    } catch (e) {
      console.log(e);
      throw e;
    }

    let priceLadder = await program.account.priceLadder.fetch(priceLadderPk);
    assert.equal(
      priceLadder.authority.toBase58(),
      program.provider.publicKey.toBase58(),
    );
    assert.deepEqual(priceLadder.prices, []);
    assert.equal((priceLadder.prices as number[]).length, 0);
    assert.equal(priceLadder.maxNumberOfPrices, 3);

    try {
      await program.methods
        .addPricesToPriceLadder([1.1, 1.2, 1.3])
        .accounts({
          priceLadder: priceLadderPk,
          authority: program.provider.publicKey,
        })
        .rpc();
    } catch (e) {
      console.log(e);
      throw e;
    }

    priceLadder = await program.account.priceLadder.fetch(priceLadderPk);
    assert.equal(
      priceLadder.authority.toBase58(),
      program.provider.publicKey.toBase58(),
    );
    assert.deepEqual(priceLadder.prices, [1.1, 1.2, 1.3]);
    assert.equal((priceLadder.prices as number[]).length, 3);
    assert.equal(priceLadder.maxNumberOfPrices, 3);

    try {
      await program.methods
        .addPricesToPriceLadder([1.4])
        .accounts({
          priceLadder: priceLadderPk,
          authority: program.provider.publicKey,
        })
        .rpc();
      assert.fail("Should not be able to add prices to a full price ladder");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "PriceLadderIsFull");
    }

    try {
      await program.methods
        .increasePriceLadderSize(4)
        .accounts({
          priceLadder: priceLadderPk,
          authority: program.provider.publicKey,
        })
        .rpc();
    } catch (e) {
      console.log(e);
      throw e;
    }

    priceLadder = await program.account.priceLadder.fetch(priceLadderPk);
    assert.equal(priceLadder.maxNumberOfPrices, 4);

    try {
      await program.methods
        .addPricesToPriceLadder([1.4])
        .accounts({
          priceLadder: priceLadderPk,
          authority: program.provider.publicKey,
        })
        .rpc();
    } catch (e) {
      console.log(e);
      throw e;
    }

    priceLadder = await program.account.priceLadder.fetch(priceLadderPk);
    assert.deepEqual(priceLadder.prices, [1.1, 1.2, 1.3, 1.4]);
    assert.equal((priceLadder.prices as number[]).length, 4);

    try {
      await program.methods
        .removePricesFromPriceLadder([1.4])
        .accounts({
          priceLadder: priceLadderPk,
          authority: program.provider.publicKey,
        })
        .rpc();
    } catch (e) {
      console.log(e);
      throw e;
    }

    priceLadder = await program.account.priceLadder.fetch(priceLadderPk);
    assert.deepEqual(priceLadder.prices, [1.1, 1.2, 1.3]);
    assert.equal((priceLadder.prices as number[]).length, 3);
    assert.equal(priceLadder.maxNumberOfPrices, 4);
  });
});
