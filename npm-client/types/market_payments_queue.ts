import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GetAccount } from "./get_account";

export type MarketPaymentsQueueAccounts = {
  marketPaymentsQueues: GetAccount<MarketPaymentsQueueAccount>[];
};

export type MarketPaymentsQueueAccount = {
  market: PublicKey;
  paymentQueue: MarketPaymentsQueue;
};

export type MarketPaymentsQueue = {
  empty: boolean;
  front: number;
  len: number;
  items: PaymentInfo[];
};

export type PaymentInfo = {
  from: PublicKey;
  to: PublicKey;
  amount: BN;
};

export function toPaymentInfos(queue: MarketPaymentsQueue): PaymentInfo[] {
  const frontIndex = queue.front;
  const allItems = queue.items;
  const backIndex = frontIndex + (queue.len % queue.items.length);

  let queuedItems: PaymentInfo[] = [];
  if (queue.len > 0) {
    if (backIndex <= frontIndex) {
      // queue bridges array
      queuedItems = allItems
        .slice(frontIndex)
        .concat(allItems.slice(0, backIndex));
    } else {
      // queue can be treated as normal array
      queuedItems = allItems.slice(frontIndex, backIndex);
    }
  }
  return queuedItems;
}
