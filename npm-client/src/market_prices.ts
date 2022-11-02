import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { Orders } from "./order_query";
import { getMarketOutcomeTitlesByMarket } from "./market_outcome_query";
import { getMarket } from "./markets";
import {
  findMarketMatchingPoolPda,
  getMarketMatchingPoolAccounts,
} from "./market_matching_pools";
import {
  OrderStatus,
  MarketPrice,
  MarketPrices,
  ClientResponse,
  ResponseFactory,
} from "../types";

/**
 * For the provided market publicKey return:
 *
 * - The market account
 * - The pending orders for the market (unmatched/partially matched orders)
 * - The market prices for the market
 *
 *  Market prices are all unique pending order combinations (OUTCOME, PRICE, FOR) and their corresponding matching pool accounts.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {MarketPrices} Market account, pending orders and marketPrices with matching pools
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketPrices = await getMarketPrices(program, marketPK)
 */
export async function getMarketPrices(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<MarketPrices>> {
  const response = new ResponseFactory({} as MarketPrices);
  const [matchedOrders, openOrders, market, marketOutcomeTitles] =
    await Promise.all([
      await new Orders(program)
        .filterByMarket(marketPk)
        .filterByStatus(OrderStatus.Matched)
        .fetch(),
      await new Orders(program)
        .filterByMarket(marketPk)
        .filterByStatus(OrderStatus.Open)
        .fetch(),
      await getMarket(program, marketPk),
      await getMarketOutcomeTitlesByMarket(program, marketPk),
    ]);

  if (!matchedOrders.success || !openOrders.success || !market.success) {
    response.addErrors(matchedOrders.errors);
    response.addErrors(openOrders.errors);
    response.addErrors(market.errors);
    return response.body;
  }

  const partiallyMatchedOrders = matchedOrders.data.orderAccounts.filter(
    (order) => order.account.stakeUnmatched.toNumber() > 0,
  );

  const pendingOrders = partiallyMatchedOrders.concat(
    openOrders.data.orderAccounts,
  );

  const marketPricesSet = new Set();
  pendingOrders.map((pendingOrder) => {
    const account = pendingOrder.account;

    const price = {
      marketOutcome:
        marketOutcomeTitles.data.marketOutcomeTitles[
          account.marketOutcomeIndex
        ],
      marketOutcomeIndex: account.marketOutcomeIndex,
      price: account.expectedPrice,
      forOutcome: account.forOutcome,
    };
    marketPricesSet.add(JSON.stringify(price));
  });

  const marketPrices = Array.from(marketPricesSet).map(function (price) {
    return JSON.parse(price as string) as MarketPrice;
  });

  const marketMatchingPoolPdas = [] as PublicKey[];
  await Promise.all(
    marketPrices.map(async function (price) {
      const matchingPoolPDA = await findMarketMatchingPoolPda(
        program,
        market.data.publicKey,
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

  response.addResponseData({
    market: market.data.account,
    pendingOrders: pendingOrders,
    marketPrices: marketPrices,
  });

  return response.body;
}
