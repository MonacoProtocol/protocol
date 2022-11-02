import { BN } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";

export type MarketMatchingPool = {
  purchaser: PublicKey;
  liquidityAmount: BN;
  matchedAmount: BN;
  orders: Cirque;
};

export type Cirque = {
  front: number;
  len: number;
  items: PublicKey[];
};
