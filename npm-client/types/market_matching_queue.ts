import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GetAccount } from "./get_account";

export type MarketMatchingQueueAccounts = {
  marketMatchingQueues: GetAccount<MarketMatchingQueueAccount>[];
};

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
