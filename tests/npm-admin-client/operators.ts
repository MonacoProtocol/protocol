import {
  Program,
  AnchorProvider,
  setProvider,
  workspace,
} from "@project-serum/anchor";
import { Keypair } from "@solana/web3.js";
import assert from "assert";
import {
  findAuthorisedOperatorsAccountPda,
  authoriseAdminOperator,
  authoriseCrankOperator,
  authoriseMarketOperator,
  getOperatorsAccountByType,
  checkOperatorRoles,
} from "../../npm-admin-client/src";
import { Operator } from "../../npm-admin-client/types";

describe("Find authorised operator accounts", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  const operatorTypes = [
    { operatorType: Operator.ADMIN },
    { operatorType: Operator.CRANK },
    { operatorType: Operator.MARKET },
  ];
  it.each(operatorTypes)(
    "Finds %p authorised operators account",
    async (testData) => {
      const protocolProgram = workspace.MonacoProtocol as Program;

      const authorisedOperatorsAccount =
        await findAuthorisedOperatorsAccountPda(
          protocolProgram,
          testData.operatorType,
        );
      assert(authorisedOperatorsAccount.success);
      assert(authorisedOperatorsAccount.data.pda);
      assert.deepEqual(authorisedOperatorsAccount.errors, []);
    },
  );
});

describe("Get operator accounts by type", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  const operatorTypes = [
    { operatorType: Operator.ADMIN },
    { operatorType: Operator.CRANK },
    { operatorType: Operator.MARKET },
  ];
  it.each(operatorTypes)("Get %p operators account", async (testData) => {
    const protocolProgram = workspace.MonacoProtocol as Program;

    const operatorAccount = await getOperatorsAccountByType(
      protocolProgram,
      testData.operatorType,
    );

    assert(operatorAccount.success);
    assert(operatorAccount.data);
    assert.deepEqual(operatorAccount.errors, []);
  });
});

describe("Check operator roles", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  it("Operator has all roles", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;

    const status = await checkOperatorRoles(
      protocolProgram,
      provider.publicKey,
    );

    assert(status.success);
    assert.deepEqual(status.errors, []);
    assert.deepEqual(status.data, {
      operatorPk: provider.publicKey,
      admin: true,
      crank: true,
      market: true,
    });
  });

  it("Operator has no roles", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const newProvider = new Keypair();

    const status = await checkOperatorRoles(
      protocolProgram,
      newProvider.publicKey,
    );

    assert(status.success);
    assert.deepEqual(status.errors, []);
    assert.deepEqual(status.data, {
      operatorPk: newProvider.publicKey,
      admin: false,
      crank: false,
      market: false,
    });
  });

  it("Operator has crank role", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const newProvider = new Keypair();

    await authoriseCrankOperator(protocolProgram, newProvider.publicKey);

    const status = await checkOperatorRoles(
      protocolProgram,
      newProvider.publicKey,
    );

    assert(status.success);
    assert.deepEqual(status.errors, []);
    assert.deepEqual(status.data, {
      operatorPk: newProvider.publicKey,
      admin: false,
      crank: true,
      market: false,
    });
  });

  it("Operator has market role", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const newProvider = new Keypair();

    await authoriseMarketOperator(protocolProgram, newProvider.publicKey);

    const status = await checkOperatorRoles(
      protocolProgram,
      newProvider.publicKey,
    );

    assert(status.success);
    assert.deepEqual(status.errors, []);
    assert.deepEqual(status.data, {
      operatorPk: newProvider.publicKey,
      admin: false,
      crank: false,
      market: true,
    });
  });
});

describe("Authorise operator accounts", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  const operatorTypes = [
    { operatorType: Operator.ADMIN },
    { operatorType: Operator.CRANK },
    { operatorType: Operator.MARKET },
  ];
  it.each(operatorTypes)("Authorise %p operators account", async (testData) => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const newProvider = new Keypair();

    let authoriseResponse;
    switch (testData.operatorType) {
      case Operator.ADMIN:
        authoriseResponse = await authoriseAdminOperator(
          protocolProgram,
          newProvider.publicKey,
        );
        break;
      case Operator.MARKET:
        authoriseResponse = await authoriseMarketOperator(
          protocolProgram,
          newProvider.publicKey,
        );
        break;
      case Operator.CRANK:
        authoriseResponse = await authoriseCrankOperator(
          protocolProgram,
          newProvider.publicKey,
        );
        break;
    }

    assert(authoriseResponse.success);
    assert(authoriseResponse.data.tnxId);
    assert(authoriseResponse.data.authorisedOperatorsPk);
    assert(authoriseResponse.data.operatorPk);

    const operatorAccount = await getOperatorsAccountByType(
      protocolProgram,
      testData.operatorType,
    );

    const operatorList = operatorAccount.data.operatorsAccount.operatorList.map(
      (operator) => operator.toBase58(),
    );
    assert(operatorAccount.success);
    assert(operatorAccount.data);
    assert(operatorList.includes(newProvider.publicKey.toBase58()));
    assert.deepEqual(operatorAccount.errors, []);
  });
});
