import { PublicKey } from "@solana/web3.js";

export interface MarketOutcomeAccount {
  index: number;
  title: string;
  market: PublicKey;
  prices: PublicKey | null;
  priceLadder: number[];
}
