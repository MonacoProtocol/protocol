import { GetAccount } from "./get_account";
import { MarketMatchingQueueAccount } from "@monaco-protocol/client-account-types";

export type MarketMatchingQueues = {
  marketMatchingQueues: GetAccount<MarketMatchingQueueAccount>[];
};
