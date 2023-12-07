import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export type MarketMatchingPool = {
  market: PublicKey;
  marketOutcomeIndex: number;
  forOutcome: boolean;
  price: number;
  payer: PublicKey;
  liquidityAmount: BN;
  matchedAmount: BN;
  inplay: boolean;
  orders: Cirque;
};

export type Cirque = {
  front: number;
  len: number;
  items: PublicKey[];
};
