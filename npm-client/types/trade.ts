import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GetAccount } from "./get_account";

export type Trade = {
  purchaser: PublicKey;
  market: PublicKey;
  order: PublicKey;
  marketOutcomeIndex: number;
  forOutcome: boolean;
  stake: BN;
  price: number;
  creationTimestamp: BN;
  payer: PublicKey;
};

export type TradeAccounts = {
  tradeAccounts: GetAccount<Trade>[];
};

export type CreateTradeResponse = {
  tradePk: PublicKey;
  tnxID: string | void;
};

export type TradePdaResponse = {
  tradePk: PublicKey;
  distinctSeed: Uint8Array;
};
