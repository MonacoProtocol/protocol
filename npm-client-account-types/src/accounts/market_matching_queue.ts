import { PublicKey } from "@solana/web3.js";
import { default as BN } from "bn.js";

export interface MarketMatchingQueueAccount {
  market: PublicKey;
  matches: MatchingQueue;
}

export interface MatchingQueue {
  empty: boolean;
  front: number;
  len: number;
  items: OrderMatch[];
}

export interface OrderMatch {
  pk: PublicKey;
  purchaser: PublicKey;
  forOutcome: boolean;
  outcomeIndex: number;
  price: number;
  stake: BN;
}
