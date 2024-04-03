import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export type MarketMatchingQueueAccount = {
  market: PublicKey;
  matches: {
    front: number;
    len: number;
    items: MarketMatchingQueueOrderMatch[];
  };
};

export type MarketMatchingQueueOrderMatch = {
  pk: PublicKey;
  purchaser: PublicKey;

  forOutcome: boolean;
  outcomeIndex: number;
  price: number;
  stake: BN;
};
