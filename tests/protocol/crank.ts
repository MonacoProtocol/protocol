import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
  authoriseAdminOperator,
  authoriseOperator,
  createAuthorisedOperatorsPda,
  OperatorType,
} from "../util/test_util";
import assert from "assert";

import { MonacoProtocol } from "../../target/types/monaco_protocol";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

describe("Protocol - Crank - Authorised Operator List", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const operatorAccount = Keypair.generate();
  const secondOperatorAccount = Keypair.generate();

  it("Add operator to the list", async () => {
    const protocolProgram: Program<MonacoProtocol> =
      anchor.workspace.MonacoProtocol;
    const authorisedOperatorsAccountPda = await authoriseOperator(
      operatorAccount,
      protocolProgram,
      provider,
      OperatorType.CRANK,
    );
    const account = await protocolProgram.account.authorisedOperators.fetch(
      authorisedOperatorsAccountPda,
    );

    const operators = account.operatorList.map((element) => element.toBase58());
    assert(operators.includes(operatorAccount.publicKey.toBase58()));
  });

  it("Add second operator to the list", async () => {
    const protocolProgram: Program<MonacoProtocol> =
      anchor.workspace.MonacoProtocol;
    const authorisedOperatorsAccountPda = await authoriseOperator(
      secondOperatorAccount,
      protocolProgram,
      provider,
      OperatorType.CRANK,
    );
    const account = await protocolProgram.account.authorisedOperators.fetch(
      authorisedOperatorsAccountPda,
    );

    const operators = account.operatorList.map((element) => element.toBase58());
    assert(operators.includes(operatorAccount.publicKey.toBase58()));
    assert(operators.includes(secondOperatorAccount.publicKey.toBase58()));
  });

  it("Remove operator from the list", async () => {
    const protocolProgram: Program<MonacoProtocol> =
      anchor.workspace.MonacoProtocol;
    const authorisedOperatorsPK = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );
    const adminOperatorsPK = await createAuthorisedOperatorsPda(
      OperatorType.ADMIN,
    );

    await protocolProgram.methods
      .removeAuthorisedOperator("CRANK", operatorAccount.publicKey)
      .accounts({
        authorisedOperators: authorisedOperatorsPK,
        adminOperator: provider.wallet.publicKey,
        adminOperators: adminOperatorsPK,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const account = await protocolProgram.account.authorisedOperators.fetch(
      authorisedOperatorsPK,
    );
    const operators = account.operatorList.map((element) => element.toBase58());
    assert(!operators.includes(operatorAccount.publicKey.toBase58()));
    assert(operators.includes(secondOperatorAccount.publicKey.toBase58()));
  });

  it("Remove operator who isn't in the list doesn't throw error", async () => {
    const newOperator = Keypair.generate();

    const protocolProgram: Program<MonacoProtocol> =
      anchor.workspace.MonacoProtocol;
    const authorisedOperatorsPK = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );
    const adminOperatorsPK = await createAuthorisedOperatorsPda(
      OperatorType.ADMIN,
    );

    await protocolProgram.methods
      .removeAuthorisedOperator("CRANK", newOperator.publicKey)
      .accounts({
        authorisedOperators: authorisedOperatorsPK,
        adminOperator: provider.wallet.publicKey,
        adminOperators: adminOperatorsPK,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const account = await protocolProgram.account.authorisedOperators.fetch(
      authorisedOperatorsPK,
    );
    const operators = account.operatorList.map((element) => element.toBase58());
    assert(!operators.includes(newOperator.publicKey.toBase58()));
    assert(operators.includes(secondOperatorAccount.publicKey.toBase58()));
  });

  it("Remove self as admin operator throws error", async () => {
    const protocolProgram = anchor.workspace.MonacoProtocol;

    const newOperator = Keypair.generate();
    const authorisedOperatorsPk = await authoriseAdminOperator(
      newOperator,
      protocolProgram,
      provider,
    );

    try {
      await protocolProgram.methods
        .removeAuthorisedOperator("ADMIN", provider.wallet.publicKey)
        .accounts({
          authorisedOperators: authorisedOperatorsPk,
          adminOperator: provider.wallet.publicKey,
          adminOperators: authorisedOperatorsPk,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      assert.equal(e.error.errorCode.code, "UnsupportedOperation");
    }

    try {
      await protocolProgram.methods
        .removeAuthorisedOperator("ADMIN", newOperator.publicKey)
        .accounts({
          authorisedOperators: authorisedOperatorsPk,
          adminOperator: provider.wallet.publicKey,
          adminOperators: authorisedOperatorsPk,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      console.error(e);
      assert.fail("Should be no error here");
    }
  });

  it("Fail when passing the incorrect casing for operator type parameter", async () => {
    const protocolProgram: Program<MonacoProtocol> =
      anchor.workspace.MonacoProtocol;

    const newOperator = Keypair.generate();
    const operatorType = "cRaNk";

    const [authorisedOperatorsPk] = await PublicKey.findProgramAddress(
      [Buffer.from("authorised_operators"), Buffer.from(operatorType)],
      protocolProgram.programId,
    );

    const adminOperatorsPk = await createAuthorisedOperatorsPda(
      OperatorType.ADMIN,
    );

    try {
      await protocolProgram.methods
        .authoriseOperator(operatorType, newOperator.publicKey)
        .accounts({
          authorisedOperators: authorisedOperatorsPk,
          adminOperator: provider.wallet.publicKey,
          adminOperators: adminOperatorsPk,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      assert.equal(e.error.errorCode.code, "InvalidOperatorType");
    }
  });
});
