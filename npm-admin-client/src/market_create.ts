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
  MarketAccount,
} from "../types";
import { findAuthorisedOperatorsAccountPda } from "./operators";
import {
  findMarketPda,
  getMarket,
  getMintInfo,
  findEscrowPda,
} from "./market_helpers";
import { initialiseOutcomes } from "./market_outcome";
import { batchAddPricesToAllOutcomePools } from "./market_outcome_prices";
import { confirmTransaction } from "./utils";
import { findMarketTypePda } from "./market_type_create";

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
 * @param options {object} optional parameters:
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
 *    </ul>
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
 * const batchSize = 100
 * const newMarket = await createMarket(program, name, marketType, marketTypeDiscriminator, marketTypeValue, marketTokenPk, marketLock, eventAccountPk, outcomes, priceLadder, batchSize)
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
  options?: {
    marketTypeDiscriminator?: string;
    marketTypeValue?: string;
    existingMarketPk?: PublicKey;
    existingMarket?: MarketAccount;
    eventStartTimestamp?: EpochTimeStamp;
    inplayEnabled?: boolean;
    inplayOrderDelay?: number;
    eventStartOrderBehaviour?: MarketOrderBehaviour;
    marketLockOrderBehaviour?: MarketOrderBehaviour;
    batchSize?: number;
  },
): Promise<ClientResponse<CreateMarketWithOutcomesAndPriceLadderResponse>> {
  const response = new ResponseFactory({});
  const batchSize = options?.batchSize ? options.batchSize : 50;

  const marketResponse = await createMarket(
    program,
    marketName,
    marketType,
    marketTokenPk,
    marketLockTimestamp,
    eventAccountPk,
    options,
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
    priceLadder instanceof Array<number>
      ? undefined
      : (priceLadder as PublicKey),
  );

  if (!initialiseOutcomePoolsResponse.success) {
    response.addErrors(initialiseOutcomePoolsResponse.errors);
    return response.body;
  }

  if (priceLadder instanceof Array<number>) {
    const addPriceLaddersResponse = await batchAddPricesToAllOutcomePools(
      program,
      marketPk,
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

  const market = await getMarket(program, marketPk);

  response.addResponseData({
    marketPk: marketPk,
    market: market.data.account,
    tnxId: marketResponse.data.tnxId,
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
 * @param options {object} optional parameters:
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
 *    </ul>
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
  options?: {
    marketTypeDiscriminator?: string;
    marketTypeValue?: string;
    existingMarketPk?: PublicKey;
    existingMarket?: MarketAccount;
    eventStartTimestamp?: EpochTimeStamp;
    inplayEnabled?: boolean;
    inplayOrderDelay?: number;
    eventStartOrderBehaviour?: MarketOrderBehaviour;
    marketLockOrderBehaviour?: MarketOrderBehaviour;
  },
): Promise<ClientResponse<CreateMarketResponse>> {
  const response = new ResponseFactory({});

  /* eslint-disable */
  // prettier-ignore-start
  const marketTypeDiscriminator = options?.marketTypeDiscriminator
    ? options.marketTypeDiscriminator
    : null;
  const marketTypeValue = options?.marketTypeValue
    ? options.marketTypeValue
    : null;
  const existingMarketPk = options?.existingMarketPk
    ? options.existingMarketPk
    : null;
  const eventStartTimestamp = options?.eventStartTimestamp
    ? options.eventStartTimestamp
    : marketLockTimestamp;
  const inplayEnabled = options?.inplayEnabled ? options.inplayEnabled : false;
  const inplayOrderDelay = options?.inplayOrderDelay
    ? options.inplayOrderDelay
    : 0;
  const eventStartOrderBehaviour = options?.eventStartOrderBehaviour
    ? options.eventStartOrderBehaviour
    : MarketOrderBehaviourValue.none;
  const marketLockOrderBehaviour = options?.marketLockOrderBehaviour
    ? options.marketLockOrderBehaviour
    : MarketOrderBehaviourValue.none;
  // prettier-ignore-end
  /* eslint-enable */

  const provider = program.provider as AnchorProvider;
  const mintDecimalOffset = 3;

  const marketTypePk = findMarketTypePda(program, marketType).data.pda;

  let version = 0;
  if (existingMarketPk) {
    let existingMarket = options?.existingMarket;
    if (!existingMarket) {
      const existingMarketResponse = await getMarket(program, existingMarketPk);
      if (!existingMarketResponse.success) {
        response.addErrors(existingMarketResponse.errors);
        return response.body;
      }
      existingMarket = existingMarketResponse.data.account;
    }
    version = existingMarket.version + 1;
  }

  const marketPda = (
    await findMarketPda(
      program,
      eventAccountPk,
      marketTypePk,
      marketTypeDiscriminator,
      marketTypeValue,
      marketTokenPk,
      version,
    )
  ).data.pda;

  const [escrowPda, authorisedOperators, mintInfo] = await Promise.all([
    findEscrowPda(program, marketPda),
    findAuthorisedOperatorsAccountPda(program, Operator.MARKET),
    getMintInfo(program, marketTokenPk),
  ]);

  try {
    const tnxId = await program.methods
      .createMarket(
        eventAccountPk,
        marketTypeDiscriminator,
        marketTypeValue,
        marketName,
        mintInfo.data.decimals - mintDecimalOffset,
        new BN(marketLockTimestamp),
        new BN(eventStartTimestamp),
        inplayEnabled,
        inplayOrderDelay,
        eventStartOrderBehaviour,
        marketLockOrderBehaviour,
      )
      .accounts({
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        existingMarket: existingMarketPk,
        market: marketPda,
        marketType: marketTypePk,
        escrow: escrowPda.data.pda,

        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,

        rent: web3.SYSVAR_RENT_PUBKEY,
        mint: marketTokenPk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
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
