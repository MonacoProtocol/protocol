import { PublicKey, SystemProgram, Keypair, TransactionInstruction, Transaction } from "@solana/web3.js";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getMarketAccounts, uiStakeToInteger } from "./utils";
import { getWalletTokenAccount } from "../src/wallet_tokens";
import { ClientResponse, CreateOrderResponse, BatchCreateOrdersResponse, ResponseFactory } from "../types";
import { findOrderPda } from "./order";

export type CreateOrderParams = {
  marketPk: PublicKey; // publicKey of the market to create the order for
  marketOutcomeIndex: number; // index of the chosen outcome
  forOutcome: boolean; // whether the order is for or against the outcome
  price: number; // price at which the order should be created, the price should be present on the outcome pool for the market
  stake: BN; // raw token value of the order taking into account the decimal amount of the token associated with the market
  productPk?: PublicKey; // Optional: publicKey of product account this order was created on
}


/**
 * Prepare a transaction instruction for a single order
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param createOrderParams {CreateOrderParams} 
 * @returns {[TransactionInstruction, PublicKey]} prepared transaction instruction and corresponding order account key
 */
async function prepareCreateOrderTransactionInstruction(
  program: Program,
  createOrderParams: CreateOrderParams,
): Promise<[TransactionInstruction, PublicKey]> {
  const marketPk = new PublicKey(createOrderParams.marketPk);
  const provider = program.provider as AnchorProvider;
  const MarketAccounts = await getMarketAccounts(
    program,
    marketPk,
    createOrderParams.forOutcome,
    createOrderParams.marketOutcomeIndex,
    createOrderParams.price,
  );

  const marketTokenPk = new PublicKey(MarketAccounts.data.market.mintAccount);

  const [purchaserTokenAccount, orderPdaResponse] = await Promise.all([
    getWalletTokenAccount(program, marketTokenPk),
    findOrderPda(program, marketPk, provider.wallet.publicKey),
  ]);

  const orderPk = orderPdaResponse.data.orderPk;
  const distinctSeed = orderPdaResponse.data.distinctSeed;
  const productPk = createOrderParams.productPk ? new PublicKey(createOrderParams.productPk) : undefined;
  const instruction = await program.methods
    .createOrderV2(distinctSeed, {
      marketOutcomeIndex: createOrderParams.marketOutcomeIndex,
      forOutcome: createOrderParams.forOutcome,
      stake: createOrderParams.stake,
      price: createOrderParams.price,
    })
    .accounts({
      purchaser: provider.wallet.publicKey,
      order: orderPk,
      marketPosition: MarketAccounts.data.marketPositionPda,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      market: marketPk,
      marketMatchingPool: MarketAccounts.data.marketOutcomePoolPda,
      marketOutcome: MarketAccounts.data.marketOutcomePda,
      purchaserToken: purchaserTokenAccount.data.associatedTokenAccount,
      marketEscrow: MarketAccounts.data.escrowPda,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      product: productPk == undefined ? null : productPk,
    })
    .signers(provider.wallet instanceof Keypair ? [provider.wallet] : [])
    .instruction();
  return [instruction, orderPk];
}


/**
 * Create multiple order accounts (in a single transaction) on the Monaco protocol using the raw token value for the order stake 
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param createOrdersParams {CreateOrderParams[]} 
 * @returns {CreateOrderResponse}  derived order publicKey and transactionID for the request, this ID should be used to confirm the success of the transaction
 */
export async function batchCreateOrders(
  program: Program,
  createOrdersParams: CreateOrderParams[]
): Promise<ClientResponse<BatchCreateOrdersResponse>> {
  const provider = program.provider as AnchorProvider;
  
  const response = new ResponseFactory({} as CreateOrderResponse);

  const instructionsAndOrderKeys = await Promise.all(
    createOrdersParams.map(
      (createOrderParams) => prepareCreateOrderTransactionInstruction(program, createOrderParams)
    )
  );
  const tnx = new Transaction();
  tnx.add(...instructionsAndOrderKeys.map(([instruction, _]) => instruction));
  const tnxID = await provider.sendAndConfirm(tnx, undefined, {commitment: "confirmed"}).catch((e) => {
      response.addError(e);
    });

  response.addResponseData({
    orderPks: instructionsAndOrderKeys.map(([_, key]) => key),
    tnxID: tnxID,
  });

  return response.body;
}
