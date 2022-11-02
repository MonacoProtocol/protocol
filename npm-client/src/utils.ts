import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN, Program } from "@project-serum/anchor";
import { Mint, getMint } from "@solana/spl-token";
import { getMarket } from "./markets";
import { findMarketPositionPda } from "./market_position";
import { findMarketMatchingPoolPda } from "./market_matching_pools";
import { findMarketOutcomePda } from "./market_outcomes";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  StakeInteger,
} from "../types";
import { MarketAccountsForCreateOrder } from "../types";

/**
 * For the provided market, outcome, price and forOutcome condition - return all the necessary PDAs and account information required for order creation.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @param forOutcome {boolean} bool representing for or against a market outcome
 * @param marketOutcomeIndex {number} index representing the chosen outcome of a market
 * @param price {number} price for order
 * @returns {PublicKey, MarketAccount} publicKey PDAs for the escrow, marketOutcome, outcomePool and marketPosition accounts as well as the full marketAccount.
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const forOutcome = true
 * const marketOutcomeIndex = 0
 * const price = 5.9
 * const marketAccounts = await getMarketAccounts(program, marketPK, forOutcome, marketOutcomeIndex, price)
 */
export async function getMarketAccounts(
  program: Program,
  marketPk: PublicKey,
  forOutcome: boolean,
  marketOutcomeIndex: number,
  price: number,
): Promise<ClientResponse<MarketAccountsForCreateOrder>> {
  const response = new ResponseFactory({} as MarketAccountsForCreateOrder);
  const market = await getMarket(program, marketPk);

  if (!market.success) {
    response.addErrors(market.errors);
    return response.body;
  }

  const provider = program.provider as AnchorProvider;

  const [marketOutcomePda, marketOutcomePoolPda, marketPositionPda, escrowPda] =
    await Promise.all([
      findMarketOutcomePda(program, marketPk, marketOutcomeIndex),
      findMarketMatchingPoolPda(
        program,
        marketPk,
        marketOutcomeIndex,
        price,
        forOutcome,
      ),
      findMarketPositionPda(program, marketPk, provider.wallet.publicKey),
      findEscrowPda(program, marketPk),
    ]);

  const responseData = {
    escrowPda: escrowPda.data.pda,
    marketOutcomePda: marketOutcomePda.data.pda,
    marketOutcomePoolPda: marketOutcomePoolPda.data.pda,
    marketPositionPda: marketPositionPda.data.pda,
    market: market.data.account,
  };

  response.addResponseData(responseData);

  return response.body;
}

/**
 * For the provided stake and market, get a BN representation of the stake adjusted for the decimals on that markets token.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param stake {number} ui stake amount, i.e. how many tokens a wallet wishes to stake on an outcome
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {BN} ui stake adjusted for the market token decimal places
 *
 * @example
 *
 * const uiStake = await uiStakeToInteger(20, new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D'), program)
 * // returns 20,000,000,000 represented as a BN for a token with 9 decimals
 */
export async function uiStakeToInteger(
  program: Program,
  stake: number,
  marketPk: PublicKey,
): Promise<ClientResponse<StakeInteger>> {
  const response = new ResponseFactory({});
  const market = await getMarket(program, marketPk);

  if (!market.success) {
    response.addErrors(market.errors);
    return response.body;
  }

  const marketTokenPk = new PublicKey(market.data.account.mintAccount);
  const mintInfo = await getMintInfo(program, marketTokenPk);

  if (!mintInfo.success) {
    response.addErrors(mintInfo.errors);
    return response.body;
  }

  const stakeInteger = new BN(stake * 10 ** mintInfo.data.decimals);
  response.addResponseData({
    stakeInteger: stakeInteger,
  });
  return response.body;
}

/**
 * For the provided market publicKey, return the escrow account PDA (publicKey) for that market.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the escrow account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const escrowPda = await findEscrowPda(program, marketPK)
 */
export async function findEscrowPda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  try {
    const [pda, _] = await PublicKey.findProgramAddress(
      [Buffer.from("escrow"), marketPk.toBuffer()],
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
 * For the provided spl-token, get the mint info for that token.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param mintPK {PublicKey} publicKey of an spl-token
 * @returns {MintInfo} mint information including mint authority and decimals
 *
 * @example
 *
 * const mintPk = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
 * const getMintInfo = await findEscrowPda(program, mintPk)
 */
export async function getMintInfo(
  program: Program,
  mintPK: PublicKey,
): Promise<ClientResponse<Mint>> {
  const response = new ResponseFactory({} as Mint);

  const provider = program.provider as AnchorProvider;
  try {
    const mintInfo = await getMint(provider.connection, mintPK);
    response.addResponseData(mintInfo);
  } catch (e) {
    response.addError(e);
  }

  return response.body;
}
