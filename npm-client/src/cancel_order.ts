import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getCancellableOrdersByMarketForProviderWallet } from "./order_query";
import { findEscrowPda } from "./utils";
import { getOrder } from "./order";
import { getMarket } from "./markets";
import { getWalletTokenAccount } from "../src/wallet_tokens";
import {
  ClientResponse,
  ResponseFactory,
  CancelOrderResponse,
  CancelOrdersResponse,
} from "../types";
import { findMarketPositionPda } from "./market_position";
import { findMarketMatchingPoolPda } from "./market_matching_pools";
import { NoCancellableOrdersFound } from "../types";

/**
 * For the provided order publicKey, cancel the order if the program provider owns the order.Orders can be cancelled if they:
 *
 * - Have the status of OrderStatus.OPEN
 * - Are partially matched (only unmatched stake will be cancelled)
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param orderPk {PublicKey} publicKey of the order to cancel
 * @returns {CancelOrderResponse} the provided order publicKey and the transactionId for the request, this ID can be used to confirm the success of the transaction
 *
 * @example
 *
 * const orderPk = new PublicKey('Fy7WiqBy6MuWfnVjiPE8HQqkeLnyaLwBsk8cyyJ5WD8X')
 * const cancelledOrder = await cancelOrder(program, orderPk)
 */
export async function cancelOrder(
  program: Program,
  orderPk: PublicKey,
): Promise<ClientResponse<CancelOrderResponse>> {
  const response = new ResponseFactory({} as CancelOrderResponse);

  const provider = program.provider as AnchorProvider;
  const orderResponse = await getOrder(program, orderPk);
  const order = orderResponse.data.account;

  const marketResponse = await getMarket(program, order.market);
  const market = marketResponse.data.account;
  const marketTokenPk = new PublicKey(market.mintAccount);

  const [
    marketPositionPda,
    marketMatchingPool,
    escrowPda,
    purchaserTokenAccount,
  ] = await Promise.all([
    findMarketPositionPda(program, order.market, provider.wallet.publicKey),
    findMarketMatchingPoolPda(
      program,
      order.market,
      order.marketOutcomeIndex,
      order.expectedPrice,
      order.forOutcome,
    ),
    findEscrowPda(program, order.market),
    getWalletTokenAccount(program, marketTokenPk),
  ]);

  const tnxID = await program.methods
    .cancelOrder()
    .accounts({
      order: orderPk,
      marketPosition: marketPositionPda.data.pda,
      purchaser: provider.wallet.publicKey,
      purchaserTokenAccount: purchaserTokenAccount.data.associatedTokenAccount,
      marketMatchingPool: marketMatchingPool.data.pda,
      market: order.market,
      marketEscrow: escrowPda.data.pda,
      mint: market.mintAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc()
    .catch((e) => {
      response.addError(e);
    });

  response.addResponseData({
    orderPk: orderPk,
    tnxID: tnxID,
  });
  return response.body;
}

/**
 * For the provided market publicKey, attempt to cancel all cancellable orders owned by the program provider wallet. Orders can be cancelled if they:
 *
 * - Have the status of OrderStatus.OPEN
 * - Are partially matched (only unmatched stake will be cancelled)
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {CancelOrdersResponse} list of all the successfully submitted transactionIDs, list of all the failed-to-cancel order publicKeys
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const cancelledOrders = await cancelOrdersForMarket(program, marketPk)
 */
export async function cancelOrdersForMarket(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<CancelOrdersResponse>> {
  const response = new ResponseFactory({} as CancelOrdersResponse);

  const provider = program.provider as AnchorProvider;
  const marketResponse = await getMarket(program, marketPk);
  const market = marketResponse.data.account;
  const marketTokenPk = new PublicKey(market.mintAccount);

  const [marketPositionPda, escrowPda, purchaserTokenAccount, ordersResponse] =
    await Promise.all([
      findMarketPositionPda(program, marketPk, provider.wallet.publicKey),
      findEscrowPda(program, marketPk),
      getWalletTokenAccount(program, marketTokenPk),
      getCancellableOrdersByMarketForProviderWallet(program, marketPk),
    ]);

  const orders = ordersResponse.data.orderAccounts;

  if (orders.length < 1) {
    response.addError(NoCancellableOrdersFound);
    return response.body;
  }

  const results = await Promise.all(
    orders.map(async (order) => {
      const marketMatchingPool = await findMarketMatchingPoolPda(
        program,
        order.account.market,
        order.account.marketOutcomeIndex,
        order.account.expectedPrice,
        order.account.forOutcome,
      );
      try {
        const tnxID = await program.methods
          .cancelOrder()
          .accounts({
            order: order.publicKey,
            marketPosition: marketPositionPda.data.pda,
            purchaser: provider.wallet.publicKey,
            purchaserTokenAccount:
              purchaserTokenAccount.data.associatedTokenAccount,
            marketMatchingPool: marketMatchingPool.data.pda,
            market: order.account.market,
            marketEscrow: escrowPda.data.pda,
            mint: market.mintAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        return tnxID;
      } catch (e) {
        response.addError(e);
        return order.publicKey;
      }
    }),
  );

  const tnxIDs = results.filter(function (value) {
    return typeof value === "string";
  }) as string[];
  const failedCancellationOrders = results.filter(function (value) {
    return value instanceof PublicKey;
  }) as PublicKey[];

  response.addResponseData({
    failedCancellationOrders: failedCancellationOrders,
    tnxIDs: tnxIDs,
  });
  return response.body;
}
