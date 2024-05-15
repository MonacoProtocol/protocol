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
