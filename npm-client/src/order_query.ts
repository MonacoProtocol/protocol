import { PublicKey, MemcmpFilter } from "@solana/web3.js";
import {
  Program,
  BorshAccountsCoder,
  AnchorProvider,
} from "@project-serum/anchor";
import bs58 from "bs58";
import { GetAccount } from "../types/get_account";
import {
  Order,
  OrderStatus,
  ClientResponse,
  ResponseFactory,
  GetPublicKeys,
  OrderAccounts,
} from "../types";
import { Markets } from "./market_query";

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
 *       .filterByStatus(OrderStatus.Open)
 *       .fetch();
 *
 * // Returns all open order accounts for the specified market and purchasing wallet.
 */
export class Orders {
  public static orderQuery(program: Program) {
    return new Orders(program);
  }

  private program: Program;
  private _filter: MemcmpFilter[] = [];

  constructor(program: Program) {
    this.program = program;
    this._filter.push(
      this.toFilter(
        0,
        bs58.encode(BorshAccountsCoder.accountDiscriminator("order")),
      ),
    );
  }

  filterByPurchaser(purchaser: PublicKey): Orders {
    this._filter.push(this.toFilter(8, purchaser.toBase58()));
    return this;
  }

  filterByMarket(market: PublicKey): Orders {
    this._filter.push(this.toFilter(8 + 32, market.toBase58()));
    return this;
  }

  filterByStatus(status: OrderStatus): Orders {
    this._filter.push(
      this.toFilter(8 + 32 + 32 + 2 + 1, bs58.encode([status])),
    );
    return this;
  }

  private toFilter(offset: number, bytes: string): MemcmpFilter {
    return { memcmp: { offset: offset, bytes: bytes } };
  }

  /**
   *
   * @returns {GetPublicKeys} list of all fetched order publicKeys
   */
  async fetchPublicKeys(): Promise<ClientResponse<GetPublicKeys>> {
    const response = new ResponseFactory({} as GetPublicKeys);
    const connection = this.program.provider.connection;

    try {
      const accounts = await connection.getProgramAccounts(
        this.program.programId,
        {
          dataSlice: { offset: 0, length: 0 }, // fetch without any data.
          filters: this._filter,
        },
      );
      const publicKeys = accounts.map((account) => account.pubkey);
      response.addResponseData({
        publicKeys: publicKeys,
      });
    } catch (e) {
      response.addError(e);
    }

    return response.body;
  }

  /**
   *
   * @returns {OrderAccounts} fetched order accounts mapped to their publicKey
   */
  async fetch(): Promise<ClientResponse<OrderAccounts>> {
    const response = new ResponseFactory({} as OrderAccounts);
    const accountPublicKeys = await this.fetchPublicKeys();

    if (!accountPublicKeys.success) {
      response.addErrors(accountPublicKeys.errors);
      return response.body;
    }

    try {
      const accountsWithData = (await this.program.account.order.fetchMultiple(
        accountPublicKeys.data.publicKeys,
        "confirmed",
      )) as Order[];

      const result = accountPublicKeys.data.publicKeys
        .map((accountPublicKey, i) => {
          return { publicKey: accountPublicKey, account: accountsWithData[i] };
        })
        .filter((o) => o.account);

      response.addResponseData({
        orderAccounts: result,
      });
    } catch (e) {
      response.addError(e);
    }

    return response.body;
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
 * const status = OrderStatus.Open
 * const orders = await getOrdersByStatusForProviderWallet(program, status)
 */
export async function getOrdersByStatusForProviderWallet(
  program: Program,
  status: OrderStatus,
): Promise<ClientResponse<OrderAccounts>> {
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
): Promise<ClientResponse<OrderAccounts>> {
  const provider = program.provider as AnchorProvider;
  return await Orders.orderQuery(program)
    .filterByPurchaser(provider.wallet.publicKey)
    .filterByMarket(marketPk)
    .fetch();
}
/**
 * Get all cancellable orders owned by the program provider for the given market. Orders can be cancelled if they:
 *
 * - Have the status of OrderStatus.OPEN
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
): Promise<ClientResponse<OrderAccounts>> {
  const provider = program.provider as AnchorProvider;
  const orders = await Orders.orderQuery(program)
    .filterByPurchaser(provider.wallet.publicKey)
    .filterByMarket(marketPk)
    .fetch();
  orders.data.orderAccounts = orders.data.orderAccounts.filter(
    (order) => order.account.stakeUnmatched.toNumber() > 0,
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
): Promise<ClientResponse<OrderAccounts>> {
  const response = new ResponseFactory({} as OrderAccounts);
  const provider = program.provider as AnchorProvider;
  const marketPks = await Markets.marketQuery(program)
    .filterByEvent(eventPk)
    .fetch();

  if (!marketPks.success) {
    response.addErrors(marketPks.errors);
    return response.body;
  }

  const orderAccounts = [] as GetAccount<Order>[];

  await Promise.all(
    marketPks.data.markets.map(async function (market) {
      const orderResponse = await Orders.orderQuery(program)
        .filterByPurchaser(provider.wallet.publicKey)
        .filterByMarket(market.publicKey)
        .fetch();
      if (orderResponse.success) {
        orderAccounts.push(...orderResponse.data.orderAccounts);
      } else {
        response.addErrors(orderResponse.errors);
      }
    }),
  );

  response.addResponseData({
    orderAccounts: orderAccounts,
  });
  return response.body;
}
