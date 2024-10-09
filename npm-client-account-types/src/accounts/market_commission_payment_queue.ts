import { PublicKey } from "@solana/web3.js";
import { default as BN } from "bn.js";

export interface MarketCommissionPaymentQueueAccount {
  market: PublicKey;
  paymentQueue: CommissionPaymentQueue;
}

export interface CommissionPaymentQueue {
  empty: boolean;
  front: number;
  len: number;
  items: CommissionPayment[];
}

export interface CommissionPayment {
  from: PublicKey;
  to: PublicKey;
  amount: BN;
}
