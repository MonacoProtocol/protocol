import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { Trade, TradePdaResponse } from "../types/trade";
import { ClientResponse, ResponseFactory } from "../types/client";
import { GetAccount } from "../types/get_account";

/**
 * For a given order PublicKey and trade index return a Program Derived Address (PDA) and the seed used. This PDA is used for trade creation.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param orderPk {PublicKey} publicKey of the order
 * @param orderTradeIndex {number} index representing a trade count
 * @returns {TradePdaResponse} publicKey (PDA) and the seed used to generate it
 *
 * @example
 *
 * const orderPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const orderTradeIndex = 0;
 * const tradePda = await findTradePda(program, orderPk, orderTradeIndex)
 */
export async function findTradePda(
  program: Program,
  orderPk: PublicKey,
  orderTradeIndex: number,
): Promise<ClientResponse<TradePdaResponse>> {
  const response = new ResponseFactory({} as TradePdaResponse);

  try {
    const [tradePk, _] = PublicKey.findProgramAddressSync(
      [orderPk.toBuffer(), Buffer.from(orderTradeIndex.toString())],
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
