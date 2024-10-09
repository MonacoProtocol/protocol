import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  ClientResponse,
  Order,
  OrderAccounts,
  ResponseFactory,
} from "../types";
import { Markets } from "./market_query";
import {
  ByteCriterion,
  PublicKeyCriterion,
  U16Criterion,
} from "./queries/filtering";
import { AccountQuery } from "./queries/account_query";
import { AccountQueryResult, AccountResult } from "../types/account_query";

export enum OrderStatusFilter {
  Open = 0x00,
  Matched = 0x01,
  SettledWin = 0x02,
  SettledLose = 0x03,
  Cancelled = 0x04,
  Voided = 0x05,
}

/**
 * Base order query builder allowing to filter by set fields. Returns publicKeys or accounts mapped to those publicKeys; filtered to remove any accounts closed during the query process.
 *
 * Some preset queries are available for convenience:
 * - getOrdersByStatusForProviderWallet
 * - getOrdersByMarketForProviderWallet
 * - getOrdersByEventForProviderWallet
 *
 * @param program {program} anchor program initialized by the consuming client
 * @returns {GetPublicKeys || OrderAccounts} publicKeys or accounts meeting query requirements
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const purchaserPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
 * const orders = await Orders.orderQuery(program)
 *       .filterByMarket(marketPk)
 *       .filterByPurchaser(purchaserPk)
 *       .filterByStatus(OrderStatusFilter.Open)
 *       .fetch();
 *
 * // Returns all open order accounts for the specified market and purchasing wallet.
 */
export class Orders extends AccountQuery<Order> {
  public static orderQuery(program: Program) {
    return new Orders(program);
  }

  private purchaser: PublicKeyCriterion = new PublicKeyCriterion(8);
  private market: PublicKeyCriterion = new PublicKeyCriterion(8 + 32);
  private marketOutcomeIndex: U16Criterion = new U16Criterion(8 + 32 + 32);
  private forOutcome: ByteCriterion = new ByteCriterion(8 + 32 + 32 + 2);
  private status: ByteCriterion = new ByteCriterion(8 + 32 + 32 + 2 + 1);

  constructor(program: Program) {
    super(program, "Order");
    this.setFilterCriteria(
      this.purchaser,
      this.market,
      this.marketOutcomeIndex,
      this.forOutcome,
      this.status,
    );
  }

  filterByPurchaser(purchaser: PublicKey): Orders {
    this.purchaser.setValue(purchaser);
    return this;
  }

  filterByMarket(market: PublicKey): Orders {
    this.market.setValue(market);
    return this;
  }

  filterByMarketOutcomeIndex(marketOutcomeIndex: number): Orders {
    this.marketOutcomeIndex.setValue(marketOutcomeIndex);
    return this;
  }

  filterByForOutcome(forOutcome: boolean): Orders {
    this.forOutcome.setValue(forOutcome ? 0x01 : 0x00);
    return this;
  }

  filterByStatus(status: OrderStatusFilter): Orders {
    this.status.setValue(status);
    return this;
  }
}

/**
 * Get all orders owned by the program provider wallet - by order status
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param status {orderStatus} status of the order, provided by the orderStatus enum
 * @returns {OrderAccounts} fetched order accounts mapped to their publicKey
 *
 * @example
 * const status = OrderStatusFilter.Open
 * const orders = await getOrdersByStatusForProviderWallet(program, status)
 */
export async function getOrdersByStatusForProviderWallet(
  program: Program,
  status: OrderStatusFilter,
): Promise<ClientResponse<AccountQueryResult<Order>>> {
  const provider = program.provider as AnchorProvider;
  return await Orders.orderQuery(program)
    .filterByPurchaser(provider.wallet.publicKey)
    .filterByStatus(status)
    .fetch();
}

/**
 * Get all orders owned by the program provider wallet - for the given market account
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market
 * @returns {OrderAccounts} fetched order accounts mapped to their publicKey
 *
 * @example
 * const marketPk = new PublicKey("5m5RyK82FQKNzMg3eDT5GY5KpbJQJhD4RhBHSG2ux4sk")
 * const orders = await getOrdersByMarketForProviderWallet(program, marketPk)
 */
export async function getOrdersByMarketForProviderWallet(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<AccountQueryResult<Order>>> {
  const provider = program.provider as AnchorProvider;
  return await Orders.orderQuery(program)
    .filterByPurchaser(provider.wallet.publicKey)
    .filterByMarket(marketPk)
    .fetch();
}

/**
 * Get all cancellable orders owned by the program provider for the given market. Orders can be cancelled if they:
 *
 * - Have the status of OPEN
 * - Are partially matched (only unmatched stake will be cancelled)
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market
 * @returns {OrderAccounts} fetched order accounts mapped to their publicKey
 *
 * @example
 * const marketPk = new PublicKey("5m5RyK82FQKNzMg3eDT5GY5KpbJQJhD4RhBHSG2ux4sk")
 * const orders = await getCancellableOrdersByMarketForProviderWallet(program, marketPk)
 */
export async function getCancellableOrdersByMarketForProviderWallet(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<AccountQueryResult<Order>>> {
  const provider = program.provider as AnchorProvider;
  const orders = await Orders.orderQuery(program)
    .filterByPurchaser(provider.wallet.publicKey)
    .filterByMarket(marketPk)
    .fetch();
  orders.data.accounts = orders.data.accounts.filter(
    (result) => result.account.stakeUnmatched.toNumber() > 0,
  );
  return orders;
}

/**
 * Get all orders owned by the program provider wallet - for all markets associated with the given event account
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param eventPk {PublicKey} publicKey of the event
 * @returns {OrderAccounts} fetched order accounts mapped to their publicKey
 *
 * @example
 * const eventPk = new PublicKey("5gHfsqpTw6HQwQBc94mXEoFFrD9muKNmAnchJ376PRE4")
 * const orders = await getOrdersByEventForProviderWallet(program, eventPk)
 */
export async function getOrdersByEventForProviderWallet(
  program: Program,
  eventPk: PublicKey,
): Promise<ClientResponse<AccountQueryResult<Order>>> {
  const response = new ResponseFactory({} as OrderAccounts);
  const provider = program.provider as AnchorProvider;
  const marketPks = await Markets.marketQuery(program)
    .filterByEvent(eventPk)
    .fetchPublicKeys();

  if (!marketPks.success) {
    response.addErrors(marketPks.errors);
    return response.body;
  }

  const accounts = [] as AccountResult<Order>[];
  let slot = 0;

  await Promise.all(
    marketPks.data.publicKeys.map(async function (marketPk) {
      const orderResponse = await Orders.orderQuery(program)
        .filterByPurchaser(provider.wallet.publicKey)
        .filterByMarket(marketPk)
        .fetch();
      if (orderResponse.success) {
        accounts.push(...orderResponse.data.accounts);
        slot = orderResponse.data.slot;
      } else {
        response.addErrors(orderResponse.errors);
      }
    }),
  );

  response.addResponseData({ accounts, slot });
  return response.body;
}
