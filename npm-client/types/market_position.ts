import { PublicKey } from "@solana/web3.js";
import { BN } from "@project-serum/anchor";

export type MarketPosition = {
  purchaser: PublicKey;
  market: PublicKey;
  marketOutcomeSums: BN[];
  marketOutcomeUnmatchedSums: BN[];
  offset: BN;
  outcomePositions: Map<string, BN>;
};
