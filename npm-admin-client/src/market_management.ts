import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  Operator,
  TransactionResponse,
  ClientResponse,
  ResponseFactory,
  EpochTimeStamp,
} from "../types";
import { findAuthorisedOperatorsAccountPda } from "./operators";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { findEscrowPda } from "./market_helpers";

/**
 * Settle a market by setting the winningOutcomeIndex
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to settle
 * @param winningOutcomeIndex {number} index representing the winning outcome of the event associated with the market
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
  marketMatchingQueuePk: PublicKey,
  winningOutcomeIndex: number,
): Promise<ClientResponse<TransactionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  try {
    const tnxId = await program.methods
      .settleMarket(winningOutcomeIndex)
      .accounts({
        market: marketPk,
        marketMatchingQueue: marketMatchingQueuePk,
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();
    response.addResponseData({
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}

/**
 * Set the published flag on a market to `true`
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
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
): Promise<ClientResponse<TransactionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  try {
    const tnxId = await program.methods
      .publishMarket()
      .accounts({
        market: new PublicKey(marketPk),
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();
    response.addResponseData({
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}

/**
 * Set the published flag on a market to `false`
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
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
): Promise<ClientResponse<TransactionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  try {
    const tnxId = await program.methods
      .unpublishMarket()
      .accounts({
        market: new PublicKey(marketPk),
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();

    response.addResponseData({
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}

/**
 * Set the suspended flag on a market to `true` - no orders can be placed against a suspended market
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
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
): Promise<ClientResponse<TransactionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  try {
    const tnxId = await program.methods
      .suspendMarket()
      .accounts({
        market: new PublicKey(marketPk),
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();

    response.addResponseData({
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}

/**
 * Set the suspended flag on a market to `false` - allowing for orders to be placed
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
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
): Promise<ClientResponse<TransactionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  try {
    const tnxId = await program.methods
      .unsuspendMarket()
      .accounts({
        market: marketPk,
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();

    response.addResponseData({
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}

/**
 * For the given market, update the title
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param title {string} new title to apply to the provided market
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
): Promise<ClientResponse<TransactionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  try {
    const tnxId = await program.methods
      .updateMarketTitle(title)
      .accounts({
        market: marketPk,
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();

    response.addResponseData({
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }

  return response.body;
}

/**
 * For the given market, update the event start time
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param eventStartTimeTimestamp {EpochTimeStamp} timestamp in seconds representing the new time when the market event will start (moving in-play markets to in-play)
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
): Promise<ClientResponse<TransactionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  try {
    const tnxId = await program.methods
      .updateMarketEventStartTime(new BN(eventStartTimeTimestamp))
      .accounts({
        market: marketPk,
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();

    response.addResponseData({
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }

  return response.body;
}

/**
 * For the given market, update the event start time to now
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const update = await setMarketEventStartToNow(program, marketPk)
 */
export async function setMarketEventStartToNow(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<TransactionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  try {
    const tnxId = await program.methods
      .updateMarketEventStartTimeToNow()
      .accounts({
        market: marketPk,
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();

    response.addResponseData({
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }

  return response.body;
}

/**
 * For the given market, update the lock time
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
 * @param marketLockTimestamp {EpochTimeStamp} timestamp in seconds representing the new time when the market can no longer accept orders
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
): Promise<ClientResponse<TransactionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  try {
    const tnxId = await program.methods
      .updateMarketLocktime(new BN(marketLockTimestamp))
      .accounts({
        market: marketPk,
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();

    response.addResponseData({
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }

  return response.body;
}

/**
 * Open a Market, moving it from Intializing to Open status.
 *
 * Once Open, outcomes can no longer be added to a market.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to open
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
): Promise<ClientResponse<TransactionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  try {
    const tnxId = await program.methods
      .openMarket()
      .accounts({
        market: marketPk,
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();
    response.addResponseData({
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}

/**
 * Set a Settled market to the Ready to Close status
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
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

  try {
    const tnxId = await program.methods
      .setMarketReadyToClose()
      .accounts({
        market: marketPk,
        marketEscrow: marketEscrow.data.pda,
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();
    response.addResponseData({
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}

/**
 * Set an Open or Intializing market to the Ready to Void status
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market to update
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

  try {
    const tnxId = await program.methods
      .voidMarket()
      .accounts({
        market: marketPk,
        marketEscrow: marketEscrow.data.pda,
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .rpc();
    response.addResponseData({
      tnxId: tnxId,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
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
 * @returns {TransactionResponse} transaction ID of the request
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const mintPk = new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')
 * const transferTxn = await transferMarketEscrowSurplus(program, marketPk, mintPk)
 */
export async function transferMarketEscrowSurplus(
  program: Program,
  marketPk: PublicKey,
  mintPk: PublicKey,
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

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    (provider.wallet as NodeWallet).payer,
    mintPk,
    provider.wallet.publicKey,
  );

  try {
    const tnxId = await program.methods
      .transferMarketEscrowSurplus()
      .accounts({
        market: marketPk,
        marketEscrow: marketEscrow.data.pda,
        marketAuthorityToken: tokenAccount.address,
        marketOperator: provider.wallet.publicKey,
        authorisedOperators: authorisedOperators.data.pda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    response.addResponseData({ tnxId });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}

async function setupManagementRequest(program: Program) {
  const response = new ResponseFactory({} as TransactionResponse);
  const provider = program.provider as AnchorProvider;
  const authorisedOperators = await findAuthorisedOperatorsAccountPda(
    program,
    Operator.MARKET,
  );
  return { response, provider, authorisedOperators };
}
