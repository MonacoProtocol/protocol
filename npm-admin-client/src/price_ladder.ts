import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  TransactionResponse,
  TransactionBatchResponse,
} from "../types";

/**
 * Find a PDA for a price ladder.
 *
 * The following seeds are used for price ladder PDA calculation:
 *  - The string "price_ladder",
 *  - The configured provider wallet's public key
 *  - The string passed in as the distinctSeed parameter
 *
 * @param program
 * @param distinctSeed {string} The distinct seed used for this price ladder
 */
export function findPriceLadderPda(
  program: Program,
  distinctSeed: string,
): ClientResponse<FindPdaResponse> {
  const response = new ResponseFactory({} as FindPdaResponse);
  const provider = program.provider as AnchorProvider;

  response.addResponseData({
    pda: PublicKey.findProgramAddressSync(
      [
        Buffer.from("price_ladder"),
        provider.wallet.publicKey.toBuffer(),
        Buffer.from(distinctSeed),
      ],
      program.programId,
    )[0],
  });
  return response.body;
}

/**
 * Create a price ladder with the given prices.
 *
 * This is a convenience function that combines the createPriceLadder and addPricesToPriceLadder functions.
 *
 * @param program
 * @param priceLadderPk {PublicKey} The public key of the price ladder to create
 * @param distinctSeed {string} The distinct seed used for this price ladder
 * @param prices {number[]} The prices to add to the price ladder
 */
export async function createPriceLadderWithPrices(
  program: Program,
  priceLadderPk: PublicKey,
  distinctSeed: string,
  prices: number[],
): Promise<ClientResponse<TransactionBatchResponse>> {
  const response = new ResponseFactory({});
  const createResp = await createPriceLadder(
    program,
    priceLadderPk,
    distinctSeed,
    prices.length,
  );
  if (!createResp.success) {
    response.addErrors(createResp.errors);
    return response.body;
  }
  response.addResponseData({
    tnxIds: [createResp.data.tnxId],
  });

  const addResp = await addPricesToPriceLadder(program, priceLadderPk, prices);
  if (!addResp.success) {
    response.addErrors(addResp.errors);
    return response.body;
  }

  response.addResponseData({
    tnxIds: [createResp.data.tnxId, ...addResp.data.tnxIds],
  });
  return response.body;
}

/**
 * Create an empty price ladder with the given maximum number of prices.
 *
 * @param program
 * @param priceLadderPk {PublicKey} The public key of the price ladder to create
 * @param distinctSeed {string} The distinct seed used for this price ladder
 * @param max_number_of_prices {number} The maximum number of prices to allow in the price ladder
 */
export async function createPriceLadder(
  program: Program,
  priceLadderPk: PublicKey,
  distinctSeed: string,
  max_number_of_prices: number,
): Promise<ClientResponse<TransactionResponse>> {
  const response = new ResponseFactory({});
  const provider = program.provider as AnchorProvider;

  try {
    response.addResponseData({
      tnxId: await program.methods
        .createPriceLadder(distinctSeed, max_number_of_prices)
        .accounts({
          priceLadder: priceLadderPk,
          authority: provider.wallet.publicKey,
        })
        .rpc(),
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

/**
 * Add prices to the given price ladder.
 *
 * No error is thrown if the price already exists in the price ladder.
 * An error will be thrown if the price is invalid (i.e., <= 1.0) or if the price ladder is full.
 *
 * @param program
 * @param priceLadderPk {PublicKey} The public key of the price ladder to update
 * @param pricesToAdd {number[]} The prices to add to the price ladder
 * @param batchSize {number} Default = 50 The number of prices to add in each transaction
 */
export async function addPricesToPriceLadder(
  program: Program,
  priceLadderPk: PublicKey,
  pricesToAdd: number[],
  batchSize = 50,
): Promise<ClientResponse<TransactionBatchResponse>> {
  const response = new ResponseFactory({});
  const provider = program.provider as AnchorProvider;

  const tnxIds: string[] = [];
  for (let i = 0; i < pricesToAdd.length; i += batchSize) {
    const priceBatch = pricesToAdd.slice(i, i + batchSize);
    try {
      tnxIds.push(
        await program.methods
          .addPricesToPriceLadder(priceBatch)
          .accounts({
            priceLadder: priceLadderPk,
            authority: provider.wallet.publicKey,
          })
          .rpc(),
      );
    } catch (e) {
      response.addError(e);
      return response.body;
    }
  }

  response.addResponseData({ tnxIds: tnxIds });
  return response.body;
}

/**
 * Removes prices from a given price ladder if they exist.
 *
 * No error is thrown if the price does not exist in the price ladder.
 *
 * @param program
 * @param priceLadderPk {PublicKey} The public key of the price ladder to update
 * @param pricesToRemove {number[]} The prices to remove from the price ladder
 * @param batchSize {number} Default = 50 The number of prices to remove in each transaction
 */
export async function removePricesFromPriceLadder(
  program: Program,
  priceLadderPk: PublicKey,
  pricesToRemove: number[],
  batchSize = 50,
): Promise<ClientResponse<TransactionBatchResponse>> {
  const response = new ResponseFactory({});
  const provider = program.provider as AnchorProvider;

  const tnxIds: string[] = [];
  for (let i = 0; i < pricesToRemove.length; i += batchSize) {
    const priceBatch = pricesToRemove.slice(i, i + batchSize);
    try {
      tnxIds.push(
        await program.methods
          .removePricesFromPriceLadder(priceBatch)
          .accounts({
            priceLadder: priceLadderPk,
            authority: provider.wallet.publicKey,
          })
          .rpc(),
      );
    } catch (e) {
      response.addError(e);
      return response.body;
    }
  }

  response.addResponseData({ tnxIds: tnxIds });
  return response.body;
}

/**
 * Increase the maximum number of prices that can be stored in a given price ladder.
 *
 * This is useful if you want to add more prices to the ladder after it has been created and already filled.
 *
 * Note, as the space allocated for the price ladder data is being increase this operation will cost some SOL to cover rent exclusion fees.
 * Total rent exclusion fees are refunded if the account is closed.
 *
 * @param program
 * @param priceLadderPk {PublicKey} The public key of the price ladder to update
 * @param max_number_of_prices {number} The new maximum number of prices to allow in the price ladder
 */
export async function increasePriceLadderSize(
  program: Program,
  priceLadderPk: PublicKey,
  max_number_of_prices: number,
): Promise<ClientResponse<TransactionResponse>> {
  const response = new ResponseFactory({});
  const provider = program.provider as AnchorProvider;

  try {
    response.addResponseData({
      tnxId: await program.methods
        .increasePriceLadderSize(max_number_of_prices)
        .accounts({
          priceLadder: priceLadderPk,
          authority: provider.wallet.publicKey,
        })
        .rpc(),
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}
