import { monaco } from "../util/wrappers";
import { AccountMeta, Keypair } from "@solana/web3.js";
import * as assert from "assert";

describe("Multisig Transaction Creation", () => {
  it("Creation success", async () => {
    const multisigMemberPk = monaco.provider.wallet.publicKey;
    const multisigPk = await monaco.createMultisigGroup(
      "TX_TEST",
      [multisigMemberPk],
      1,
    );

    // accounts required for set_multisig_members call
    const instructionAccounts = [
      {
        pubkey: multisigPk,
        isSigner: false,
        isWritable: true,
      } as AccountMeta,
      {
        pubkey: multisigMemberPk,
        isSigner: true,
        isWritable: false,
      } as AccountMeta,
    ];

    // encode instruction data
    const newMember1 = Keypair.generate();
    const newMember2 = Keypair.generate();
    const instructionData = monaco.program.coder.instruction.encode(
      "set_multisig_members",
      {
        new_members: [
          multisigMemberPk,
          newMember1.publicKey,
          newMember2.publicKey,
        ],
      },
    );

    const txPk = await monaco.createMultisigTransaction(
      multisigPk,
      multisigMemberPk,
      instructionData,
      instructionAccounts,
    );

    const multisigTx = await monaco.program.account.multisigTransaction.fetch(
      txPk,
    );
    assert.equal(multisigTx.multisigGroup.toBase58(), multisigPk.toBase58());
    assert.deepEqual(multisigTx.instructionAccounts, instructionAccounts);
    assert.deepEqual(multisigTx.instructionData, instructionData);
    assert.deepEqual(multisigTx.multisigApprovals, [true]);
    assert.equal(multisigTx.executed, false);
    assert.equal(multisigTx.membersVersion, 0);
  });
});
