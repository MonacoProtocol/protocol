import { PublicKey } from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";
import {
  confirmTransaction,
  signAndSendInstructions,
  uiStakeToInteger,
} from "./utils";
import {
  ClientResponse,
  OrderTransactionResponse,
  ResponseFactory,
} from "../types";
import { buildOrderInstruction } from "./create_order_instruction";

/**
 * Create an order account on the Monaco protocol using a UI stake value, the client calculates the actual stake value based on mintInfo.data.decimals using uiStakeToInteger().
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to create the order for
 * @param marketOutcomeIndex {number} index of the chosen outcome
 * @param forOutcome  {boolean} whether the order is for or against the outcome
 * @param price  {number} price at which the order should be created, the price should be present on the outcome pool for the market
 * @param stake  {number} UI value of the stake, the function will determine the raw value based on the market token type
 * @param productPk {PublicKey} Optional: publicKey of product account this order was created on
 * @param mintDecimal {number} Optional: the decimal number used on the mint for the market (for example USDT has 6 decimals)
 * @returns {OrderTransactionResponse}  derived order publicKey and transactionID for the request, this ID should be used to confirm the success of the transaction
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOutcomeIndex = 0
 * const forOutcome = true
 * const price = 1.5
 * const stake = 20
 * const productPk = new PublicKey('betDexExcHangeZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const mintDecimal = 6
 * const order = await createOrderUiStake(program, marketPk, marketOutcomeIndex, forOutcome, price, 20, productPk, mintDecimal)
 */
export async function createOrderUiStake(
  program: Program,
  marketPk: PublicKey,
  marketOutcomeIndex: number,
  forOutcome: boolean,
  price: number,
  stake: number,
  productPk?: PublicKey,
  mintDecimal?: number,
): Promise<ClientResponse<OrderTransactionResponse>> {
  const stakeInteger = await uiStakeToInteger(
    program,
    stake,
    marketPk,
    mintDecimal,
  );

  if (!stakeInteger.success) {
    const response = new ResponseFactory({} as OrderTransactionResponse);
    response.addErrors(stakeInteger.errors);
    return response.body;
  }

  return await createOrder(
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
 * Create an order account on the Monaco protocol using the raw token value for the order stake.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to create the order for
 * @param marketOutcomeIndex {number} index of the chosen outcome
 * @param forOutcome  {boolean} whether the order is for or against the outcome
 * @param price  {number} price at which the order should be created, the price should be present on the outcome pool for the market
 * @param stake  {BN} raw token value of the order taking into account the decimal amount of the token associated with the market
 * @param productPk {PublicKey} Optional: publicKey of product account this order was created on
 * @returns {OrderTransactionResponse}  derived order publicKey and transactionID for the request, this ID should be used to confirm the success of the transaction
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOutcomeIndex = 0
 * const forOutcome = true
 * const price = 1.5
 * const stake = 20_000_000_000
 * const productPk = new PublicKey('betDexExcHangeZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const order = await createOrder(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
 */
export async function createOrder(
  program: Program,
  marketPk: PublicKey,
  marketOutcomeIndex: number,
  forOutcome: boolean,
  price: number,
  stake: BN,
  productPk?: PublicKey,
): Promise<ClientResponse<OrderTransactionResponse>> {
  const response = new ResponseFactory({} as OrderTransactionResponse);
  const orderInstruction = await buildOrderInstruction(
    program,
    marketPk,
    marketOutcomeIndex,
    forOutcome,
    price,
    stake,
    productPk,
  );

  response.addResponseData({
    orderPk: orderInstruction.data.orderPk,
  });

  const transaction = await signAndSendInstructions(program, [
    orderInstruction.data.instruction,
  ]);

  if (!transaction.success) {
    response.addErrors(transaction.errors);
    return response.body;
  }

  response.addResponseData({
    tnxID: transaction.data.signature,
  });

  const confirmation = await confirmTransaction(
    program,
    transaction.data.signature,
  );

  if (!confirmation.success) {
    response.addErrors(confirmation.errors);
  }

  return response.body;
}
