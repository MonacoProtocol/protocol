import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GetAccount } from "./get_account";

export type MarketMatchingQueues = {
  marketMatchingQueues: GetAccount<MarketMatchingQueue>[];
};

export type MarketMatchingQueue = {
  market: PublicKey;
  matches: MatchingQueue;
};

export type MatchingQueue = {
  empty: boolean;
  front: number;
  len: number;
  items: OrderMatch[];
};

export type OrderMatch = {
  pk: PublicKey;
  purchaser: PublicKey;

  forOutcome: boolean;
  outcomeIndex: number;
  price: number;
  stake: BN;
};
