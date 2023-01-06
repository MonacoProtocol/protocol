import { PublicKey } from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import { GetAccount } from "./get_account";

export type MarketPosition = {
  purchaser: PublicKey;
  market: PublicKey;
  marketOutcomeSums: BN[];
  outcomeMaxExposure: BN[];
  offset: BN;
  outcomePositions: Map<string, BN>;
};

export type MarketPositionAccounts = {
  marketPositionAccounts: GetAccount<MarketPosition>[];
};
