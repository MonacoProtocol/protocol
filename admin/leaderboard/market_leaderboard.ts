import {
  AccountData,
  Order,
  Orders,
  OrderStatusFilter,
  MarketAccount,
} from "../../npm-client/src";
import { checkEnumValue, fetchTokenData, numberAsPnlString } from "./util";
import { KNOWN_WALLETS } from "./data";
import { getProtocolProgram } from "../util";

type MarketLeaderboardRowItem = {
  owner: string;
  totalMatchedLiability: string;
  wins: number;
  losses: number;
  pnl: string;
  pnlPercentage: string;
};

export async function getLeaderboardPerMarket() {
  const program = await getProtocolProgram();

  // get all orders for settled markets
  const winningOrdersResponse = await new Orders(program)
    .filterByStatus(OrderStatusFilter.SettledWin)
    .fetch();
  const losingOrdersResponse = await new Orders(program)
    .filterByStatus(OrderStatusFilter.SettledLose)
    .fetch();

  const winningOrders = winningOrdersResponse.data.orderAccounts;
  const losingOrders = losingOrdersResponse.data.orderAccounts;
  const leaderboardOrders = winningOrders.concat(losingOrders);

  // retrieve unique markets
  const uniqueMarkets: Map<string, MarketAccount> = new Map();
  await Promise.all(
    leaderboardOrders.map(async (order) => {
      try {
        uniqueMarkets.set(
          order.account.market.toBase58(),
          (await program.account.market.fetch(
            order.account.market,
          )) as MarketAccount,
        );
      } catch (e) {
        return; // discard invalid markets
      }
    }),
  );

  // construct leaderboards for markets
  const tokenData = await fetchTokenData();
  for (const market of uniqueMarkets.keys()) {
    constructMarketLeaderboard(
      leaderboardOrders,
      market,
      tokenData,
      uniqueMarkets,
    );
  }
}

function constructMarketLeaderboard(
  leaderboardOrders: AccountData<Order>[],
  market: string,
  tokenData,
  uniqueMarkets: Map<string, MarketAccount>,
) {
  // get orders for this market
  const ordersForMarket: Order[] = leaderboardOrders
    .filter((order) => order.account.market.toBase58() == market)
    .map((order) => order.account);
  if (ordersForMarket.length == 0) {
    return;
  }

  // map orders by purchaser
  const ordersByPurchaser: Map<string, Order[]> = new Map();
  for (const order of ordersForMarket) {
    const orders = ordersByPurchaser.get(order.purchaser.toBase58());

    if (orders == undefined) {
      ordersByPurchaser.set(order.purchaser.toBase58(), [order]);
    } else {
      orders.push(order);
      ordersByPurchaser.set(order.purchaser.toBase58(), orders);
    }
  }

  // calculate leaderboard stats per purchaser
  const marketLeaderboardItems: MarketLeaderboardRowItem[] = [];
  for (const purchaser of ordersByPurchaser.keys()) {
    const purchaserOrders = ordersByPurchaser.get(purchaser);

    // calculate total stats from each of the purchaser's orders
    let totalStakeMatched = 0;
    let totalStakeReturn = 0;
    let winCount = 0;
    let lossCount = 0;

    for (const order of purchaserOrders) {
      const stake = order.stake / Math.pow(10, tokenData.decimals);
      const voidedStake = order.voidedStake / Math.pow(10, tokenData.decimals);
      const payout = order.payout / Math.pow(10, tokenData.decimals);

      const orderMatchedStake = stake - voidedStake;
      totalStakeMatched += orderMatchedStake;

      if (checkEnumValue(order.orderStatus, "settledWin")) {
        winCount += 1;
        totalStakeReturn += payout;
      } else if (checkEnumValue(order.orderStatus, "settledLose")) {
        lossCount += 1;
        totalStakeReturn -= orderMatchedStake;
      }
    }

    const leaderboardRowItem = buildMarketLeaderboardRowItem(
      winCount,
      lossCount,
      totalStakeReturn,
      totalStakeMatched,
      purchaser,
    );
    marketLeaderboardItems.push(leaderboardRowItem);
  }

  // sort by net profit and loss
  marketLeaderboardItems.sort((a, b) => {
    function getValueFromStr(s: string) {
      return parseFloat(s.replace("+", ""));
    }
    return getValueFromStr(b.pnl) - getValueFromStr(a.pnl);
  });

  console.log(
    `\nLeaderboard for market ${uniqueMarkets.get(market).title} - ${market}`,
  );
  console.table(marketLeaderboardItems);
}

function buildMarketLeaderboardRowItem(
  winCount: number,
  lossCount: number,
  totalReturn: number,
  totalStakeMatched: number,
  purchaser: string,
) {
  const hasSettledOrders = winCount > 0 || lossCount > 0;
  const pnl =
    totalReturn >= totalStakeMatched
      ? totalReturn - totalStakeMatched
      : totalReturn;
  const pnlPercentage = hasSettledOrders ? (pnl / totalStakeMatched) * 100 : 0;
  const pnlUI = hasSettledOrders ? pnl : 0;

  return {
    owner: KNOWN_WALLETS.has(purchaser)
      ? KNOWN_WALLETS.get(purchaser)
      : purchaser.replace(purchaser.substring(4, 40), "..."),
    totalMatchedLiability: totalStakeMatched.toFixed(2),
    wins: winCount,
    losses: lossCount,
    pnl: numberAsPnlString(pnlUI),
    pnlPercentage: `${numberAsPnlString(pnlPercentage)}%`,
  } as MarketLeaderboardRowItem;
}
