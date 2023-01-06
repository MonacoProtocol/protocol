import { BN } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { Order } from "./order";
import { GetAccount } from "./get_account";

export enum MarketStatus {
  Initializing = 0x00,
  Open = 0x01,
  Locked = 0x02,
  ReadyForSettlement = 0x03,
  Settled = 0x04,
  ReadyToClose = 0x05,
}

export enum MarketType {
  EventResultFullTime = "EventResultFullTime",
  EventResultHalfTime = "EventResultHalfTime",
  EventResultBothSidesScore = "EventResultBothSidesScore",
  EventResultWinner = "EventResultWinner",
}

export type MarketAccount = {
  authority: BN;
  decimalLimit: number;
  escrowAccountBump: number;
  eventAccount: PublicKey;
  marketLockTimestamp: BN;
  marketOutcomesCount: number;
  marketSettleTimestamp?: null;
  marketStatus: MarketStatus;
  marketType: string;
  marketWinningOutcomeIndex?: number;
  mintAccount: PublicKey;
  published: boolean;
  suspended: boolean;
  title: string;
};

export type MarketAccounts = {
  markets: GetAccount<MarketAccount>[];
};

export type MarketMatchingPoolAccount = {
  orders: {
    front: number;
    len: number;
    items: PublicKey[];
  };
  liquidityAmount: BN;
  matchedAmount: BN;
  purchaser: PublicKey;
};

export type MarketMatchingPoolAccounts = {
  marketMatchingPools: GetAccount<MarketMatchingPoolAccount>[];
};

export type MarketOutcomeAccount = {
  index: number;
  title: string;
  market: PublicKey;
  latestMatchedPrice: number;
  matchedTotal: BN;
  priceLadder: number[];
};

export type MarketOutcomeAccounts = {
  marketOutcomeAccounts: GetAccount<MarketOutcomeAccount>[];
};

export type MarketOutcomeTitlesResponse = {
  marketOutcomeTitles: string[];
};

export type MarketAccountsForCreateOrder = {
  escrowPda: PublicKey;
  marketOutcomePda: PublicKey;
  marketOutcomePoolPda: PublicKey;
  marketPositionPda: PublicKey;
  market: MarketAccount;
};

export type MarketPrice = {
  marketOutcome: string;
  marketOutcomeIndex: number;
  price: number;
  forOutcome: boolean;
  matchingPoolPda: PublicKey;
  matchingPool: MarketMatchingPoolAccount;
};

export type MarketPrices = {
  market: MarketAccount;
  pendingOrders: Order[];
  marketPrices: MarketPrice[];
};
