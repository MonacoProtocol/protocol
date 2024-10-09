import { PublicKey } from "@solana/web3.js";
import { GetAccount } from "./account";
import { MarketOutcomeAccount } from "@monaco-protocol/client-account-types";

export type GetPublicKeys = {
  publicKeys: PublicKey[];
};

export type MarketOutcomeAccounts = {
  marketOutcomeAccounts: GetAccount<MarketOutcomeAccount>[];
};

export type MarketOutcomeTitlesResponse = {
  marketOutcomeTitles: string[];
};
