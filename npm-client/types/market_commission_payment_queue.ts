import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GetAccount } from "./get_account";

export type MarketCommissionPaymentQueues = {
  marketCommissionPaymentQueues: GetAccount<MarketCommissionPaymentQueue>[];
};

export type MarketCommissionPaymentQueue = {
  market: PublicKey;
  commissionPayments: CommissionPaymentQueue;
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

export function toCommissionPayments(
  marketCommissionPaymentQueue: MarketCommissionPaymentQueue,
): CommissionPayment[] {
  const commissionPayments = marketCommissionPaymentQueue.commissionPayments;
  const frontIndex = commissionPayments.front;
  const allItems = commissionPayments.items;
  const backIndex =
    frontIndex + (commissionPayments.len % commissionPayments.items.length);

  let queuedItems: CommissionPayment[] = [];
  if (commissionPayments.len > 0) {
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
