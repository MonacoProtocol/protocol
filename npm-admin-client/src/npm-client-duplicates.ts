import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  GetAccount,
  MarketAccount,
} from "../types";
import { AnchorProvider } from "@project-serum/anchor";
import { Mint, getMint } from "@solana/spl-token";

// TODO remove on the next npm-client release

export enum MarketType {
  EventResultFullTime = "EventResultFullTime",
  EventResultHalfTime = "EventResultHalfTime",
  EventResultBothSidesScore = "EventResultBothSidesScore",
  EventResultWinner = "EventResultWinner",
}

/**
 * For the provided event publicKey, market type and mint publicKey return a Program Derived Address (PDA). This PDA is used for market creation.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param eventPk {PublicKey} publicKey of an event
 * @param marketType {MarketType} type of the market
 * @param mintPk {PublicKey} publicKey of the currency token
 * @returns {FindPdaResponse} publicKey (PDA) and the seed used to generate it
 *
 * @example
 *
 * const eventPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketType = "MatchResult"
 * const mintPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
 * const marketPda = await findMarketPda(program, eventPk, marketType, mintPk)
 */
export async function findMarketPda(
  program: Program,
  eventPk: PublicKey,
  marketType: MarketType,
  mintPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);

  try {
    const [pda] = await PublicKey.findProgramAddress(
      [
        eventPk.toBuffer(),
        Buffer.from(marketType.toString()),
        mintPk.toBuffer(),
      ],
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
 * For the provided market publicKey, get the market account details.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market
 * @returns {MarketAccount} market account details
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const market = await getMarket(program, marketPK)
 */
export async function getMarket(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<GetAccount<MarketAccount>>> {
  const response = new ResponseFactory({} as GetAccount<MarketAccount>);
  try {
    const market = (await program.account.market.fetch(
      marketPk,
    )) as MarketAccount;
    response.addResponseData({
      publicKey: marketPk,
      account: market,
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
