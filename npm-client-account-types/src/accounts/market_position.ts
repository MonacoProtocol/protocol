import { PublicKey } from "@solana/web3.js";
import { default as BN } from "bn.js";

export interface MarketPositionAccount {
  purchaser: PublicKey;
  market: PublicKey;
  paid: boolean;
  marketOutcomeSums: BN[];
  unmatchedExposures: BN[];
  outcomePositions: Map<string, BN>;
  payer: PublicKey;
  matchedRisk: BN;
  matchedRiskPerProduct: ProductMatchedRiskAndRate[];
}

export interface ProductMatchedRiskAndRate {
  product: PublicKey;
  risk: BN;
  rate: number;
}
