import { PublicKey } from "@solana/web3.js";
import { GetAccount } from "./get_account";
import { TradeAccount } from "@monaco-protocol/client-account-types";

export type TradeAccounts = {
  tradeAccounts: GetAccount<TradeAccount>[];
};

export type CreateTradeResponse = {
  tradePk: PublicKey;
  tnxID: string | void;
};

export type TradePdaResponse = {
  tradePk: PublicKey;
  distinctSeed: Uint8Array;
};
