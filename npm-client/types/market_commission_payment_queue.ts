import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GetAccount } from "./get_account";

export type MarketCommissionPaymentQueues = {
  marketPaymentQueues: GetAccount<MarketCommissionPaymentQueue>[];
};

export type MarketCommissionPaymentQueue = {
  market: PublicKey;
  payments: CommissionPaymentQueue;
};

export type CommissionPaymentQueue = {
  empty: boolean;
  front: number;
  len: number;
  items: CommissionPayment[];
};

export type CommissionPayment = {
  from: PublicKey;
  to: PublicKey;
  amount: BN;
};

export function toPayments(
  marketCommissionPaymentQueue: MarketCommissionPaymentQueue,
): CommissionPayment[] {
  const payments = marketCommissionPaymentQueue.payments;
  const frontIndex = payments.front;
  const allItems = payments.items;
  const backIndex = frontIndex + (payments.len % payments.items.length);

  let queuedItems: CommissionPayment[] = [];
  if (payments.len > 0) {
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
