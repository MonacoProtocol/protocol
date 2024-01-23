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
 * @param options {TransactionOptionsBatch} optional parameters:
 *   <ul>
 *     <li> batchSize - number of outcomes to create in single transaction (defaults to 2)</li>
 *     <li> confirmBatchSuccess - whether to confirm each batch transaction, if true and the current batch fails, the remaining batches will not be sent - this is overridden to always be true for initialising outcomes as they always need to be added sequentially and have their seeds validated/li>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 *
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

  if (!instructions.success) {
    response.addErrors(instructions.errors);
    return response.body;
  }

  const transaction = await signAndSendInstructionsBatch(
    program,
    instructions.data.instructions.map((i) => i.instruction),
    {
      batchSize: options?.batchSize ? options.batchSize : DEFAULT_BATCH_SIZE,
      confirmBatchSuccess: true,
      computeUnitLimit: options?.computeUnitLimit,
      computeUnitPrice: options?.computeUnitPrice,
    },
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
