import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  GetAccount,
  MarketMatchingQueueAccount,
} from "../types";

/**
 * For the provided market publicKey, return the PDA (publicKey) of the market matching-queue account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the market matching-queue account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketMatchingQueuePk = await findMarketMatchingQueuePda(program, marketPK)
 */
export async function findMarketMatchingQueuePda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);

  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("matching"), marketPk.toBuffer()],
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
 * For the provided marketMatchingQueue publicKey, get the market matching queue account details.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketMatchingQueuePk {PublicKey} publicKey of the market matching queue
 * @returns {GetAccount<MarketMatchingQueueAccount>} market matching queue account details
 *
 * @example
 *
 * const marketMatchingQueuePk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketMatchingQueue = await getMarketMatchingQueue(program, marketMatchingQueuePk)
 */
export async function getMarketMatchingQueue(
  program: Program,
  marketMatchingQueuePk: PublicKey,
): Promise<ClientResponse<GetAccount<MarketMatchingQueueAccount>>> {
  const response = new ResponseFactory(
    {} as GetAccount<MarketMatchingQueueAccount>,
  );
  try {
    const marketMatchingQueue =
      (await program.account.marketMatchingQueue.fetch(
        marketMatchingQueuePk,
      )) as MarketMatchingQueueAccount;

    response.addResponseData({
      publicKey: marketMatchingQueuePk,
      account: marketMatchingQueue,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}
