import { Program, AnchorProvider } from "@project-serum/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  AddPricesToOutcomeResponse,
  BatchAddPricesToOutcomeResponse,
  BatchAddPricesToOutcomes,
  BatchAddPricesToOutcomesResponse,
  Operator,
  ClientResponse,
  ResponseFactory,
} from "../types";
import { findMarketOutcomePda } from "./market_outcome";
import { findAuthorisedOperatorsAccountPda } from "./operators";

/**
 * For the given market and outcome index, add the provided prices to the price ladder for that outcome - program must be initialized by the `MARKET` operator that initialised the market
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {publicKey} publicKey for the market the outcome is associated with
 * @param outcomeIndex {number} index representing the outcome on the market
 * @param priceLadder {number[]} array of price points to add to the outcome
 * @returns {AddPricesToOutcomeResponse} the transaction ID for the request and confirmation of the ladder passed
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const priceLadder = [5, 6, 7, 8]
 * const outcomeIndex = 1
 * const addPrices = await addPricesToOutcome(program, marketPk, outcomeIndex, priceLadder)
 */
export async function addPricesToOutcome(
  program: Program,
  marketPk: PublicKey,
  outcomeIndex: number,
  priceLadder: number[],
): Promise<ClientResponse<AddPricesToOutcomeResponse>> {
  const response = new ResponseFactory({} as AddPricesToOutcomeResponse);
  const provider = program.provider as AnchorProvider;

  const [authorisedOperatorsPda, marketOutcomePda] = await Promise.all([
    findAuthorisedOperatorsAccountPda(program, Operator.MARKET),
    findMarketOutcomePda(program, marketPk, outcomeIndex),
  ]);

  if (!authorisedOperatorsPda.success) {
    response.addErrors(authorisedOperatorsPda.errors);
    return response.body;
  }

  if (!marketOutcomePda.success) {
    response.addErrors(marketOutcomePda.errors);
    return response.body;
  }

  try {
    const tnxId = await program.methods
      .addPricesToMarketOutcome(marketPk, outcomeIndex, priceLadder)
      .accounts({
        systemProgram: SystemProgram.programId,
        outcome: marketOutcomePda.data.pda,
        authorisedOperators: authorisedOperatorsPda.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();

    response.addResponseData({
      priceLadder: priceLadder,
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }

  return response.body;
}

/**
 * Batch process to, for the given market and outcome, add the provided prices to the price ladder for that outcome - program must be initialized by the `MARKET` operator that initialised the market.
 *
 * A batch is how many elements from the priceLadder to add in a single request.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {publicKey} publicKey for the market the outcome is associated with
 * @param priceLadder {number[]} array of price points to add to the outcome
 * @param outcomeIndex {number} index representing the outcome on the market
 * @param batchSize {number} number of prices to add in a single request
 * @returns {BatchAddPricesToOutcomeResponse} array of the batches sent during the request containing the transaction ID for the request and confirmation of the ladder passed
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const priceLadder = [5, 6, 7, 8]
 * const outcomeIndex = 1
 * const batchSize = 2
 * const batchAddPrices = await batchAddPricesToOutcomePool(program, marketPk, outcomeIndex, priceLadder, batchSize)
 */
export async function batchAddPricesToOutcomePool(
  program: Program,
  marketPk: PublicKey,
  outcomeIndex: number,
  priceLadder: number[],
  batchSize: number,
): Promise<ClientResponse<BatchAddPricesToOutcomeResponse>> {
  const response = new ResponseFactory({} as BatchAddPricesToOutcomeResponse);

  const batches = [] as AddPricesToOutcomeResponse[];
  for (let i = 0; i < priceLadder.length; i += batchSize) {
    const ladderBatch = priceLadder.slice(i, i + batchSize);
    const addOddsResponse = await addPricesToOutcome(
      program,
      marketPk,
      outcomeIndex,
      ladderBatch,
    );
    if (addOddsResponse.success) {
      batches.push(addOddsResponse.data);
    } else {
      response.addErrors(addOddsResponse.errors);
    }
  }
  response.addResponseData({
    batches: batches,
  });
  return response.body;
}

/**
 * Batch process to, for the given market, add the provided prices to the price ladder for all outcomes - program must be initialized by the `MARKET` operator that initialised the market.
 *
 * A batch is how many elements from the priceLadder to add in a single request.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {publicKey} publicKey for the market the outcome is associated with
 * @param priceLadder {number[]} array of price points to add to the outcome
 * @param batchSize {number} number of prices to add in a single request
 * @returns {BatchAddPricesToOutcomeResponse} array of the batches sent during the request containing the transaction ID for the request and confirmation of the ladder passed
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const priceLadder = [5, 6, 7, 8]
 * const batchSize = 2
 * const batchAddPrices = await batchAddPricesToAllOutcomePools(program, marketPk, priceLadder, batchSize)
 */
export async function batchAddPricesToAllOutcomePools(
  program: Program,
  marketPk: PublicKey,
  priceLadder: number[],
  batchSize: number,
): Promise<ClientResponse<BatchAddPricesToOutcomesResponse>> {
  const response = new ResponseFactory({} as BatchAddPricesToOutcomesResponse);
  const market = await program.account.market.fetch(marketPk);

  const results = [] as BatchAddPricesToOutcomes[];
  for (
    let outcomeIndex = 0;
    outcomeIndex < market.marketOutcomesCount;
    outcomeIndex++
  ) {
    const outcomePda = await findMarketOutcomePda(
      program,
      marketPk,
      outcomeIndex,
    );
    const batches = await batchAddPricesToOutcomePool(
      program,
      marketPk,
      outcomeIndex,
      priceLadder,
      batchSize,
    );
    if (batches.data.batches) {
      results.push({
        outcomeIndex: outcomeIndex,
        outcomePda: outcomePda.data.pda,
        batches: batches.data.batches,
      });
    } else {
      response.addErrors(batches.errors);
    }
    if (!batches.success) {
      response.addErrors(batches.errors);
    }
  }
  response.addResponseData({
    results: results,
  });
  return response.body;
}
