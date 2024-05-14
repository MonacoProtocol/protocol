import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

export type MarketMatchingQueueAccount = {
  market: PublicKey;
  matches: MarketMatchingQueue;
};

export type MarketMatchingQueue = {
  empty: boolean;
  front: number;
  len: number;
  items: MarketMatchingQueueOrderMatch[];
};

export type MarketMatchingQueueOrderMatch = {
  pk: PublicKey;
  purchaser: PublicKey;

  forOutcome: boolean;
  outcomeIndex: number;
  price: number;
  stake: BN;
};
