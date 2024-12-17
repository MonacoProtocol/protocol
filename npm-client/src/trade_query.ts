import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { ClientResponse, Trade } from "../types";
import { PublicKeyCriterion } from "./queries/filtering";
import { AccountQuery } from "./queries/account_query";
import { AccountQueryResult } from "../types/account_query";

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
export class Trades extends AccountQuery<Trade> {
  public static tradeQuery(program: Program) {
    return new Trades(program);
  }

  private purchaser: PublicKeyCriterion = new PublicKeyCriterion(8);
  private market: PublicKeyCriterion = new PublicKeyCriterion(8 + 32);
  private order: PublicKeyCriterion = new PublicKeyCriterion(8 + 32 + 32);

  constructor(program: Program) {
    super(program, "Trade");
    this.setFilterCriteria(this.purchaser, this.market, this.order);
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
): Promise<ClientResponse<AccountQueryResult<Trade>>> {
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
): Promise<ClientResponse<AccountQueryResult<Trade>>> {
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
): Promise<ClientResponse<AccountQueryResult<Trade>>> {
  return await Trades.tradeQuery(program).filterByOrder(orderPk).fetch();
}
