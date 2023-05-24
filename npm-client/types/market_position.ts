import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GetAccount } from "./get_account";

export type MarketPosition = {
  purchaser: PublicKey;
  market: PublicKey;
  paid: boolean;
  marketOutcomeSums: BN[];
  outcomeMaxExposure: BN[];
  outcomePositions: Map<string, BN>;
  payer: PublicKey;
};

export type MarketPositionAccounts = {
  marketPositionAccounts: GetAccount<MarketPosition>[];
};
