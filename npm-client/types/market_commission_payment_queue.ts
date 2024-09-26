import { GetAccount } from "./get_account";
import { MarketCommissionPaymentQueueAccount } from "@monaco-protocol/client-account-types";

export type MarketCommissionPaymentQueues = {
  marketCommissionPaymentQueues: GetAccount<MarketCommissionPaymentQueueAccount>[];
};
