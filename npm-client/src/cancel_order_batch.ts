import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
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
  BatchCancelOrdersResponse,
} from "../types";
import { findMarketPositionPda } from "./market_position";
import { findMarketMatchingPoolPda } from "./market_matching_pools";
import { NoCancellableOrdersFound } from "../types";


/**
 * Prepare a transaction instruction for a single order
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param orderPk {PublicKey} account public key of the order to cancel
 * @returns {TransactionInstruction} prepared transaction instruction 
 */
async function prepareCancelOrderTransactionInstruction(
  program: Program,
  orderPk: PublicKey,
): Promise<TransactionInstruction> {
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
  
  
  const instruction = await program.methods
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
    }).instruction()

  return instruction;
}

export async function batchCancelOrders(
  program: Program,
  orderPks: PublicKey[]
): Promise<ClientResponse<BatchCancelOrdersResponse>> {
  const provider = program.provider as AnchorProvider;
  
  const response = new ResponseFactory({} as BatchCancelOrdersResponse);

  const tnxID = await Promise.all(
    orderPks.map((orderPk) => prepareCancelOrderTransactionInstruction(program, orderPk))
  ).then(
    async (instructions) => {    
      const tnx = new Transaction();
      tnx.add(...instructions);
      return await provider.sendAndConfirm(tnx, undefined, {commitment: "confirmed"})    }
  ).catch((e) => {
    response.addError(e);
  });

  response.addResponseData({
    orderPks: orderPks,
    tnxID: tnxID,
  });

  return response.body;
}