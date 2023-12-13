import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import {
  PublicKey,
  TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { ClientResponse, ResponseFactory } from "../types";
import {
  SignAndSendInstructionsBatchResponse,
  SignAndSendInstructionsResponse,
} from "../types/transactions";

/**
 * Helper function to return a pda from the supplied seeds
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param seeds {(Buffer | Uint8Array)[]} list of seeds to generate the pda from
 * @returns {publicKey} pda constructed from the supplied seeds for the given program
 *
 * @example
 * const seed1 = Buffer.from("seed2")
 * const seed2 = Buffer.from("seed2")
 * const pda = await findPdaWithSeeds(program.programId, [seed1, seed2])
 */
export async function findPdaWithSeeds(
  program: Program,
  seeds: (Buffer | Uint8Array)[],
): Promise<PublicKey | number> {
  const [pda] = await PublicKey.findProgramAddress(seeds, program.programId);
  return pda;
}

/**
 * For the provided transaction signature, confirm the transaction.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param signature {string | void} signature of the transaction
 * @returns {ClientResponse<unknown>} empty client response containing no data, only success state and errors
 *
 * @example
 *
 * const orderInstruction = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
 * const transaction = await signAndSendInstruction(program, orderInstruction.data.instruction)
 * const confirmation = await confirmTransaction(program, transaction.data.signature);
 */
export async function confirmTransaction(
  program: Program,
  signature: string | void,
): Promise<ClientResponse<unknown>> {
  const response = new ResponseFactory({});
  const provider = program.provider as AnchorProvider;
  try {
    const blockHash = await provider.connection.getLatestBlockhash();
    const confirmRequest = {
      blockhash: blockHash.blockhash,
      lastValidBlockHeight: blockHash.lastValidBlockHeight,
      signature: signature as string,
    };
    await provider.connection.confirmTransaction(confirmRequest);
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

/**
 * Sign and send, as the provider authority, the given transaction instructions.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param instructions {TransactionInstruction[]} list of instruction for the transaction
 * @param computeUnitLimit {number} optional limit on the number of compute units to be used by the transaction
 * @returns {SignAndSendInstructionsResponse} containing the signature of the transaction
 *
 * @example
 *
 * const orderInstruction = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
 * const computeUnitLimit = 1400000
 * const transaction = await signAndSendInstruction(program, [orderInstruction.data.instruction], computeUnitLimit)
 */
export async function signAndSendInstructions(
  program: Program,
  instructions: TransactionInstruction[],
  computeUnitLimit?: number,
  computeUnitPrice?: number,
): Promise<ClientResponse<SignAndSendInstructionsResponse>> {
  const response = new ResponseFactory({} as SignAndSendInstructionsResponse);
  const provider = program.provider as AnchorProvider;

  const transaction = new web3.Transaction();
  instructions.forEach((instruction) => transaction.add(instruction));
  if (computeUnitLimit)
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: computeUnitPrice ? computeUnitPrice : 0,
      }),
    );

  transaction.feePayer = provider.wallet.publicKey;
  transaction.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;
  try {
    const signature = await provider.connection.sendRawTransaction(
      (await provider.wallet.signTransaction(transaction)).serialize(),
    );
    response.addResponseData({ signature });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

/**
 * Sign and send, as the provider authority, the given transaction instructions in the provided batch sizes.
 *
 * Note: batches can be optimised for size by ensuring that instructions have commonality among accounts (same walletPk, same marketPk, same marketMatchingPoolPk, etc.)
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param instructions {TransactionInstruction[]} list of instruction for the transaction
 * @param batchSize {number} number of instructions to be included in each transaction
 * @param computeUnitLimit {number} optional limit on the number of compute units to be used by the transaction
 * @returns {SignAndSendInstructionsBatchResponse} containing the signature of the transaction
 * @returns
 *
 * @example
 *
 * const orderInstruction1 = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
 * ...
 * const orderInstruction20 = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
 * const batchSize = 5
 * const computeUnitLimit = 1400000
 * const transactions = await signAndSendInstructionsBatch(program, [orderInstruction1.data.instruction, ..., orderInstruction20.data.instruction], batchSize, computeUnitLimit)
 */
export async function signAndSendInstructionsBatch(
  program: Program,
  instructions: TransactionInstruction[],
  batchSize: number,
  computeUnitLimit?: number,
  computeUnitPrice?: number,
): Promise<ClientResponse<SignAndSendInstructionsBatchResponse>> {
  const response = new ResponseFactory(
    {} as SignAndSendInstructionsBatchResponse,
  );
  const signatures = [] as string[];
  const failedInstructions = [] as TransactionInstruction[];

  for (let i = 0; i < instructions.length; i += batchSize) {
    const slicedInstructions = instructions.slice(i, i + batchSize);
    const send = await signAndSendInstructions(
      program,
      slicedInstructions,
      computeUnitLimit,
      computeUnitPrice,
    );
    if (send.success) {
      signatures.push(send.data.signature);
    } else {
      response.addErrors(send.errors);
      failedInstructions.push(...slicedInstructions);
    }
  }

  response.addResponseData({ signatures, failedInstructions });

  return response.body;
}
