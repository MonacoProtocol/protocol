import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  GetAccount,
  MarketOrderRequestQueues,
  MarketOrderRequestQueue,
  OrderRequest,
} from "../types";
import { BooleanCriterion, toFilters } from "./queries";

/**
 * For the provided market publicKey, return the PDA (publicKey) of the market order-request-queue account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the market order-request-queue account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOrderRequestQueuePk = await findMarketOrderRequestQueuePda(program, marketPK)
 */
export async function findMarketOrderRequestQueuePda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("order_request"), marketPk.toBuffer()],
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
 * For the provided market order-request-queue publicKey, get the market order-request-queue account details.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketOrderRequestQueuePk {PublicKey} publicKey of the order-request-queue
 * @returns {GetAccount<MarketOrderRequestQueue>} market order-request-queue account details
 *
 * @example
 *
 * const marketOrderRequestQueuePk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOrderRequestQueue = await getMarketOrderRequestQueue(program, marketMatchingQueuePk)
 */
export async function getMarketOrderRequestQueue(
  program: Program,
  marketOrderRequestQueuePk: PublicKey,
): Promise<ClientResponse<GetAccount<MarketOrderRequestQueue>>> {
  const response = new ResponseFactory(
    {} as GetAccount<MarketOrderRequestQueue>,
  );
  try {
    const marketMatchingQueue =
      (await program.account.marketOrderRequestQueue.fetch(
        marketOrderRequestQueuePk,
      )) as MarketOrderRequestQueue;

    response.addResponseData({
      publicKey: marketOrderRequestQueuePk,
      account: marketMatchingQueue,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

export async function getNonEmptyMarketOrderRequestQueues(
  program: Program,
): Promise<ClientResponse<MarketOrderRequestQueues>> {
  const response = new ResponseFactory({} as MarketOrderRequestQueues);
  const connection = program.provider.connection;

  try {
    const emptyFilter = new BooleanCriterion(8 + 32);
    emptyFilter.setValue(false);

    const accounts = await connection.getProgramAccounts(program.programId, {
      dataSlice: { offset: 0, length: 0 }, // fetch without any data.
      filters: toFilters("market_order_request_queue", emptyFilter),
    });
    const accountKeys = accounts.map((account) => account.pubkey);

    const accountsWithData =
      (await program.account.marketOrderRequestQueue.fetchMultiple(
        accountKeys,
      )) as MarketOrderRequestQueue[];

    const result = accountKeys
      .map((accountKey, i) => {
        return { publicKey: accountKey, account: accountsWithData[i] };
      })
      .filter((o) => o.account);

    response.addResponseData({ marketOrderRequestQueues: result });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

export function toOrderRequests(
  marketOrderRequestQueue: MarketOrderRequestQueue,
): OrderRequest[] {
  const orderRequests = marketOrderRequestQueue.orderRequests;
  const frontIndex = orderRequests.front;
  const allItems = orderRequests.items;
  const backIndex =
    frontIndex + (orderRequests.len % orderRequests.items.length);

  let queuedItems: OrderRequest[] = [];
  if (orderRequests.len > 0) {
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
