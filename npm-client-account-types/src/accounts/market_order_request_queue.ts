import { PublicKey } from "@solana/web3.js";
import { default as BN } from "bn.js";

export interface MarketOrderRequestQueueAccount {
  market: PublicKey;
  orderRequests: OrderRequestQueue;
}

export interface OrderRequestQueue {
  empty: boolean;
  front: number;
  len: number;
  capacity: number;
  items: OrderRequest[];
}

export interface OrderRequest {
  purchaser: PublicKey;
  marketOutcomeIndex: number;
  forOutcome: boolean;
  product: PublicKey | null;
  stake: BN;
  expectedPrice: number;
  delayExpirationTimestamp: BN;
  productCommissionRate: number;
  distinctSeed: number[];
  creationTimestamp: BN;
  expiresOn: BN;
}
