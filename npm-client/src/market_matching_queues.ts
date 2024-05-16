import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  GetAccount,
  MarketMatchingQueues,
  MarketMatchingQueue,
  OrderMatch,
} from "../types";
import { BooleanCriterion, toFilters } from "./queries";

/**
 * For the provided market publicKey, return the PDA (publicKey) of the market matching-queue account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the market matching-queue account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketMatchingQueuePk = await findMarketMatchingQueuePda(program, marketPK)
 */
export async function findMarketMatchingQueuePda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("matching"), marketPk.toBuffer()],
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
 * For the provided market matching queue publicKey, get the market matching queue account details.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketMatchingQueuePk {PublicKey} publicKey of the market matching queue
 * @returns {GetAccount<MarketMatchingQueue>} market matching queue account details
 *
 * @example
 *
 * const marketMatchingQueuePk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketMatchingQueue = await getMarketMatchingQueue(program, marketMatchingQueuePk)
 */
export async function getMarketMatchingQueue(
  program: Program,
  marketMatchingQueuePk: PublicKey,
): Promise<ClientResponse<GetAccount<MarketMatchingQueue>>> {
  const response = new ResponseFactory({} as GetAccount<MarketMatchingQueue>);
  try {
    const marketMatchingQueue =
      (await program.account.marketMatchingQueue.fetch(
        marketMatchingQueuePk,
      )) as MarketMatchingQueue;

    response.addResponseData({
      publicKey: marketMatchingQueuePk,
      account: marketMatchingQueue,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

export async function getNonEmptyMarketMatchingQueues(
  program: Program,
): Promise<ClientResponse<MarketMatchingQueues>> {
  const response = new ResponseFactory({} as MarketMatchingQueues);
  const connection = program.provider.connection;

  try {
    const emptyFilter = new BooleanCriterion(8 + 32);
    emptyFilter.setValue(false);

    const accounts = await connection.getProgramAccounts(program.programId, {
      dataSlice: { offset: 0, length: 0 }, // fetch without any data.
      filters: toFilters("market_matching_queue", emptyFilter),
    });
    const accountKeys = accounts.map((account) => account.pubkey);

    const accountsWithData =
      (await program.account.marketMatchingQueue.fetchMultiple(
        accountKeys,
      )) as MarketMatchingQueue[];

    const result = accountKeys
      .map((accountKey, i) => {
        return { publicKey: accountKey, account: accountsWithData[i] };
      })
      .filter((o) => o.account);

    response.addResponseData({ marketMatchingQueues: result });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

export function toOrderMatches(
  marketMatchingQueue: MarketMatchingQueue,
): OrderMatch[] {
  const matches = marketMatchingQueue.matches;
  const frontIndex = matches.front;
  const allItems = matches.items;
  const backIndex = frontIndex + (matches.len % matches.items.length);

  let queuedItems: OrderMatch[] = [];
  if (matches.len > 0) {
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
