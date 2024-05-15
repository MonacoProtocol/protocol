import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  GetAccount,
  MarketCommissionPaymentQueue,
  MarketCommissionPaymentQueues,
  CommissionPayment,
} from "../types";
import { BooleanCriterion, toFilters } from "./queries";

/**
 * For the provided market publicKey, return the PDA (publicKey) of the market's commission payment queue account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the market's commission payment queue account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketCommissionPaymentQueue = await findMarketCommissionPaymentQueuePda(program, marketPK)
 */
export async function findMarketCommissionPaymentQueuePda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("commission_payments"), marketPk.toBuffer()],
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
 * For the provided market's commission payment queue publicKey, get the market's commission payment queue account details.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketCommissionPaymentQueuePk {PublicKey} publicKey of the commission payment queue
 * @returns {ClientResponse<GetAccount<MarketCommissionPaymentQueue>>} market commission payment queue account details
 *
 * @example
 *
 * const marketCommissionPaymentQueuePk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketCommissionPaymentQueue = await getMarketCommissionPaymentQueue(program, marketCommissionPaymentQueuePk)
 */
export async function getMarketCommissionPaymentQueue(
  program: Program,
  marketCommissionPaymentQueuePk: PublicKey,
): Promise<ClientResponse<GetAccount<MarketCommissionPaymentQueue>>> {
  const response = new ResponseFactory(
    {} as GetAccount<MarketCommissionPaymentQueue>,
  );
  try {
    const marketCommissionPaymentQueueRaw =
      await program.account.marketPaymentsQueue.fetch(
        marketCommissionPaymentQueuePk,
      );

    // renaming paymentQueue -> payments
    const { paymentQueue, ...otherProperties } =
      marketCommissionPaymentQueueRaw;
    const marketCommissionPaymentQueue = {
      ...otherProperties,
      commissionPayments: paymentQueue,
    } as MarketCommissionPaymentQueue;

    response.addResponseData({
      publicKey: marketCommissionPaymentQueuePk,
      account: marketCommissionPaymentQueue,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

export async function getNonEmptyMarketCommissionPaymentQueues(
  program: Program,
): Promise<ClientResponse<MarketCommissionPaymentQueues>> {
  const response = new ResponseFactory({} as MarketCommissionPaymentQueues);
  const connection = program.provider.connection;

  try {
    const emptyFilter = new BooleanCriterion(8 + 32);
    emptyFilter.setValue(false);

    const accounts = await connection.getProgramAccounts(program.programId, {
      dataSlice: { offset: 0, length: 0 }, // fetch without any data.
      filters: toFilters("market_payments_queue", emptyFilter),
    });
    const accountKeys = accounts.map((account) => account.pubkey);

    const accountsWithData =
      (await program.account.marketPaymentsQueue.fetchMultiple(
        accountKeys,
      )) as MarketCommissionPaymentQueue[];

    const result = accountKeys
      .map((accountKey, i) => {
        return { publicKey: accountKey, account: accountsWithData[i] };
      })
      .filter((o) => o.account);

    response.addResponseData({ marketCommissionPaymentQueues: result });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

export function toCommissionPayments(
  marketCommissionPaymentQueue: MarketCommissionPaymentQueue,
): CommissionPayment[] {
  const commissionPayments = marketCommissionPaymentQueue.commissionPayments;
  const frontIndex = commissionPayments.front;
  const allItems = commissionPayments.items;
  const backIndex =
    frontIndex + (commissionPayments.len % commissionPayments.items.length);

  let queuedItems: CommissionPayment[] = [];
  if (commissionPayments.len > 0) {
    if (backIndex <= frontIndex) {
      // queue bridges array
      queuedItems = allItems
        .slice(frontIndex)
        .concat(allItems.slice(0, backIndex));
    } else {
      // queue can be treated as normal array
      queuedItems = allItems.slice(frontIndex, backIndex);
    }
  }
  return queuedItems;
}
