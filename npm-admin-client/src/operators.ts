import { Program, AnchorProvider } from "@project-serum/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  Operator,
  AuthoriseOperatorResponse,
  AuthorisedOperatorsAccountResponse,
  CheckOperatorRolesResponse,
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
} from "../types";
import { findPdaWithSeeds } from "./utils";

/**
 * Authorises the provided publicKey as a `MARKET` operator - program must be initialized an `ADMIN` operator
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param operatorPk {PublicKey} publicKey of the wallet to set as an operator
 * @returns {AuthoriseOperatorResponse} transaction ID for the request, the authorised operators account publicKey and the requested operator publicKey
 *
 * @example
 *
 * const newOperatorPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
 * const authoriseOperator = await authoriseMarketOperator(program, newOperatorPk)
 */
export async function authoriseMarketOperator(
  program: Program,
  operatorPk: PublicKey,
): Promise<ClientResponse<AuthoriseOperatorResponse>> {
  return await authoriseOperator(program, Operator.MARKET, operatorPk);
}

/**
 * Authorises the provided publicKey as a `CRANK` operator - program must be initialized an `ADMIN` operator
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param operatorPk {PublicKey} publicKey of the wallet to set as an operator
 * @returns {AuthoriseOperatorResponse} transaction ID for the request, the authorised operators account publicKey and the requested operator publicKey
 *
 * @example
 *
 * const newOperatorPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
 * const authoriseOperator = await authoriseCrankOperator(program, newOperatorPk)
 */
export async function authoriseCrankOperator(
  program: Program,
  operatorPk: PublicKey,
): Promise<ClientResponse<AuthoriseOperatorResponse>> {
  return await authoriseOperator(program, Operator.CRANK, operatorPk);
}

/**
 * Authorises the provided publicKey as an `ADMIN` operator - program must be initialized an `ADMIN` operator
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param operatorPk {PublicKey} publicKey of the wallet to set as an operator
 * @returns {AuthoriseOperatorResponse} transaction ID for the request, the authorised operators account publicKey and the requested operator publicKey
 *
 * @example
 *
 * const newOperatorPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
 * const authoriseOperator = await authoriseAdminOperator(program, newOperatorPk)
 */
export async function authoriseAdminOperator(
  program: Program,
  operatorPk: PublicKey,
): Promise<ClientResponse<AuthoriseOperatorResponse>> {
  const response = new ResponseFactory({} as AuthoriseOperatorResponse);
  const provider = program.provider as AnchorProvider;

  const authorisedOperatorsPk = await findAuthorisedOperatorsAccountPda(
    program,
    Operator.ADMIN,
  );
  try {
    const tnxId = await program.methods
      .authoriseAdminOperator(operatorPk)
      .accounts({
        authorisedOperators: authorisedOperatorsPk.data.pda,
        adminOperator: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    response.addResponseData({
      tnxId: tnxId,
      authorisedOperatorsPk: authorisedOperatorsPk.data.pda,
      operatorPk: operatorPk,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}

/**
 * For the provided operator type account, fine the pda of the authorised operators account
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param operatorType {Operator} type of operator to find pda for
 * @returns {FindPdaResponse} pda for the provided operator type account
 *
 * @example
 *
 * const operatorPda = await findAuthorisedOperatorsAccountPda(program, Operator.CRANK)
 */
export async function findAuthorisedOperatorsAccountPda(
  program: Program,
  operatorType: Operator,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  try {
    const pda = await findPdaWithSeeds(program, [Buffer.from(operatorType)]);
    response.addResponseData({
      pda: pda,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

/**
 * For the provided operator type, get the operators account which contains all authorised operators of that type
 *
 * @param program {program} anchor program initialied by the consuming client
 * @param operatorType {Operator} type of operator to find pda for
 * @returns {AuthorisedOperatorsAccountResponse} publicKey of the operator account and the AuthorisedOperatorsAccount
 *
 * @example
 *
 * const operatorsAccount = await getOperatorsAccountByType(program, Operator.CRANK)
 */
export async function getOperatorsAccountByType(
  program: Program,
  operatorType: Operator,
): Promise<ClientResponse<AuthorisedOperatorsAccountResponse>> {
  const response = new ResponseFactory(
    {} as AuthorisedOperatorsAccountResponse,
  );
  const authorisedOperatorsAccount = await findAuthorisedOperatorsAccountPda(
    program,
    operatorType,
  );
  if (!authorisedOperatorsAccount.success) {
    response.addErrors(authorisedOperatorsAccount.errors);
    return response.body;
  }
  try {
    const operatorsAccount = await program.account.authorisedOperators.fetch(
      authorisedOperatorsAccount.data.pda,
    );
    response.addResponseData({
      publicKey: authorisedOperatorsAccount.data.pda,
      operatorsAccount: operatorsAccount,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}

/**
 * For the provided publicKey, check what operator roles have been assigned to it
 *
 * @param program {program} anchor program initialied by the consuming client
 * @param operatorPk {publicKey} publicKey to check
 * @returns {CheckOperatorRolesResponse} boolean status for each available operator role and the provided publicKey that was checked
 *
 * @example
 *
 * const operatorPk = new Publickey("5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk")
 * const operatorsAccount = await checkOperatorRoles(program, operatorPk)
 */
export async function checkOperatorRoles(
  program: Program,
  operatorPk: PublicKey,
): Promise<ClientResponse<CheckOperatorRolesResponse>> {
  const response = new ResponseFactory(
    {} as AuthorisedOperatorsAccountResponse,
  );

  try {
    const [adminOperators, marketOperators, crankOperators] = await Promise.all(
      [
        getOperatorsAccountByType(program, Operator.ADMIN),
        getOperatorsAccountByType(program, Operator.MARKET),
        getOperatorsAccountByType(program, Operator.CRANK),
      ],
    );

    const [adminOperatorList, marketOperatorList, crankOperatorsList] = [
      adminOperators.data.operatorsAccount.operatorList.map((operator) =>
        operator.toBase58(),
      ),
      marketOperators.data.operatorsAccount.operatorList.map((operator) =>
        operator.toBase58(),
      ),
      crankOperators.data.operatorsAccount.operatorList.map((operator) =>
        operator.toBase58(),
      ),
    ];

    response.addResponseData({
      operatorPk: operatorPk,
      admin: adminOperatorList.includes(operatorPk.toBase58()),
      market: marketOperatorList.includes(operatorPk.toBase58()),
      crank: crankOperatorsList.includes(operatorPk.toBase58()),
    });
  } catch (e) {
    response.addError(e);
  }

  return response.body;
}

async function authoriseOperator(
  program: Program,
  operatorType: Operator,
  operatorPk: PublicKey,
): Promise<ClientResponse<AuthoriseOperatorResponse>> {
  const response = new ResponseFactory({} as AuthoriseOperatorResponse);
  const provider = program.provider as AnchorProvider;

  const [authorisedOperatorsPk, adminOperatorsPk] = await Promise.all([
    findAuthorisedOperatorsAccountPda(program, operatorType),
    findAuthorisedOperatorsAccountPda(program, Operator.ADMIN),
  ]);

  try {
    const tnxId = await program.methods
      .authoriseOperator(operatorType, operatorPk)
      .accounts({
        authorisedOperators: authorisedOperatorsPk.data.pda,
        adminOperators: adminOperatorsPk.data.pda,
        adminOperator: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    response.addResponseData({
      tnxId: tnxId,
      authorisedOperatorsPk: authorisedOperatorsPk.data.pda,
      operatorPk: operatorPk,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}
