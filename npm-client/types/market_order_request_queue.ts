import { GetAccount } from "./get_account";
import { MarketOrderRequestQueueAccount } from "@monaco-protocol/client-account-types";

export type MarketOrderRequestQueues = {
  marketOrderRequestQueues: GetAccount<MarketOrderRequestQueueAccount>[];
};
