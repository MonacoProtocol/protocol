import { PublicKey } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  GetPublicKeys,
} from "../types";

/**
 * For the provided market publicKey and market outcome index, return the PDA (publicKey) of the outcome account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @param marketOutcomeIndex {number} index representing a market outcome
 * @returns {FindPdaResponse} PDA of the market outcome account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOutcomeIndex = 0
 * const marketOutcomePda = await findMarketOutcomePda(program, marketPK, marketOutcomeIndex)
 */
export async function findMarketOutcomePda(
  program: Program,
  marketPk: PublicKey,
  marketOutcomeIndex: number,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);

  try {
    const [pda, _] = await PublicKey.findProgramAddress(
      [marketPk.toBuffer(), Buffer.from(marketOutcomeIndex.toString())],
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
 * For the provided market and market outcome indexes, return the PDAs (publicKeys) of the outcome accounts.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to get market outcome accounts for
 * @param marketOutcomeIndexes {number[]} list of indexes representing market outcomes
 * @returns {GetPublicKeys}
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOutcomeIndexes = [0, 1]
 * const marketOutcomePdas = await findMarketOutcomePdas(program, marketPK, marketOutcomeIndexes)
 */
export async function findMarketOutcomePdas(
  program: Program,
  marketPk: PublicKey,
  marketOutcomeIndexes: number[],
): Promise<ClientResponse<GetPublicKeys>> {
  const response = new ResponseFactory({} as GetPublicKeys);
  try {
    const marketOutcomePDAs = await Promise.all(
      marketOutcomeIndexes.map(async function (marketOutcomeIndex) {
        return await findMarketOutcomePda(
          program,
          marketPk,
          marketOutcomeIndex,
        );
      }),
    );
    response.addResponseData({
      publicKeys: marketOutcomePDAs.map(
        (marketOutcomePdaResponse) => marketOutcomePdaResponse.data.pda,
      ),
    });
  } catch (e) {
    response.addError(e);
  }

  return response.body;
}
