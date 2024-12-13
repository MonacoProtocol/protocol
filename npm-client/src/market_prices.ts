import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getMarketOutcomesByMarket } from "./market_outcome_query";
import { getMarket } from "./markets";
import {
  findMarketMatchingPoolPda,
  getMarketMatchingPoolAccounts,
} from "./market_matching_pools";
import {
  MarketPrice,
  MarketPrices,
  MarketPricesAndPendingOrders,
  ClientResponse,
  ResponseFactory,
  GetAccount,
} from "../types";
import { getPendingOrdersForMarket } from "./order";
import { OrderAccount } from "@monaco-protocol/client-account-types";

/**
 * For the provided market publicKey return:
 *
 * - The market account
 * - The pending orders for the market (unmatched/partially matched orders)
 * - The market prices for the market
 *
 *  Market prices are all unique pending order combinations (OUTCOME, PRICE, FOR) and their corresponding matching pool accounts.
 *
 *  Note that this is an intensive request the larger the market in terms of outcomes and pending orders.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {MarketPricesAndPendingOrders} Market account, pending orders and marketPrices with matching pools
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketPrices = await getMarketPrices(program, marketPK)
 */
export async function getMarketPrices(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<MarketPricesAndPendingOrders>> {
  const response = new ResponseFactory({} as MarketPricesAndPendingOrders);
  const [pendingOrdersResponse, market, marketOutcomes] = await Promise.all([
    getPendingOrdersForMarket(program, marketPk),
    getMarket(program, marketPk),
    getMarketOutcomesByMarket(program, marketPk),
  ]);

  if (!market.success || !marketOutcomes.success) {
    response.addErrors(market.errors);
    response.addErrors(marketOutcomes.errors);
    return response.body;
  }

  const pendingOrders = pendingOrdersResponse.data.pendingOrders;
  const marketOutcomeTitles = marketOutcomes.data.marketOutcomeAccounts.map(
    (market) => market.account.title,
  );

  const marketPrices = await getMarketPricesWithMatchingPoolsFromOrders(
    program,
    marketPk,
    pendingOrders,
    marketOutcomeTitles,
  );

  response.addResponseData({
    market: market.data.account,
    pendingOrders: pendingOrders,
    marketPrices: marketPrices.data.marketPrices,
    marketOutcomeAccounts: marketOutcomes.data.marketOutcomeAccounts,
  });

  return response.body;
}

/**
 * For the provided market publicKey, orders, and market outcome titles, return:
 *
 * - The market prices for the market mapped to the outcome titles
 *
 *  Market prices are all unique pending order combinations (OUTCOME, PRICE, FOR) and their corresponding matching pool accounts.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @param orders {GetAccount<Order>[]} list of orders obtained through an Orders query
 * @param marketOutcomeTitles {string[]} ordered list of the market outcome titles obtained through `getMarketOutcomesByMarket` or `getMarketOutcomeTitlesByMarket`
 * @returns {MarketPrices} marketPrices with matching pools mapped to outcome titles
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const pendingOrders = await getPendingOrdersForMarket(program, marketPk)
 * const marketTitles = await getMarketOutcomeTitlesByMarket(program, marketPk)
 * const marketPrices = await getMarketPricesWithMatchingPoolsFromOrders(program, marketPk, pendingOrders.data.pendingOrders, marketTitles.data.marketOutcomeTitles)
 */
export async function getMarketPricesWithMatchingPoolsFromOrders(
  program: Program,
  marketPk: PublicKey,
  orders: GetAccount<OrderAccount>[],
  marketOutcomeTitles: string[],
): Promise<ClientResponse<MarketPrices>> {
  const response = new ResponseFactory({} as MarketPrice);
  const marketPrices = marketPricesFromOrders(orders, marketOutcomeTitles);
  const marketMatchingPoolPdas = [] as PublicKey[];
  await Promise.all(
    marketPrices.map(async function (price) {
      const matchingPoolPDA = await findMarketMatchingPoolPda(
        program,
        marketPk,
        price.marketOutcomeIndex,
        price.price,
        price.forOutcome,
      );
      if (!matchingPoolPDA.success) {
        response.addErrors(matchingPoolPDA.errors);
      } else {
        price.matchingPoolPda = matchingPoolPDA.data.pda;
        marketMatchingPoolPdas.push(matchingPoolPDA.data.pda);
      }
    }),
  );

  const marketMatchingPoolAccounts = await getMarketMatchingPoolAccounts(
    program,
    marketMatchingPoolPdas,
  );

  if (!marketMatchingPoolAccounts.success) {
    response.addErrors(marketMatchingPoolAccounts.errors);
    return response.body;
  }

  marketPrices.map((price) => {
    const matchingPool =
      marketMatchingPoolAccounts.data.marketMatchingPools.find(
        (matchingPool) => matchingPool.publicKey === price.matchingPoolPda,
      );
    if (matchingPool) {
      price.matchingPool = matchingPool.account;
    }
  });

  response.addResponseData({ marketPrices: marketPrices });

  return response.body;
}

/**
 * Internal helper function to filter a list of orders to return all the unique market price combinations of:
 *
 * - Outcome index
 * - Price
 * - forOutcome
 *
 * This also maps the outcome titles to the unique prices for accessability.
 *
 * @param orders {GetAccount<Order>[]} list of orders obtained through an Orders query
 * @param marketOutcomeTitles {string[]} ordered list of the market outcome titles obtained through `getMarketOutcomesByMarket` or `getMarketOutcomeTitlesByMarket`
 * @returns {MarketPrice[]} list of unique market price combinations
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const pendingOrders = await getPendingOrdersForMarket(program, marketPk)
 * const marketTitles = await getMarketOutcomeTitlesByMarket(program, marketPk)
 * const marketPrices = await getMarketPrices(program, pendingOrders.data.pendingOrders, marketTitles.data.marketOutcomeTitles)
 */
function marketPricesFromOrders(
  orders: GetAccount<OrderAccount>[],
  marketOutcomeTitles: string[],
): MarketPrice[] {
  const marketPricesSet = new Set();
  orders.map((order) => {
    const account = order.account;

    const price = {
      marketOutcome: marketOutcomeTitles[account.marketOutcomeIndex],
      marketOutcomeIndex: account.marketOutcomeIndex,
      price: account.expectedPrice,
      forOutcome: account.forOutcome,
    };
    marketPricesSet.add(JSON.stringify(price));
  });

  const marketPrices = Array.from(marketPricesSet).map(function (price) {
    return JSON.parse(price as string) as MarketPrice;
  });

  return marketPrices;
}
