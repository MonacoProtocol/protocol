import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  ClientResponse,
  GetAccount,
  ResponseFactory,
  Trade,
  TradePdaResponse,
} from "../types";
import { randomSeed16 } from "./utils";

/**
 * For a given order PublicKey return a Program Derived Address (PDA) and the seed used. If a seed override is provided, it will be used instead of generating a new one. This PDA can be used for trade creation.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param orderPk {PublicKey} publicKey of the order
 * @param existingTradeSeed {Uint8Array} (optional) distinctSeed of an existing trade
 * @returns {TradePdaResponse} publicKey (PDA) and the seed used to generate it
 *
 * @example
 *
 * const orderPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const tradePda = await findTradePda(program, orderPk)
 *
 * @example
 *
 * const orderPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const existingTradeSeed = Buffer.from("seed")
 * const tradePda = await findTradePda(program, orderPk, existingTradeSeed)
 */
export async function findTradePda(
  program: Program,
  orderPk: PublicKey,
  existingTradeSeed?: Uint8Array,
): Promise<ClientResponse<TradePdaResponse>> {
  const response = new ResponseFactory({} as TradePdaResponse);

  const distinctSeed = existingTradeSeed ? existingTradeSeed : randomSeed16();

  try {
    const [tradePk, _] = PublicKey.findProgramAddressSync(
      [orderPk.toBuffer(), distinctSeed],
      program.programId,
    );

    response.addResponseData({
      tradePk: tradePk,
      distinctSeed: distinctSeed,
    });
  } catch (e) {
    response.addError(e);
  }

  return response.body;
}

/**
 * For the provided trade PublicKey, get the trade account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param tradePk {PublicKey} publicKey of a trade
 * @returns {Trade} trade account details
 *
 * @example
 *
 * const tradePk = new PublicKey('Fy7WiqBy6MuWfnVjiPE8HQqkeLnyaLwBsk8cyyJ5WD8X')
 * const trade = await getTrade(program, tradePk)
 */
export async function getTrade(
  program: Program,
  tradePk: PublicKey,
): Promise<ClientResponse<GetAccount<Trade>>> {
  const response = new ResponseFactory({} as GetAccount<Trade>);
  try {
    const trade = (await program.account.trade.fetch(tradePk)) as Trade;
    response.addResponseData({
      publicKey: tradePk,
      account: trade,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}
