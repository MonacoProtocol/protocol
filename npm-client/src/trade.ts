import { PublicKey } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import { Trade, TradePdaResponse } from "../types/trade";
import { ClientResponse, ResponseFactory } from "../types/client";
import { GetAccount } from "../types/get_account";

/**
 * For a given against and for order PublicKey, add a boolean indicating the for or against trade and return a Program Derived Address (PDA) and the seed used. This PDA is used for trade creation.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param againstOrderPk {PublicKey} publicKey of the against order
 * @param forOrderPk {PublicKey} publicKey of the for order
 * @param forOutcome {boolean} whether the trade is for or against
 * @returns {TradePdaResponse} publicKey (PDA) and the seed used to generate it
 *
 * @example
 *
 * const againstOrderPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const forOrderPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
 * const forOutcome = false;
 * const tradePda = await findTradePda(program, againstOrderPk, forOrderPk, forOutcome)
 */
export async function findTradePda(
  program: Program,
  againstOrderPk: PublicKey,
  forOrderPk: PublicKey,
  forOutcome: boolean,
): Promise<ClientResponse<TradePdaResponse>> {
  const response = new ResponseFactory({} as TradePdaResponse);

  try {
    const [tradePk, _] = await PublicKey.findProgramAddress(
      [
        againstOrderPk.toBuffer(),
        forOrderPk.toBuffer(),
        Buffer.from(forOutcome.toString()),
      ],
      program.programId,
    );

    response.addResponseData({
      tradePk: tradePk,
    });
  } catch (e) {
    response.addError(e);
  }

  return response.body;
}

/**
 * For the provided trade publicKey, get the trade account.
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
