import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GetAccount } from "./get_account";

export type MarketOrderRequestQueues = {
  marketOrderRequestQueues: GetAccount<MarketOrderRequestQueue>[];
};

export type MarketOrderRequestQueue = {
  market: PublicKey;
  orderRequests: OrderRequestQueue;
};

export type OrderRequestQueue = {
  empty: boolean;
  front: number;
  len: number;
  capacity: number;
  items: OrderRequest[];
};

export type OrderRequest = {
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
};
