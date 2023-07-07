import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getMarketAccounts, uiStakeToInteger } from "./utils";
import { getWalletTokenAccount } from "../src/wallet_tokens";
import { ClientResponse, CreateOrderResponse, ResponseFactory } from "../types";
import { findOrderPda } from "./order";

/**
 * Create an order account on the Monaco protocol using a UI stake value, the client calculates the actual stake value based on mintInfo.data.decimals using uiStakeToInteger()
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to create the order for
 * @param marketOutcomeIndex {number} index of the chosen outcome
 * @param forOutcome  {boolean} whether the order is for or against the outcome
 * @param price  {number} price at which the order should be created, the price should be present on the outcome pool for the market
 * @param stake  {number} UI value of the stake, the function will determine the raw value based on the market token type
 * @param productPk {PublicKey} Optional: publicKey of product account this order was created on
 * @returns {CreateOrderResponse}  derived order publicKey and transactionID for the request, this ID should be used to confirm the success of the transaction
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOutcomeIndex = 0
 * const forOutcome = true
 * const price = 1.5
 * const stake = 20
 * const productPk = new PublicKey('betDexExcHangeZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const order = await createOrderUiStake(program, marketPk, marketOutcomeIndex, forOutcome, price, 20, productPk)
 */
export async function createOrderUiStake(
  program: Program,
  marketPk: PublicKey,
  marketOutcomeIndex: number,
  forOutcome: boolean,
  price: number,
  stake: number,
  productPk?: PublicKey,
): Promise<ClientResponse<CreateOrderResponse>> {
  const stakeInteger = await uiStakeToInteger(program, stake, marketPk);
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
 * Create an order account on the Monaco protocol using the raw token value for the order stake
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to create the order for
 * @param marketOutcomeIndex {number} index of the chosen outcome
 * @param forOutcome  {boolean} whether the order is for or against the outcome
 * @param price  {number} price at which the order should be created, the price should be present on the outcome pool for the market
 * @param stake  {number} raw token value of the order taking into account the decimal amount of the token associated with the market
 * @param productPk {PublicKey} Optional: publicKey of product account this order was created on
 * @returns {CreateOrderResponse}  derived order publicKey and transactionID for the request, this ID should be used to confirm the success of the transaction
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOutcomeIndex = 0
 * const forOutcome = true
 * const price = 1.5
 * const stake = 20,000,000,000
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
): Promise<ClientResponse<CreateOrderResponse>> {
  const provider = program.provider as AnchorProvider;
  const MarketAccounts = await getMarketAccounts(
    program,
    marketPk,
    forOutcome,
    marketOutcomeIndex,
    price,
  );
  const response = new ResponseFactory({} as CreateOrderResponse);

  const marketTokenPk = new PublicKey(MarketAccounts.data.market.mintAccount);

  const [purchaserTokenAccount, orderPdaResponse] = await Promise.all([
    getWalletTokenAccount(program, marketTokenPk),
    findOrderPda(program, marketPk, provider.wallet.publicKey),
  ]);

  const orderPk = orderPdaResponse.data.orderPk;
  const distinctSeed = orderPdaResponse.data.distinctSeed;

  const tnxID = await program.methods
    .createOrderV2(distinctSeed, {
      marketOutcomeIndex: marketOutcomeIndex,
      forOutcome: forOutcome,
      stake: stake,
      price: price,
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
