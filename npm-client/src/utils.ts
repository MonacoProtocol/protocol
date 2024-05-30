import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider, BN, Program, web3 } from "@coral-xyz/anchor";
import { Mint, getMint } from "@solana/spl-token";
import { Big } from "big.js";
import { getMarket } from "./markets";
import { findMarketPositionPda } from "./market_position";
import { findMarketMatchingPoolPda } from "./market_matching_pools";
import { findMarketOrderRequestQueuePda } from "./market_order_request_queues";
import { findMarketOutcomePda } from "./market_outcomes";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  StakeInteger,
  SignAndSendInstructionsResponse,
  SignAndSendInstructionsBatchResponse,
  MarketAccountsForCreateOrder,
} from "../types";
import { v4 as uuid } from "uuid";

/**
 * For the provided market, outcome, price and forOutcome condition - return all the necessary PDAs and account information required for order creation.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @param forOutcome {boolean} bool representing for or against a market outcome
 * @param marketOutcomeIndex {number} index representing the chosen outcome of a market
 * @param price {number} price for order
 * @returns {PublicKey, MarketAccount} publicKey PDAs for the escrow, marketOutcome, outcomePool and marketPosition accounts as well as the full marketAccount.
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const forOutcome = true
 * const marketOutcomeIndex = 0
 * const price = 5.9
 * const marketAccounts = await getMarketAccounts(program, marketPK, forOutcome, marketOutcomeIndex, price)
 */
export async function getMarketAccounts(
  program: Program,
  marketPk: PublicKey,
  forOutcome: boolean,
  marketOutcomeIndex: number,
  price: number,
): Promise<ClientResponse<MarketAccountsForCreateOrder>> {
  const response = new ResponseFactory({} as MarketAccountsForCreateOrder);
  const market = await getMarket(program, marketPk);

  if (!market.success) {
    response.addErrors(market.errors);
    return response.body;
  }

  const provider = program.provider as AnchorProvider;

  const [
    marketOutcomePda,
    marketOutcomePoolPda,
    marketPositionPda,
    escrowPda,
    marketOrderRequestQueuePda,
  ] = await Promise.all([
    findMarketOutcomePda(program, marketPk, marketOutcomeIndex),
    findMarketMatchingPoolPda(
      program,
      marketPk,
      marketOutcomeIndex,
      price,
      forOutcome,
    ),
    findMarketPositionPda(program, marketPk, provider.wallet.publicKey),
    findEscrowPda(program, marketPk),
    findMarketOrderRequestQueuePda(program, marketPk),
  ]);

  const responseData = {
    escrowPda: escrowPda.data.pda,
    marketOrderRequestQueuePda: marketOrderRequestQueuePda.data.pda,
    marketOutcomePda: marketOutcomePda.data.pda,
    marketOutcomePoolPda: marketOutcomePoolPda.data.pda,
    marketPositionPda: marketPositionPda.data.pda,
    market: market.data.account,
  };

  response.addResponseData(responseData);

  return response.body;
}

/**
 * For the provided stake and market, get a BN representation of the stake adjusted for the decimals on that markets token.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param stake {number} ui stake amount, i.e. how many tokens a wallet wishes to stake on an outcome
 * @param marketPk {PublicKey} publicKey of a market
 * @param mintDecimals {number} Optional: the decimal number used on the mint for the market (for example USDT has 6 decimals)
 * @returns {BN} ui stake adjusted for the market token decimal places
 *
 * @example
 *
 * const uiStake = await uiStakeToInteger(20, new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D'), program)
 * // returns 20_000_000_000 represented as a BN for a token with 9 decimals
 */
export async function uiStakeToInteger(
  program: Program,
  stake: number,
  marketPk: PublicKey,
  mintDecimals?: number,
): Promise<ClientResponse<StakeInteger>> {
  const response = new ResponseFactory({});

  if (!mintDecimals) {
    const market = await getMarket(program, marketPk);

    if (!market.success) {
      response.addErrors(market.errors);
      return response.body;
    }

    const marketTokenPk = new PublicKey(market.data.account.mintAccount);
    const mintInfo = await getMintInfo(program, marketTokenPk);

    if (!mintInfo.success) {
      response.addErrors(mintInfo.errors);
      return response.body;
    }
    mintDecimals = mintInfo.data.decimals;
  }

  const stakeInteger = new BN(
    new Big(stake).times(10 ** mintDecimals).toNumber(),
  );
  response.addResponseData({
    stakeInteger: stakeInteger,
  });
  return response.body;
}

/**
 * For the provided market publicKey, return the escrow account PDA (publicKey) for that market.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the escrow account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const escrowPda = await findEscrowPda(program, marketPK)
 */
export async function findEscrowPda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), marketPk.toBuffer()],
      program.programId,
    );
    response.addResponseData({
      pda: pda,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

/**
 * For the provided spl-token, get the mint info for that token.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param mintPK {PublicKey} publicKey of an spl-token
 * @returns {Mint} mint information including mint authority and decimals
 *
 * @example
 *
 * const mintPk = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
 * const getMintInfo = await findEscrowPda(program, mintPk)
 */
export async function getMintInfo(
  program: Program,
  mintPK: PublicKey,
): Promise<ClientResponse<Mint>> {
  const response = new ResponseFactory({} as Mint);

  const provider = program.provider as AnchorProvider;
  try {
    const mintInfo = await getMint(provider.connection, mintPK);
    response.addResponseData(mintInfo);
  } catch (e) {
    response.addError(e);
  }

  return response.body;
}

/**
 * For the provided product title, get the pda for the Product account
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param productTitle title of product
 *
 * @example
 *
 * const productPk = await findProductPda(program, "EXAMPLE_BETTING_EXCHANGE")
 */
export async function findProductPda(program: Program, productTitle: string) {
  const [productPk] = await PublicKey.findProgramAddress(
    [Buffer.from("product"), Buffer.from(productTitle)],
    program.programId,
  );
  return productPk;
}

/**
 * Sign and send, as the provider authority, the given transaction instructions.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param instructions {TransactionInstruction[]} list of instruction for the transaction
 * @param computeUnitLimit {number} optional limit on the number of compute units to be used by the transaction
 * @returns {SignAndSendInstructionsResponse} containing the signature of the transaction
 *
 * @example
 *
 * const orderInstruction = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
 * const computeUnitLimit = 1400000
 * const transaction = await signAndSendInstruction(program, [orderInstruction.data.instruction], computeUnitLimit)
 */
export async function signAndSendInstructions(
  program: Program,
  instructions: TransactionInstruction[],
  computeUnitLimit?: number,
): Promise<ClientResponse<SignAndSendInstructionsResponse>> {
  const response = new ResponseFactory({} as SignAndSendInstructionsResponse);
  const provider = program.provider as AnchorProvider;

  const transaction = new web3.Transaction();
  instructions.forEach((instruction) => transaction.add(instruction));
  if (computeUnitLimit)
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
    );

  transaction.feePayer = provider.wallet.publicKey;
  transaction.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;
  try {
    const signature = await provider.connection.sendRawTransaction(
      (await provider.wallet.signTransaction(transaction)).serialize(),
    );
    response.addResponseData({ signature });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

/**
 * Sign and send, as the provider authority, the given transaction instructions in the provided batch sizes.
 *
 * Note: batches can be optimised for size by ensuring that instructions have commonality among accounts (same walletPk, same marketPk, same marketMatchingPoolPk, etc.)
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param instructions {TransactionInstruction[]} list of instruction for the transaction
 * @param batchSize {number} number of instructions to be included in each transaction
 * @param computeUnitLimit {number} optional limit on the number of compute units to be used by the transaction
 * @returns {SignAndSendInstructionsBatchResponse} containing the signature of the transaction
 * @returns
 *
 * @example
 *
 * const orderInstruction1 = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
 * ...
 * const orderInstruction20 = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
 * const batchSize = 5
 * const computeUnitLimit = 1400000
 * const transactions = await signAndSendInstructionsBatch(program, [orderInstruction1.data.instruction, ..., orderInstruction20.data.instruction], batchSize, computeUnitLimit)
 */
export async function signAndSendInstructionsBatch(
  program: Program,
  instructions: TransactionInstruction[],
  batchSize: number,
  computeUnitLimit?: number,
): Promise<ClientResponse<SignAndSendInstructionsBatchResponse>> {
  const response = new ResponseFactory(
    {} as SignAndSendInstructionsBatchResponse,
  );
  const signatures = [] as string[];
  const failedInstructions = [] as TransactionInstruction[];

  for (let i = 0; i < instructions.length; i += batchSize) {
    const slicedInstructions = instructions.slice(i, i + batchSize);
    const send = await signAndSendInstructions(
      program,
      slicedInstructions,
      computeUnitLimit,
    );
    if (send.success) {
      signatures.push(send.data.signature);
    } else {
      response.addErrors(send.errors);
      failedInstructions.push(...slicedInstructions);
    }
  }

  response.addResponseData({ signatures, failedInstructions });

  return response.body;
}

/**
 * For the provided transaction signature, confirm the transaction.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param signature {string | void} signature of the transaction
 * @returns {ClientResponse<unknown>} empty client response containing no data, only success state and errors
 *
 * @example
 *
 * const orderInstruction = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
 * const transaction = await signAndSendInstruction(program, orderInstruction.data.instruction)
 * const confirmation = await confirmTransaction(program, transaction.data.signature);
 */
export async function confirmTransaction(
  program: Program,
  signature: string | void,
): Promise<ClientResponse<unknown>> {
  const response = new ResponseFactory({});
  const provider = program.provider as AnchorProvider;
  try {
    const blockHash = await provider.connection.getLatestBlockhash();
    const confirmRequest = {
      blockhash: blockHash.blockhash,
      lastValidBlockHeight: blockHash.lastValidBlockHeight,
      signature: signature as string,
    };
    await provider.connection.confirmTransaction(confirmRequest);
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

/**
 * Return a new seed 16 bytes long as Uint8Array
 *
 * @returns {Uint8Array}
 */
export function randomSeed16(): Uint8Array {
  const buffer = new Uint8Array(16);
  uuid(null, buffer, 0);
  return buffer;
}
