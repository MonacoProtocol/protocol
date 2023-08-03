import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  ClientResponse,
  FindPdaResponse,
  ResponseFactory,
} from "@monaco-protocol/client";

export enum MarketType {
  EventResultFullTime = "EventResultFullTime",
  EventResultHalfTime = "EventResultHalfTime",
  EventResultBothSidesScore = "EventResultBothSidesScore",
  EventResultWinner = "EventResultWinner",
}

/**
 * For the provided market publicKey, return the commission payments queue account PDA (publicKey) for that market.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the payment queue
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const commissionPaymentsQueuePda = await findCommissionPaymentsQueuePda(program, marketPK)
 */
export async function findCommissionPaymentsQueuePda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  try {
    const [pda, _] = await PublicKey.findProgramAddress(
      [Buffer.from("commission_payments"), marketPk.toBuffer()],
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
