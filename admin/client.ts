import * as anchor from "@project-serum/anchor";
import { create_market, print_market } from "./create_market";
import { create_order } from "./create_order";
import {
  publish_market,
  settle_market,
  suspend_market,
  unpublish_market,
  unsuspend_market,
} from "./update_market_status";
import { print_market_liquidity } from "./market_liquidity";
import { dequeue_order, get_all_orders, print_order } from "./orders";
import { get_all_markets } from "./get_all_markets";
import {
  authoriseAdminOperator,
  authoriseOperator,
  printAuthorisedOperatorAccounts,
} from "./market_operator";
import { addPricesToLadder } from "./add_prices_to_ladder";
import { getTokenLeaderboard } from "./leaderboard/token_leaderboard";
import { getLeaderboardPerMarket } from "./leaderboard/market_leaderboard";

if (process.argv.length < 3) {
  printUsageAndExit();
}

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const script = process.argv[2];

switch (script) {
  case "get_all_markets":
    get_all_markets();
    break;
  case "create_market":
    create_market();
    break;
  case "print_market":
    print_market();
    break;
  case "settle_market":
    settle_market();
    break;
  case "publish_market":
    publish_market();
    break;
  case "unpublish_market":
    unpublish_market();
    break;
  case "suspend_market":
    suspend_market();
    break;
  case "unsuspend_market":
    unsuspend_market();
    break;
  case "print_market_liquidity":
    print_market_liquidity();
    break;
  case "get_all_orders":
    get_all_orders();
    break;
  case "print_order":
    print_order();
    break;
  case "create_order":
    create_order();
    break;
  case "authorise_operator":
    authoriseOperator();
    break;
  case "addPricesToLadder":
    addPricesToLadder();
    break;
  case "dequeueOrder":
    dequeue_order();
    break;
  case "getTokenLeaderboard":
    getTokenLeaderboard();
    break;
  case "getMarketLeaderboards":
    getLeaderboardPerMarket();
    break;
  case "authoriseAdminOperator":
    authoriseAdminOperator();
    break;
  case "printAuthorisedOperatorAccounts":
    printAuthorisedOperatorAccounts();
    break;
  default:
    printUsageAndExit();
}

function printUsageAndExit() {
  console.log(
    "Usage: yarn ts-node admin/client.ts <create_market | settle_market | publish_market | unpublish_market | suspend_market | unsuspend_market | print_market_liability | create_order | close_settled_orders> ...",
  );
  process.exit(1);
}
