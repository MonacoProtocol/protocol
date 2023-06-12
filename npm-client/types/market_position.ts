import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GetAccount } from "./get_account";

export type MarketPosition = {
  purchaser: PublicKey;
  market: PublicKey;
  paid: boolean;
  marketOutcomeSums: BN[];
  unmatchedExposures: BN[];
  outcomePositions: Map<string, BN>;
  payer: PublicKey;
  matchedRisk: BN;
  matchedRiskPerProduct: ProductMatchedRiskAndRate[];
};

export type MarketPositionAccounts = {
  marketPositionAccounts: GetAccount<MarketPosition>[];
};

export type ProductMatchedRiskAndRate = {
  product: PublicKey;
  risk: BN;
  rate: number;
};
