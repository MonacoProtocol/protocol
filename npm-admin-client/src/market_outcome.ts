import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  ClientResponse,
  ResponseFactory,
  SignAndSendInstructionsBatchResponse,
  SignAndSendInstructionsResponse,
  TransactionOptionsBatch,
} from "../types";
import { signAndSendInstructionsBatch } from "./utils";
import { buildInitialiseOutcomesInstructions } from "./market_outcome_instruction";

/**
 * For the given market account, initialise outcome accounts for the provided outcomes
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to initialise the outcome for
 * @param outcomes {string[]} list of strings representing the market outcomes
 * @param priceLadderPk {PublicKey | null} publicKey of the price ladder to associate with the outcomes - if null, the protocol's default price ladder will be used
 * @returns {OutcomeInitialisationsResponse} list of the outcomes provided, their pdas and the transaction IDs performed in the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const outcomes = ["Monaco Protocol", "Draw"]
 * const priceLadderPk = new PublicKey('5cL9zVtKrugMx6J6vT5LP4hdxq5TSGzrcc5GMj3YSwGk');
 * const initialiseOutcomeRequest = await initialiseOutcomes(program, marketPk, outcomes, priceLadderPk)
 */
export async function initialiseOutcomes(
  program: Program,
  marketPk: PublicKey,
  outcomes: string[],
  priceLadderPk?: PublicKey,
  options?: TransactionOptionsBatch,
): Promise<ClientResponse<SignAndSendInstructionsBatchResponse>> {
  const response = new ResponseFactory({} as SignAndSendInstructionsResponse);
  const DEFAULT_BATCH_SIZE = 2;

  const instructions = await buildInitialiseOutcomesInstructions(
    program,
    marketPk,
    outcomes,
    priceLadderPk,
  );
  const transaction = await signAndSendInstructionsBatch(
    program,
    instructions.data.instructions.map((i) => i.instruction),
    options?.batchSize ? options.batchSize : DEFAULT_BATCH_SIZE,
    options?.computeUnitLimit,
    options?.computeUnitPrice,
  );

  if (transaction.success) {
    response.addResponseData({
      signatures: transaction.data.signatures,
      failedInstructions: transaction.data.failedInstructions,
    });
  } else {
    response.addErrors(transaction.errors);
  }

  return response.body;
}
