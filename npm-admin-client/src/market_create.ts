import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Program, web3, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  Operator,
  CreateMarketResponse,
  CreateMarketWithOutcomesAndPriceLadderResponse,
  ClientResponse,
  ResponseFactory,
  EpochTimeStamp,
  MarketOrderBehaviour,
  MarketOrderBehaviourValue,
} from "../types";
import { findAuthorisedOperatorsAccountPda } from "./operators";
import {
  findMarketPda,
  MarketType,
  getMarket,
  getMintInfo,
  findEscrowPda,
  findMarketCommissionQueuePda,
} from "./market_helpers";
import { initialiseOutcomes } from "./market_outcome";
import { batchAddPricesToAllOutcomePools } from "./market_outcome_prices";
import { confirmTransaction } from "./utils";

/**
 * For the given parameters:
 *
 * - Create a wagering market that accepts orders in the provided market token
 * - Create outcome accounts for the provided outcomes
 * - Applies the given priceLadder to all outcomes in batches
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketName {string} title of the market being created
 * @param marketType {MarketType} type of the market being created
 * @param marketTokenPk {PublicKey} publicKey of the mint token being used to place an order on a market
 * @param marketLockTimestamp {EpochTimeStamp} timestamp in seconds representing when the market can no longer accept orders
 * @param eventAccountPk {PublicKey} publicKey of the event the market is associated with
 * @param outcomes {string[]} list of possible outcomes for the market
 * @param priceLadder {number[]} array of price points to add to the outcome
 * @param eventStartTimestamp {EpochTimeStamp} timestamp in seconds representing when the event starts (defaults to marketLockTimestamp)
 * @param inplayEnabled {boolean} whether the market can accept orders after the event starts (defaults to false)
 * @param inplayOrderDelay {number} number of seconds an inplay order must wait before its liquidity is added to the market and can be matched (defaults to 0)
 * @param eventStartOrderBehaviour {MarketOrderBehaviour} protocol behaviour to perform when the event start timestamp is reached (defaults to MarketOrderBehaviour.None)
 * @param marketLockOrderBehaviour {MarketOrderBehaviour} protocol behaviour to perform when the market lock timestamp is reached (defaults to MarketOrderBehaviour.None)
 * @param batchSize {number} number of prices to add in a single request
 * @returns {CreateMarketWithOutcomesAndPriceLadderResponse} containing the newly-created market account publicKey, creation transaction ID, the market account and the results of the batched requests to add prices to the outcome accounts
 *
 * @example
 *
 * const name = "Full Time Result"
 * const type = MarketType.EventResultWinner
 * const marketTokenPk = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
 * const marketLock = 1633042800
 * const eventAccountPk = new PublicKey('E4YEQpkedH8SbcRkN1iByoRnH8HZeBcTnqrrWkjpqLXA')
 * const outcomes = ["Red", "Draw", "Blue"]
 * const priceLadder = DEFAULT_PRICE_LADDER
 * const batchSize = 100
 * const newMarket = await createMarket(program, name, type, marketTokenPk, marketLock, eventAccountPk, outcomes, priceLadder, batchSize)
 */
export async function createMarketWithOutcomesAndPriceLadder(
  program: Program,
  marketName: string,
  marketType: MarketType,
  marketTokenPk: PublicKey,
  marketLockTimestamp: EpochTimeStamp,
  eventAccountPk: PublicKey,
  outcomes: string[],
  priceLadder: number[],
  eventStartTimestamp: EpochTimeStamp = marketLockTimestamp,
  inplayEnabled = false,
  inplayOrderDelay = 0,
  eventStartOrderBehaviour: MarketOrderBehaviour = MarketOrderBehaviourValue.none,
  marketLockOrderBehaviour: MarketOrderBehaviour = MarketOrderBehaviourValue.none,
  batchSize = 50,
): Promise<ClientResponse<CreateMarketWithOutcomesAndPriceLadderResponse>> {
  const response = new ResponseFactory({});

  const marketResponse = await createMarket(
    program,
    marketName,
    marketType,
    marketTokenPk,
    marketLockTimestamp,
    eventAccountPk,
    eventStartTimestamp,
    inplayEnabled,
    inplayOrderDelay,
    eventStartOrderBehaviour,
    marketLockOrderBehaviour,
  );

  if (!marketResponse.success) {
    response.addErrors(marketResponse.errors);
    return response.body;
  }

  const marketPk = marketResponse.data.marketPk;

  const initialiseOutcomePoolsResponse = await initialiseOutcomes(
    program,
    marketPk,
    outcomes,
  );

  if (!initialiseOutcomePoolsResponse.success) {
    response.addErrors(initialiseOutcomePoolsResponse.errors);
    return response.body;
  }

  const addPriceLaddersResponse = await batchAddPricesToAllOutcomePools(
    program,
    marketPk,
    priceLadder,
    batchSize,
  );

  if (!addPriceLaddersResponse.success) {
    response.addErrors(addPriceLaddersResponse.errors);
  }

  const market = await getMarket(program, marketPk);

  response.addResponseData({
    marketPk: marketPk,
    market: market.data.account,
    tnxId: marketResponse.data.tnxId,
    priceLadderResults: addPriceLaddersResponse.data.results,
  });
  return response.body;
}

/**
 * For the given parameters, create a wagering market that accepts orders in the provided market token
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketName {string} title of the market being created
 * @param marketType {MarketType} type of the market being created
 * @param marketTokenPk {PublicKey} publicKey of the mint token being used to place an order on a market
 * @param marketLockTimestamp {EpochTimeStamp} timestamp in seconds representing when the market can no longer accept orders
 * @param eventAccountPk {PublicKey} publicKey of the event the market is associated with
 * @param eventStartTimestamp {EpochTimeStamp} timestamp in seconds representing when the event starts (defaults to marketLockTimestamp)
 * @param inplayEnabled {boolean} whether the market can accept orders after the event starts (defaults to false)
 * @param inplayOrderDelay {number} number of seconds an inplay order must wait before its liquidity is added to the market and can be matched (defaults to 0)
 * @param eventStartOrderBehaviour {MarketOrderBehaviour} protocol behaviour to perform when the event start timestamp is reached (defaults to MarketOrderBehaviour.None)
 * @param marketLockOrderBehaviour {MarketOrderBehaviour} protocol behaviour to perform when the market lock timestamp is reached (defaults to MarketOrderBehaviour.None)
 * @returns {CreateMarketResponse} containing the newly-created market account publicKey, creation transaction ID and the market account
 *
 * @example
 *
 * const name = "Full Time Result"
 * const type = MarketType.EventResultWinner
 * const marketTokenPk = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
 * const marketLock = 1633042800
 * const eventAccountPk = new PublicKey('E4YEQpkedH8SbcRkN1iByoRnH8HZeBcTnqrrWkjpqLXA')
 * const newMarket = await createMarket(program, name, type, marketTokenPk, marketLock, eventAccountPk, outcomes)
 */
export async function createMarket(
  program: Program,
  marketName: string,
  marketType: MarketType,
  marketTokenPk: PublicKey,
  marketLockTimestamp: EpochTimeStamp,
  eventAccountPk: PublicKey,
  eventStartTimestamp: EpochTimeStamp = marketLockTimestamp,
  inplayEnabled = false,
  inplayOrderDelay = 0,
  eventStartOrderBehaviour: MarketOrderBehaviour = MarketOrderBehaviourValue.none,
  marketLockOrderBehaviour: MarketOrderBehaviour = MarketOrderBehaviourValue.none,
): Promise<ClientResponse<CreateMarketResponse>> {
  const response = new ResponseFactory({});
  const provider = program.provider as AnchorProvider;
  const mintDecimalOffset = 3;

  const marketPda = (
    await findMarketPda(program, eventAccountPk, marketType, marketTokenPk)
  ).data.pda;

  const [escrowPda, authorisedOperators, mintInfo, paymentsQueuePda] =
    await Promise.all([
      findEscrowPda(program, marketPda),
      findAuthorisedOperatorsAccountPda(program, Operator.MARKET),
      getMintInfo(program, marketTokenPk),
      findMarketCommissionQueuePda(program, marketPda),
    ]);

  try {
    const tnxId = await program.methods
      .createMarketV2(
        eventAccountPk,
        marketType,
        marketName,
        new BN(marketLockTimestamp),
        mintInfo.data.decimals - mintDecimalOffset,
        new BN(eventStartTimestamp),
        inplayEnabled,
        inplayOrderDelay,
        eventStartOrderBehaviour,
        marketLockOrderBehaviour,
      )
      .accounts({
        market: marketPda,
        systemProgram: SystemProgram.programId,
        escrow: escrowPda.data.pda,
        mint: marketTokenPk,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
        commissionPaymentQueue: paymentsQueuePda.data.pda,
      })
      .rpc();

    await confirmTransaction(program, tnxId);
    const market = await getMarket(program, marketPda);

    response.addResponseData({
      marketPk: marketPda,
      tnxId: tnxId,
      market: market.data.account,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}
