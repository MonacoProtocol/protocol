import { Program } from "@coral-xyz/anchor";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  TransactionResponse,
  ClientResponse,
  EpochTimeStamp,
  ResponseFactory,
  TransactionOptions,
} from "../types";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { findEscrowPda, findMarketFundingPda } from "./market_helpers";
import {
  MarketManagementInstructionType,
  buildMarketManagementInstruction,
  setupManagementRequest,
} from "./market_management_instructions";
import { confirmTransaction, signAndSendInstructions } from "./utils";

async function sendManagementTransaction(
  program: Program,
  instructions: TransactionInstruction[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: object[],
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const response = new ResponseFactory({} as TransactionResponse);
  if (errors.length > 0) {
    response.addErrors(errors);
    return response.body;
  }
  try {
    const tnxId = await signAndSendInstructions(program, instructions, options);

    if (!tnxId.success) {
      response.addErrors(tnxId.errors);
      return response.body;
    }

    const confirmation = await confirmTransaction(
      program,
      tnxId.data.signature,
    );
    if (!confirmation.success) {
      response.addErrors(confirmation.errors);
    }
    response.addResponseData({
      tnxId: tnxId.data.signature,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response;
}

/**
 * Settle a market by setting the winningOutcomeIndex
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to settle
 * @param winningOutcomeIndex {number} index representing the winning outcome of the event associated with the market
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const winningOutcomeIndex = 0
 * const settledMarket = await settleMarket(program, marketPk, winningOutcomeIndex)
 */
export async function settleMarket(
  program: Program,
  marketPk: PublicKey,
  winningOutcomeIndex: number,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.SETTLE,
    { winningOutcomeIndex },
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * Set the published flag on a market to `true`
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const publishMarket = await publishMarket(program, marketPk)
 */
export async function publishMarket(
  program: Program,
  marketPk: PublicKey,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.PUBLISH,
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * Set the published flag on a market to `false`
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const unpublishMarket = await unpublishMarket(program, marketPk)
 */
export async function unpublishMarket(
  program: Program,
  marketPk: PublicKey,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.UNPUBLISH,
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * Set the suspended flag on a market to `true` - no orders can be placed against a suspended market
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const suspendMarket = await suspendMarket(program, marketPk)
 */
export async function suspendMarket(
  program: Program,
  marketPk: PublicKey,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.SUSPEND,
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * Set the suspended flag on a market to `false` - allowing for orders to be placed
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const unsuspendMarket = await unsuspendMarket(program, marketPk)
 */
export async function unsuspendMarket(
  program: Program,
  marketPk: PublicKey,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.UNSUSPEND,
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * For the given market, update the title
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param title {string} new title to apply to the provided market
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const newTitle = "New Market Title"
 * const update = await updateMarketTitle(program, marketPk, newTitle)
 */
export async function updateMarketTitle(
  program: Program,
  marketPk: PublicKey,
  title: string,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.UPDATE_TITLE,
    { title },
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * For the given market, update the event start time
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param eventStartTimeTimestamp {EpochTimeStamp} timestamp in seconds representing the new time when the market event will start (moving in-play markets to in-play)
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const eventStart = 1633042800
 * const update = await updateMarketEventStartTime(program, marketPk, eventStart)
 */
export async function updateMarketEventStartTime(
  program: Program,
  marketPk: PublicKey,
  eventStartTimeTimestamp: EpochTimeStamp,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.UPDATE_MARKET_EVENT_START_TIME,
    { eventStartTimeTimestamp },
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * For the given market, update the event start time to now
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const update = await setMarketEventStartToNow(program, marketPk)
 */
export async function setMarketEventStartToNow(
  program: Program,
  marketPk: PublicKey,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.UPDATE_MARKET_EVENT_START_TIME_TO_NOW,
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * For the given market, update the lock time
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param marketLockTimestamp {EpochTimeStamp} timestamp in seconds representing the new time when the market can no longer accept orders
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketLock = 1633042800
 * const update = await updateMarketLocktime(program, marketPk, marketLock)
 */
export async function updateMarketLocktime(
  program: Program,
  marketPk: PublicKey,
  marketLockTimestamp: EpochTimeStamp,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.UPDATE_LOCK_TIME,
    { marketLockTimestamp },
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * For the given market, update the lock time to now
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param options {TransactionOptions} optional parameters:
 * <ul>
 *   <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *   <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 * </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const update = await updateMarketLocktimeToNow(program, marketPk)
 */
export async function updateMarketLocktimeToNow(
  program: Program,
  marketPk: PublicKey,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.UPDATE_MARKET_LOCK_TIME_TO_NOW,
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * Open a Market, moving it from Intializing to Open status.
 *
 * Once Open, outcomes can no longer be added to a market.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to open
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * await openMarket(program, marketPk)
 */
export async function openMarket(
  program: Program,
  marketPk: PublicKey,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.OPEN,
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * Set a Settled market to the Ready to Close status
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const readyToCloseMarket = await setMarketReadyToClose(program, marketPk)
 */
export async function setMarketReadyToClose(
  program: Program,
  marketPk: PublicKey,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.SET_READY_TO_CLOSE,
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * Set an Open or Intializing market to the Ready to Void status
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const voidMarket = await voidMarket(program, marketPk)
 */
export async function voidMarket(
  program: Program,
  marketPk: PublicKey,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const instruction = await buildMarketManagementInstruction(
    program,
    marketPk,
    MarketManagementInstructionType.VOID,
  );
  return await sendManagementTransaction(
    program,
    [instruction.data.instruction],
    instruction.errors,
    options,
  );
}

/**
 * Attempts to transfer any surplus token balance in a market's escrow account into an associated token account belonging to the calling client.
 *
 * This will only work if the calling client is the authority for the given market, and if the market has at least the status of Settled, i.e., all orders must be settled before escrow can be transferred from.
 *
 * The token balance will only be transferred into an ATA belonging to the market authority, as such, if no ATA exists, one must be created, and so might cost a small amount of SOL in rent exemption.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market with a surplus escrow balance
 * @param mintPk {PublicKey} publicKey of the mint/token used for the market, required to getOrCreate the ATA
 * @param options {TransactionOptions} optional parameters:
 *   <ul>
 *     <li> computeUnitLimit - number of compute units to limit the transaction to</li>
 *     <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
 *   </ul>
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const mintPk = new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')
 * const transferTxn = await transferMarketTokenSurplus(program, marketPk, mintPk)
 */
export async function transferMarketTokenSurplus(
  program: Program,
  marketPk: PublicKey,
  mintPk: PublicKey,
  options?: TransactionOptions,
): Promise<ClientResponse<TransactionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  const marketEscrow = await findEscrowPda(program, marketPk);
  if (!marketEscrow.success) {
    response.addErrors(marketEscrow.errors);
    return response.body;
  }

  const marketFunding = await findMarketFundingPda(program, marketPk);
  if (!marketFunding.success) {
    response.addErrors(marketEscrow.errors);
    return response.body;
  }

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    (provider.wallet as NodeWallet).payer,
    mintPk,
    provider.wallet.publicKey,
  );

  try {
    const instruction = await program.methods
      .transferMarketTokenSurplus()
      .accounts({
        market: marketPk,
        marketEscrow: marketEscrow.data.pda,
        marketFunding: marketFunding.data.pda,
        marketAuthorityToken: tokenAccount.address,
        marketOperator: provider.wallet.publicKey,
        authorisedOperators: authorisedOperators.data.pda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
    const tnxId = await signAndSendInstructions(
      program,
      [instruction],
      options,
    );

    if (!tnxId.success) {
      response.addErrors(tnxId.errors);
      return response.body;
    }

    const confirmation = await confirmTransaction(
      program,
      tnxId.data.signature,
    );

    if (!confirmation.success) {
      response.addErrors(confirmation.errors);
    }
    response.addResponseData({ tnxId: tnxId.data.signature });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}
