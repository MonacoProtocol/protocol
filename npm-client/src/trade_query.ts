import { PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import {
  Trade,
  ClientResponse,
  ResponseFactory,
  GetPublicKeys,
  TradeAccounts,
} from "../types";
import { PublicKeyCriterion, toFilters } from "./queries";

/**
 * Base trade query builder allowing to filter by set fields. Returns publicKeys or accounts mapped to those publicKeys; filtered to remove any accounts closed during the query process.
 *
 * Some preset queries are available for convenience:
 * - getTradesByStatusForProviderWallet
 * - getTradesByMarketForProviderWallet
 * - getTradesByEventForProviderWallet
 *
 * @param program {program} anchor program initialized by the consuming client
 * @returns {GetPublicKeys || TradeAccounts} publicKeys or accounts meeting query requirements
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const purchaserPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
 * const trades = await Trades.tradeQuery(program)
 *       .filterByMarket(marketPk)
 *       .filterByPurchaser(purchaserPk)
 *       .filterByStatus(TradeStatus.Open)
 *       .fetch();
 *
 * // Returns all open trade accounts for the specified market and purchasing wallet.
 */
export class Trades {
  public static tradeQuery(program: Program) {
    return new Trades(program);
  }

  private program: Program;

  private purchaser: PublicKeyCriterion = new PublicKeyCriterion(8);
  private market: PublicKeyCriterion = new PublicKeyCriterion(8 + 32);
  private order: PublicKeyCriterion = new PublicKeyCriterion(8 + 32 + 32);

  constructor(program: Program) {
    this.program = program;
  }

  filterByPurchaser(purchaser: PublicKey): Trades {
    this.purchaser.setValue(purchaser);
    return this;
  }

  filterByMarket(market: PublicKey): Trades {
    this.market.setValue(market);
    return this;
  }

  filterByOrder(order: PublicKey): Trades {
    this.order.setValue(order);
    return this;
  }

  /**
   *
   * @returns {GetPublicKeys} list of all fetched trade publicKeys
   */
  async fetchPublicKeys(): Promise<ClientResponse<GetPublicKeys>> {
    const response = new ResponseFactory({} as GetPublicKeys);
    const connection = this.program.provider.connection;

    try {
      const accounts = await connection.getProgramAccounts(
        this.program.programId,
        {
          dataSlice: { offset: 0, length: 0 }, // fetch without any data.
          filters: toFilters("trade", this.purchaser, this.market, this.order),
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
   * @returns {TradeAccounts} fetched trade accounts mapped to their publicKey
   */
  async fetch(): Promise<ClientResponse<TradeAccounts>> {
    const response = new ResponseFactory({} as TradeAccounts);
    const accountPublicKeys = await this.fetchPublicKeys();

    if (!accountPublicKeys.success) {
      response.addErrors(accountPublicKeys.errors);
      return response.body;
    }

    try {
      const accountsWithData = (await this.program.account.trade.fetchMultiple(
        accountPublicKeys.data.publicKeys,
      )) as Trade[];

      const result = accountPublicKeys.data.publicKeys
        .map((accountPublicKey, i) => {
          return { publicKey: accountPublicKey, account: accountsWithData[i] };
        })
        .filter((o) => o.account);

      response.addResponseData({
        tradeAccounts: result,
      });
    } catch (e) {
      response.addError(e);
    }

    return response.body;
  }
}

/**
 * Get all trades owned by the program provider wallet
 *
 * @param program {program} anchor program initialized by the consuming client
 * @returns {TradeAccounts} fetched trade accounts mapped to their publicKey
 *
 * @example
 * const trades = await getTradesByStatusForProviderWallet(program)
 */
export async function getTradesForProviderWallet(
  program: Program,
): Promise<ClientResponse<TradeAccounts>> {
  const provider = program.provider as AnchorProvider;
  return await Trades.tradeQuery(program)
    .filterByPurchaser(provider.wallet.publicKey)
    .fetch();
}

/**
 * Get all trades for the given market account
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market
 * @returns {TradeAccounts} fetched trade accounts mapped to their publicKey
 *
 * @example
 * const marketPk = new PublicKey("5m5RyK82FQKNzMg3eDT5GY5KpbJQJhD4RhBHSG2ux4sk")
 * const trades = await getTradesByMarketForProviderWallet(program, marketPk)
 */
export async function getTradesForMarket(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<TradeAccounts>> {
  return await Trades.tradeQuery(program).filterByMarket(marketPk).fetch();
}

/**
 * Get all trades for the given order account
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param orderPk {PublicKey} publicKey of the order
 * @returns {TradeAccounts} fetched trade accounts mapped to their publicKey
 *
 * @example
 * const orderPk = new PublicKey("5m5RyK82FQKNzMg3eDT5GY5KpbJQJhD4RhBHSG2ux4sk")
 * const trades = await getTradesForOrder(program, orderPk)
 */
export async function getTradesForOrder(
  program: Program,
  orderPk: PublicKey,
): Promise<ClientResponse<TradeAccounts>> {
  return await Trades.tradeQuery(program).filterByOrder(orderPk).fetch();
}
