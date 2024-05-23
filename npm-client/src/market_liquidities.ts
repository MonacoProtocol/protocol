import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  GetAccount,
  MarketLiquidities,
} from "../types";

/**
 * For the provided market publicKey, return the PDA (publicKey) of the market liquidities account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the market matching-queue account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketLiquiditiesPk = await findMarketLiquiditiesPda(program, marketPK)
 */
export async function findMarketLiquiditiesPda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);

  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("liquidities"), marketPk.toBuffer()],
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
 * For the provided market-liquidities publicKey, return the market-liquidities account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketLiquiditiesPk {PublicKey} publicKey of the market-liquidities
 * @returns {MarketLiquidities} market-liquidities account info
 *
 * @example
 *
 * const marketLiquiditiesPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketLiquidities = await getMarketLiquidities(program, marketLiquiditiesPk)
 */
export async function getMarketLiquidities(
  program: Program,
  marketLiquiditiesPk: PublicKey,
): Promise<ClientResponse<GetAccount<MarketLiquidities>>> {
  const response = new ResponseFactory({} as GetAccount<MarketLiquidities>);
  try {
    const marketLiquidities = (await program.account.marketLiquidities.fetch(
      marketLiquiditiesPk,
    )) as MarketLiquidities;

    response.addResponseData({
      publicKey: marketLiquiditiesPk,
      account: marketLiquidities,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}
