import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export type MarketMatchingPool = {
  market: PublicKey;
  marketOutcomeIndex: number;
  price: number;
  forOutcome: boolean;
  payer: PublicKey;
  liquidityAmount: BN;
  matchedAmount: BN;
  inplay: boolean;
  orders: Cirque;
};

export type QueueItem = {
  order: PublicKey;
  delayExpirationTimestamp: BN;
  liquidityToAdd: BN;
};

export type Cirque = {
  front: number;
  len: number;
  items: QueueItem[];
};
