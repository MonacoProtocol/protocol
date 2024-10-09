import { GetAccount } from "./get_account";
import { MarketPositionAccount } from "@monaco-protocol/client-account-types";

export type MarketPositionAccounts = {
  marketPositionAccounts: GetAccount<MarketPositionAccount>[];
};
