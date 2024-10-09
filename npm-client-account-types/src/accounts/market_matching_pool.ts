import { default as BN } from "bn.js";
import { PublicKey } from "@solana/web3.js";

export interface MarketMatchingPoolAccount {
  market: PublicKey;
  inplay: boolean;
  forOutcome: boolean;
  marketOutcomeIndex: number;
  price: number;
  orders: {
    front: number;
    len: number;
    items: PublicKey[];
  }
  liquidityAmount: BN;
  matchedAmount: BN;
  payer: PublicKey;
}
