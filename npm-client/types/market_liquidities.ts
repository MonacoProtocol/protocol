import { GetAccount } from "./get_account";
import { MarketLiquiditiesAccount } from "@monaco-protocol/client-account-types";

export type MarketLiquiditiesAccounts = {
  accounts: GetAccount<MarketLiquiditiesAccount>[];
};
