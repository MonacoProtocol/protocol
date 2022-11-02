import { monaco } from "../util/wrappers";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import * as assert from "assert";
import { findMultisigGroupPda } from "../util/pdas";

describe("Multisig Group Config Creation", () => {
  it("Creation success", async () => {
    const multisigTitle = "MONACO_PROTOCOL";
    const multisigGroupPk = await findMultisigGroupPda(
      multisigTitle,
      monaco.getRawProgram(),
    );

    const keypair1 = Keypair.generate();
    const keypair2 = Keypair.generate();

    await monaco.program.methods
      .createMultisig(
        multisigTitle,
        [
          monaco.provider.wallet.publicKey,
          keypair1.publicKey,
          keypair2.publicKey,
        ],
        new BN(1),
      )
      .accounts({
        multisigGroup: multisigGroupPk,
        signer: monaco.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const multisig = await monaco.program.account.multisigGroup.fetch(
      multisigGroupPk,
    );
    assert.equal(multisig.approvalThreshold, 1);
    assert.equal(multisig.membersVersion, 0);
    assert.equal(multisig.groupTitle, multisigTitle);
    assert.equal(
      multisig.members[0].toBase58(),
      monaco.provider.wallet.publicKey.toBase58(),
    );
  });

  it("Duplicate members throws error", async () => {
    const multisigTitle = "WILL_THROW_ERROR";
    const multisigGroupPk = await findMultisigGroupPda(
      multisigTitle,
      monaco.getRawProgram(),
    );

    const keypair1 = Keypair.generate();

    try {
      await monaco.program.methods
        .createMultisig(
          multisigTitle,
          [
            monaco.provider.wallet.publicKey,
            keypair1.publicKey,
            keypair1.publicKey,
          ],
          new BN(1),
        )
        .accounts({
          multisigGroup: multisigGroupPk,
          signer: monaco.provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      assert.equal(e.error.errorCode.code, "UniqueMembers");
    }
  });

  it("Invalid approval threshold", async () => {
    const multisigTitle = "WILL_THROW_ERROR";
    const multisigGroupPk = await findMultisigGroupPda(
      multisigTitle,
      monaco.getRawProgram(),
    );

    const keypair1 = Keypair.generate();
    const keypair2 = Keypair.generate();

    try {
      await monaco.program.methods
        .createMultisig(
          multisigTitle,
          [
            monaco.provider.wallet.publicKey,
            keypair1.publicKey,
            keypair2.publicKey,
          ],
          new BN(4),
        )
        .accounts({
          multisigGroup: multisigGroupPk,
          signer: monaco.provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      assert.equal(e.error.errorCode.code, "InvalidApprovalThreshold");
    }
  });
});
