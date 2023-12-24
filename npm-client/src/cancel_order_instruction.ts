import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { findEscrowPda } from "./utils";
import { getOrder } from "./order";
import { getMarket } from "./markets";
import { getWalletTokenAccount } from "./wallet_tokens";
import {
  ClientResponse,
  ResponseFactory,
  OrderInstructionResponse,
  OrderInstructionsResponse,
  NoCancellableOrdersFound,
} from "../types";
import { findMarketPositionPda } from "./market_position";
import { findMarketMatchingPoolPda } from "./market_matching_pools";
import { getCancellableOrdersByMarketForProviderWallet } from "./order_query";

/**
 * Constructs the instruction required to perform a cancel order transaction.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param orderPk {PublicKey} publicKey of the order to cancel
 * @param mintPk {PublicKey} Optional: publicKey of the mint account used for market entry (e.g. USDT), if not provided the market token account will be fetched from the market
 * @returns {OrderInstructionResponse} provided order publicKey and the instruction to perform a cancel order transaction
 *
 * @example
 *
 * const orderPk = new PublicKey('Fy7WiqBy6MuWfnVjiPE8HQqkeLnyaLwBsk8cyyJ5WD8X')
 * const instruction = await buildCancelOrderInstruction(program, orderPk)
 */
export async function buildCancelOrderInstruction(
  program: Program,
  orderPk: PublicKey,
  mintPk?: PublicKey,
): Promise<ClientResponse<OrderInstructionResponse>> {
  const response = new ResponseFactory({} as OrderInstructionResponse);
  const provider = program.provider as AnchorProvider;

  const orderResponse = await getOrder(program, orderPk);

  if (!orderResponse.success) {
    response.addErrors(orderResponse.errors);
    return response.body;
  }

  const order = orderResponse.data.account;

  if (!mintPk) {
    const marketResponse = await getMarket(program, order.market);
    if (!marketResponse.success) {
      response.addErrors(marketResponse.errors);
      return response.body;
    }
    const market = marketResponse.data.account;
    mintPk = new PublicKey(market.mintAccount);
  }

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
    getWalletTokenAccount(program, mintPk),
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
      mint: mintPk,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  response.addResponseData({ orderPk, instruction });
  return response.body;
}

/**
 * Constructs the instructions required to cancel all cancellable orders on the provided market.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {OrderInstructionsResponse} List of provided order publicKeys and the associated instruction to perform a cancel order transaction for that order
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const orderInstructions = await buildCancelOrdersForMarketInstructions(program, marketPk)
 */
export async function buildCancelOrdersForMarketInstructions(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<OrderInstructionsResponse>> {
  const response = new ResponseFactory({});

  const provider = program.provider as AnchorProvider;
  const marketResponse = await getMarket(program, marketPk);

  if (!marketResponse.success) {
    response.addErrors(marketResponse.errors);
    return response.body;
  }

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

  const instructions = await Promise.all(
    orders.map(async (order) => {
      const orderPk = order.publicKey;
      const marketMatchingPool = await findMarketMatchingPoolPda(
        program,
        order.account.market,
        order.account.marketOutcomeIndex,
        order.account.expectedPrice,
        order.account.forOutcome,
      );
      const instruction = await program.methods
        .cancelOrder()
        .accounts({
          order: orderPk,
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
        .instruction();
      return { orderPk, instruction };
    }),
  );

  response.addResponseData({ orderInstructions: instructions });
  return response.body;
}
