import { PublicKey } from "@solana/web3.js";
import { default as BN } from "bn.js";

export interface TradeAccount {
  purchaser: PublicKey;
  market: PublicKey;
  order: PublicKey;
  marketOutcomeIndex: number;
  forOutcome: boolean;
  stake: BN;
  price: number;
  creationTimestamp: BN;
  payer: PublicKey;
}
