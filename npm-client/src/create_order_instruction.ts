import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getMarketAccounts, uiStakeToInteger } from "./utils";
import { getWalletTokenAccount } from "./wallet_tokens";
import {
  OrderInstructionResponse,
  ClientResponse,
  ResponseFactory,
} from "../types";
import { findOrderPda } from "./order";

/**
 * Constructs the instruction required to perform a create order transaction using a UI stake value, the client calculates the actual stake value based on mintInfo.data.decimals using uiStakeToInteger().
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to create the order for
 * @param marketOutcomeIndex {number} index of the chosen outcome
 * @param forOutcome  {boolean} whether the order is for or against the outcome
 * @param price  {number} price at which the order should be created, the price should be present on the outcome pool for the market
 * @param stake  {number} UI value of the stake, the function will determine the raw value based on the market token type
 * @param productPk {PublicKey} Optional: publicKey of product account this order was created on
 * @returns {OrderInstructionResponse}  derived order publicKey and the instruction to perform a create order transaction
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOutcomeIndex = 0
 * const forOutcome = true
 * const price = 1.5
 * const stake = 20,000,000,000
 * const productPk = new PublicKey('betDexExcHangeZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const instruction = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
 */
export async function buildOrderInstructionUIStake(
  program: Program,
  marketPk: PublicKey,
  marketOutcomeIndex: number,
  forOutcome: boolean,
  price: number,
  stake: number,
  productPk?: PublicKey,
): Promise<ClientResponse<OrderInstructionResponse>> {
  const stakeInteger = await uiStakeToInteger(program, stake, marketPk);
  return await buildOrderInstruction(
    program,
    marketPk,
    marketOutcomeIndex,
    forOutcome,
    price,
    stakeInteger.data.stakeInteger,
    productPk,
  );
}

/**
 * Constructs the instruction required to perform a create order transaction using the raw token value for the order stake.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to create the order for
 * @param marketOutcomeIndex {number} index of the chosen outcome
 * @param forOutcome  {boolean} whether the order is for or against the outcome
 * @param price  {number} price at which the order should be created, the price should be present on the outcome pool for the market
 * @param stake  {BN} raw token value of the order taking into account the decimal amount of the token associated with the market
 * @param productPk {PublicKey} Optional: publicKey of product account this order was created on
 * @returns {OrderInstructionResponse}  derived order publicKey and the instruction to perform a create order transaction
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOutcomeIndex = 0
 * const forOutcome = true
 * const price = 1.5
 * const stake = 20,000,000,000
 * const productPk = new PublicKey('betDexExcHangeZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const instruction = await buildOrderInstruction(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
 */
export async function buildOrderInstruction(
  program: Program,
  marketPk: PublicKey,
  marketOutcomeIndex: number,
  forOutcome: boolean,
  price: number,
  stake: BN,
  productPk?: PublicKey,
): Promise<ClientResponse<OrderInstructionResponse>> {
  const response = new ResponseFactory({} as OrderInstructionResponse);
  const provider = program.provider as AnchorProvider;
  const marketAccounts = await getMarketAccounts(
    program,
    marketPk,
    forOutcome,
    marketOutcomeIndex,
    price,
  );

  if (!marketAccounts.success) {
    response.addErrors(marketAccounts.errors);
    return response.body;
  }

  const marketTokenPk = new PublicKey(marketAccounts.data.market.mintAccount);

  const [purchaserTokenAccount, orderPdaResponse] = await Promise.all([
    getWalletTokenAccount(program, marketTokenPk),
    findOrderPda(program, marketPk, provider.wallet.publicKey),
  ]);

  if (!purchaserTokenAccount.success) {
    response.addErrors(purchaserTokenAccount.errors);
    return response.body;
  }

  if (!orderPdaResponse.success) {
    response.addErrors(orderPdaResponse.errors);
    return response.body;
  }

  const orderPk = orderPdaResponse.data.orderPk;
  const distinctSeed = orderPdaResponse.data.distinctSeed;
  const instruction = await program.methods
    .createOrderV2(distinctSeed, {
      marketOutcomeIndex: marketOutcomeIndex,
      forOutcome: forOutcome,
      stake: stake,
      price: price,
    })
    .accounts({
      purchaser: provider.wallet.publicKey,
      order: orderPk,
      marketPosition: marketAccounts.data.marketPositionPda,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      market: marketPk,
      marketMatchingPool: marketAccounts.data.marketOutcomePoolPda,
      marketOutcome: marketAccounts.data.marketOutcomePda,
      purchaserToken: purchaserTokenAccount.data.associatedTokenAccount,
      marketEscrow: marketAccounts.data.escrowPda,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      product: productPk == undefined ? null : productPk,
    })
    .instruction();
  response.addResponseData({ orderPk, instruction });
  return response.body;
}
