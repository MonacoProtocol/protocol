import { monaco } from "../util/wrappers";
import { AccountMeta, Keypair, PublicKey } from "@solana/web3.js";
import * as assert from "assert";

describe("Multisig Transaction Execution", () => {
  it("Execute success - set multisig members", async () => {
    const multisigMember1 = monaco.provider.wallet.publicKey;
    const multisigMember2 = Keypair.generate();
    const multisigMember3 = Keypair.generate();
    const multisigPk = await monaco.createMultisigGroup(
      "EXECUTE_TX_TEST",
      [multisigMember1, multisigMember2.publicKey, multisigMember3.publicKey],
      3,
    );

    const [multisigSignerPk] = await PublicKey.findProgramAddress(
      [multisigPk.toBuffer()],
      monaco.program.programId,
    );

    // accounts required for set_multisig_members call
    const instructionAccounts = [
      {
        pubkey: multisigPk,
        isSigner: false,
        isWritable: true,
      } as AccountMeta,
      {
        pubkey: multisigSignerPk,
        isSigner: true,
        isWritable: false,
      } as AccountMeta,
    ];

    // encode instruction data
    const newMember1 = Keypair.generate();
    const newMember2 = Keypair.generate();
    const newMembersList = [
      multisigMember1,
      multisigMember2.publicKey,
      multisigMember3.publicKey,
      newMember1.publicKey,
      newMember2.publicKey,
    ];

    const instructionData = monaco.program.coder.instruction.encode(
      "set_multisig_members",
      {
        newMembers: newMembersList,
      },
    );

    // create transaction (first approval)
    const txPk = await monaco.createMultisigTransaction(
      multisigPk,
      multisigMember1,
      instructionData,
      instructionAccounts,
    );

    // second approval
    await monaco.program.methods
      .approveMultisigTransaction()
      .accounts({
        multisigGroup: multisigPk,
        multisigTransaction: txPk,
        multisigMember: multisigMember2.publicKey,
      })
      .signers([multisigMember2])
      .rpc();

    // third approval (threshold achieved)
    await monaco.program.methods
      .approveMultisigTransaction()
      .accounts({
        multisigGroup: multisigPk,
        multisigTransaction: txPk,
        multisigMember: multisigMember3.publicKey,
      })
      .signers([multisigMember3])
      .rpc();

    // execute transaction
    await monaco.executeMultisigTransaction(
      multisigPk,
      txPk,
      multisigSignerPk,
      instructionAccounts,
    );

    // check that tx has been executed
    const executedTx = await monaco.program.account.multisigTransaction.fetch(
      txPk,
    );
    assert.equal(executedTx.executed, true);

    // check that multisig instruction has executed - new members have been added
    const updatedMultisigGroup =
      await monaco.program.account.multisigGroup.fetch(multisigPk);
    assert.deepEqual(updatedMultisigGroup.members, newMembersList);
    assert.equal(updatedMultisigGroup.membersVersion, 1);
  });
});
