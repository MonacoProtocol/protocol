import { Program, AnchorProvider, BN } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  Operator,
  TransactionResponse,
  ClientResponse,
  ResponseFactory,
} from "../types";
import { findAuthorisedOperatorsAccountPda } from "./operators";

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

async function setupManagementRequest(program: Program) {
  const response = new ResponseFactory({} as TransactionResponse);
  const provider = program.provider as AnchorProvider;
  const authorisedOperators = await findAuthorisedOperatorsAccountPda(
    program,
    Operator.MARKET,
  );
  return { response, provider, authorisedOperators };
}
