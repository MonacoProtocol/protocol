import { Program, AnchorProvider } from "@project-serum/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  OutcomeInitialisationsResponse,
  OutcomeInitialisationResponse,
  Operator,
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
} from "../types";
import { confirmTransaction } from "./utils";
import { findAuthorisedOperatorsAccountPda } from "./operators";

/**
 * For the given market account, initialise an outcome account for the provided outcome; optional priceLadder added to the outcome if supplied.
 *
 * **Note** It is advised to create an outcome with an empty priceLadder then use `batchAddPricesToOutcomePool` if adding a large priceLadder.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to initialise the outcome for
 * @param outcome {string} string representation of the outcome
 * @param priceLadder {number[]} optional priceLadder to add to the outcome at time of creation
 * @returns {OutcomeInitialisationResponse} the outcome provided, the pda for the outcome account and the transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const outcome = "Draw"
 * const priceLadder = [1, 2, 3, 4]
 * const initialiseOutcomeRequest = await initialiseOutcome(program, marketPk, outcome, priceLadder)
 */
export async function initialiseOutcome(
  program: Program,
  marketPk: PublicKey,
  outcome: string,
  priceLadder: number[] = [],
): Promise<ClientResponse<OutcomeInitialisationResponse>> {
  const response = new ResponseFactory({} as OutcomeInitialisationResponse);
  const provider = program.provider as AnchorProvider;

  const [authorisedOperatorsPda, nextOutcomePda] = await Promise.all([
    findAuthorisedOperatorsAccountPda(program, Operator.MARKET),
    findNextOutcomePda(program, marketPk),
  ]);

  if (!authorisedOperatorsPda.success) {
    response.addErrors(authorisedOperatorsPda.errors);
    return response.body;
  }

  if (!nextOutcomePda.success) {
    response.addErrors(nextOutcomePda.errors);
    return response.body;
  }
  try {
    const tnxId = await program.methods
      .initializeMarketOutcome(outcome, priceLadder)
      .accounts({
        systemProgram: SystemProgram.programId,
        outcome: nextOutcomePda.data.pda,
        market: marketPk,
        authorisedOperators: authorisedOperatorsPda.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();

    await confirmTransaction(program, tnxId);

    response.addResponseData({
      outcome: outcome,
      outcomePda: nextOutcomePda.data.pda,
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }

  return response.body;
}

/**
 * For the given market account, initialise outcome accounts for the provided outcomes
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to initialise the outcome for
 * @param outcomes {string[]} list of strings representing the market outcomes
 * @returns {OutcomeInitialisationsResponse} list of the outcomes provided, their pdas and the transaction IDs performed in the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const outcomes = ["Monaco Protocol", "Draw"]
 * const initialiseOutcomeRequest = await initialiseOutcomes(program, marketPk, outcomes)
 */
export async function initialiseOutcomes(
  program: Program,
  marketPk: PublicKey,
  outcomes: string[],
): Promise<ClientResponse<OutcomeInitialisationsResponse>> {
  const response = new ResponseFactory({} as OutcomeInitialisationsResponse);

  const transactions = { outcomes: [] } as OutcomeInitialisationsResponse;
  for (const outcome of outcomes) {
    const initalisationResponse = await initialiseOutcome(
      program,
      marketPk,
      outcome,
    );
    if (initalisationResponse.success) {
      transactions.outcomes.push(initalisationResponse.data);
    } else {
      response.addErrors(initalisationResponse.errors);
    }
  }
  return response.body;
}

/**
 * For the given market and outcome index, returns the pda for that outcome account
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to initialise the outcome for
 * @param marketOutcomeIndex {number} number representing the index of the outcome
 * @returns {FindPdaResponse} pda of the market outcome account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const outcomeIndex = 2
 * const outcomePda = await findMarketOutcomePda(program, marketPk, outcomeIndex)
 */
export async function findMarketOutcomePda(
  program: Program,
  marketPk: PublicKey,
  marketOutcomeIndex: number,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);

  try {
    const [pda, _] = await PublicKey.findProgramAddress(
      [marketPk.toBuffer(), Buffer.from(marketOutcomeIndex.toString())],
      program.programId,
    );

    response.addResponseData({
      pda: pda,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

/**
 * For the given market, return the pda for the next possible outcome account based off how many outcomes already exist on that market account
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to initialise the outcome for
 * @returns {FindPdaResponse} pda of the next possible market outcome account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const outcomeIndex = 2
 * const outcomePda = await findNextOutcomePda(program, marketPk)
 */
export async function findNextOutcomePda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  try {
    const market = await program.account.market.fetch(marketPk);
    try {
      const nextOutcomePda = await findMarketOutcomePda(
        program,
        marketPk,
        market.marketOutcomesCount,
      );
      response.addResponseData({
        pda: nextOutcomePda.data.pda,
      });
    } catch (e) {
      response.addError(e);
      return response.body;
    }
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}
