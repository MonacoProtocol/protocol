import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { ClientResponse, ResponseFactory, FindPdaResponse } from "../types";

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
