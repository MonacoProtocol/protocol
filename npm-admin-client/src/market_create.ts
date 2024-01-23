import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  CreateMarketResponse,
  CreateMarketWithOutcomesAndPriceLadderResponse,
  ClientResponse,
  ResponseFactory,
  EpochTimeStamp,
  MarketCreateOptions,
} from "../types";
import { getMarket } from "./market_helpers";
import {
  confirmTransaction,
  signAndSendInstructions,
  signAndSendInstructionsBatch,
} from "./utils";
import { buildCreateMarketInstruction } from "./market_create_instruction";
import { buildInitialiseOutcomesInstructions } from "./market_outcome_instruction";
import { batchAddPricesToAllOutcomePools } from "./market_outcome_prices";

/**
 * For the given parameters:
 *
 * - Create a wagering market that accepts orders in the provided market token
 * - Create outcome accounts for the provided outcomes
 * - Applies the given priceLadder to all outcomes in batches
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketName {string} title of the market being created
 * @param marketType {string} type of the market being created
 * @param marketTokenPk {PublicKey} publicKey of the mint token being used to place an order on a market
 * @param marketLockTimestamp {EpochTimeStamp} timestamp in seconds representing when the market can no longer accept orders
 * @param eventAccountPk {PublicKey} publicKey of the event the market is associated with
 * @param outcomes {string[]} list of possible outcomes for the market
 * @param priceLadder {number[]} array of price points to add to the outcome, or the public key of a price ladder account (Optional - no price ladder will result in the protocol default being used for the market)
 * @param options {MarketCreateOptions} optional parameters:
 *   <ul>
 *     <li> marketTypeDiscriminator - string discriminator for the type of the market being created, e.g., relevant event period (defaults to null)</li>
 *     <li> marketTypeValue - string value for the type of the market being created, e.g., 100.5 for an over/under market type (defaults to null)</li>
 *     <li> existingMarketPk - publicKey of the market to recreate, if any (defaults to null)</li>
 *     <li> existingMarket - market account for existingMarketPk, will be fetched if not provided</li>
 *     <li> eventStartTimestamp - timestamp in seconds representing when the event starts (defaults to marketLockTimestamp)</li>
 *     <li> inplayEnabled - whether the market can accept orders after the event starts (defaults to false)</li>
 *     <li> inplayOrderDelay - number of seconds an inplay order must wait before its liquidity is added to the market and can be matched (defaults to 0)</li>
 *     <li> eventStartOrderBehaviour - protocol behaviour to perform when the event start timestamp is reached (defaults to MarketOrderBehaviour.None)</li>
 *     <li> marketLockOrderBehaviour - protocol behaviour to perform when the market lock timestamp is reached (defaults to MarketOrderBehaviour.None)</li>
 *     <li> batchSize - number of prices to add in a single request (defaults to 50)</li>
 *     <li> confirmBatchSuccess - whether to confirm each batch transaction, if true and the current batch fails, the remaining batches will not be sent - this is overridden to always be true for initialising outcomes as they always need to be added sequentially and have their seeds validated/li>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 *
 * @returns {CreateMarketWithOutcomesAndPriceLadderResponse} containing the newly-created market account publicKey, creation transaction ID, the market account and the results of the batched requests to add prices to the outcome accounts
 *
 * @example
 *
 * const name = "Full Time Result"
 * const marketType = "EventResultWinner"
 * const marketTypeDiscriminator = null;
 * const marketTypeValue = null;
 * const marketTokenPk = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
 * const marketLock = 1633042800
 * const eventAccountPk = new PublicKey('E4YEQpkedH8SbcRkN1iByoRnH8HZeBcTnqrrWkjpqLXA')
 * const outcomes = ["Red", "Draw", "Blue"]
 * const priceLadder = DEFAULT_PRICE_LADDER
 * const newMarket = await createMarket(program, name, marketType, marketTypeDiscriminator, marketTypeValue, marketTokenPk, marketLock, eventAccountPk, outcomes, priceLadder)
 */
export async function createMarketWithOutcomesAndPriceLadder(
  program: Program,
  marketName: string,
  marketType: string,
  marketTokenPk: PublicKey,
  marketLockTimestamp: EpochTimeStamp,
  eventAccountPk: PublicKey,
  outcomes: string[],
  priceLadder?: number[] | PublicKey,
  options?: MarketCreateOptions,
): Promise<ClientResponse<CreateMarketWithOutcomesAndPriceLadderResponse>> {
  const response = new ResponseFactory({});
  const batchSize = options?.batchSize ? options.batchSize : 50;
  const outcomesBatchSize = 2;
  const confirmBatchSuccess = true;

  const createMarketResponse = await createMarket(
    program,
    marketName,
    marketType,
    marketTokenPk,
    marketLockTimestamp,
    eventAccountPk,
    options,
  );

  if (!createMarketResponse.success) {
    response.addErrors(createMarketResponse.errors);
    return response.body;
  }

  const instructionInitialiseOutcomes =
    await buildInitialiseOutcomesInstructions(
      program,
      createMarketResponse.data.marketPk,
      outcomes,
      priceLadder instanceof PublicKey ? priceLadder : undefined,
    );

  if (!instructionInitialiseOutcomes.success) {
    response.addErrors(instructionInitialiseOutcomes.errors);
    return response.body;
  }

  const signAndSendOutcomesResponse = await signAndSendInstructionsBatch(
    program,
    [
      ...instructionInitialiseOutcomes.data.instructions.map(
        (i) => i.instruction,
      ),
    ],
    {
      batchSize: outcomesBatchSize,
      confirmBatchSuccess,
      computeUnitLimit: options?.computeUnitLimit,
      computeUnitPrice: options?.computeUnitPrice,
    },
  );

  response.addResponseData({
    signatures: signAndSendOutcomesResponse.data.signatures,
    failedInstructions: signAndSendOutcomesResponse.data.failedInstructions,
  });

  if (!signAndSendOutcomesResponse.success) {
    response.addErrors(signAndSendOutcomesResponse.errors);
    return response.body;
  }

  if (
    Array.isArray(priceLadder) &&
    priceLadder.every((element) => typeof element === "number")
  ) {
    const addPriceLaddersResponse = await batchAddPricesToAllOutcomePools(
      program,
      createMarketResponse.data.marketPk,
      priceLadder,
      batchSize,
    );

    if (!addPriceLaddersResponse.success) {
      response.addErrors(addPriceLaddersResponse.errors);
    }
    response.addResponseData({
      priceLadderResults: addPriceLaddersResponse.data.results,
    });
  }

  const market = await getMarket(program, createMarketResponse.data.marketPk);

  response.addResponseData({
    marketPk: createMarketResponse.data.marketPk,
    market: market.data.account,
    tnxId: createMarketResponse.data.tnxId,
  });
  return response.body;
}

/**
 * For the given parameters, create a wagering market that accepts orders in the provided market token
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketName {string} title of the market being created
 * @param marketType {string} type of the market being created
 * @param marketTokenPk {PublicKey} publicKey of the mint token being used to place an order on a market
 * @param marketLockTimestamp {EpochTimeStamp} timestamp in seconds representing when the market can no longer accept orders
 * @param eventAccountPk {PublicKey} publicKey of the event the market is associated with
 * @param options {MarketCreateOptions} optional parameters:
 *   <ul>
 *     <li> marketTypeDiscriminator - string discriminator for the type of the market being created, e.g., relevant event period (defaults to null)</li>
 *     <li> marketTypeValue - string value for the type of the market being created, e.g., 100.5 for an over/under market type(defaults to null)</li>
 *     <li> existingMarketPk - publicKey of the market to recreate, if any (defaults to null)</li>
 *     <li> existingMarket - market account for existingMarketPk, will be fetched if not provided</li>
 *     <li> eventStartTimestamp - timestamp in seconds representing when the event starts (defaults to marketLockTimestamp)</li>
 *     <li> inplayEnabled - whether the market can accept orders after the event starts (defaults to false)</li>
 *     <li> inplayOrderDelay - number of seconds an inplay order must wait before its liquidity is added to the market and can be matched (defaults to 0)</li>
 *     <li> eventStartOrderBehaviour - protocol behaviour to perform when the event start timestamp is reached (defaults to MarketOrderBehaviour.None)</li>
 *     <li> marketLockOrderBehaviour - protocol behaviour to perform when the market lock timestamp is reached (defaults to MarketOrderBehaviour.None)</li>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 *
 *  @returns {CreateMarketResponse} containing the newly-created market account publicKey, creation transaction ID and the market account
 *
 * @example
 *
 * const name = "Full Time Result"
 * const marketType = "EventResultWinner"
 * const marketTypeDiscriminator = null;
 * const marketTypeValue = null;
 * const marketTokenPk = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
 * const marketLock = 1633042800
 * const eventAccountPk = new PublicKey('E4YEQpkedH8SbcRkN1iByoRnH8HZeBcTnqrrWkjpqLXA')
 * const newMarket = await createMarket(program, name, marketType, marketTypeDiscriminator, marketTypeValue, marketTokenPk, marketLock, eventAccountPk, outcomes)
 */
export async function createMarket(
  program: Program,
  marketName: string,
  marketType: string,
  marketTokenPk: PublicKey,
  marketLockTimestamp: EpochTimeStamp,
  eventAccountPk: PublicKey,
  options?: MarketCreateOptions,
): Promise<ClientResponse<CreateMarketResponse>> {
  const response = new ResponseFactory({});
  try {
    const instruction = await buildCreateMarketInstruction(
      program,
      marketName,
      marketType,
      marketTokenPk,
      marketLockTimestamp,
      eventAccountPk,
      options,
    );

    if (!instruction.success) {
      response.addErrors(instruction.errors);
      return response.body;
    }

    const transaction = await signAndSendInstructions(
      program,
      [instruction.data.instruction],
      {
        computeUnitLimit: options?.computeUnitLimit,
        computeUnitPrice: options?.computeUnitPrice,
      },
    );

    if (!transaction.success) {
      response.addErrors(transaction.errors);
      return response.body;
    }

    const confirm = await confirmTransaction(
      program,
      transaction.data.signature,
    );

    if (!confirm.success) {
      response.addErrors(confirm.errors);
      return response.body;
    }

    const market = await getMarket(program, instruction.data.marketPk);

    if (!market.success) {
      response.addErrors(market.errors);
    }

    response.addResponseData({
      marketPk: instruction.data.marketPk,
      tnxId: transaction.data.signature,
      market: market.data.account,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}
