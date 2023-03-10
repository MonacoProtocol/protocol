import { BN } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { Order, PendingOrders } from "./order";
import { GetAccount } from "./get_account";

export interface MarketStatus {
  readonly initializing?: Record<string, never>;
  readonly open?: Record<string, never>;
  readonly locked?: Record<string, never>;
  readonly readyForSettlement?: Record<string, never>;
  readonly settled?: Record<string, never>;
  readonly readyToClose?: Record<string, never>;
}

export enum MarketType {
  EventResultFullTime = "EventResultFullTime",
  EventResultHalfTime = "EventResultHalfTime",
  EventResultBothSidesScore = "EventResultBothSidesScore",
  EventResultWinner = "EventResultWinner",
}

export type MarketAccount = {
  authority: PublicKey;
  decimalLimit: number;
  escrowAccountBump: number;
  eventAccount: PublicKey;
  marketLockTimestamp: BN;
  marketOutcomesCount: number;
  marketSettleTimestamp?: BN;
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

export type MarketMatchingPoolsWithSeeds = {
  marketMatchingPoolsWithSeeds: GetAccount<MarketMatchingPoolWithSeeds>[];
};

export type MarketMatchingPoolWithSeeds = {
  seeds: MarketMatchingPoolSeeds;
  marketMatchingPool: MarketMatchingPoolAccount;
};

export type MarketMatchingPoolPublicKeysWithSeeds = {
  marketMatchingPoolPksWithSeeds: MarketMatchingPoolPublicKeyWithSeeds[];
};

export type MarketMatchingPoolPublicKeyWithSeeds = {
  seeds: MarketMatchingPoolSeeds;
  publicKey: PublicKey;
};

export type MarketMatchingPoolSeeds = {
  outcomeIndex: string;
  price: string;
  forOutcome: string;
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
  pendingOrders: GetAccount<Order>[];
  marketPrices: MarketPrice[];
};

export type MarketPricesAndPendingOrders = {
  market: MarketAccount;
} & MarketOutcomeAccounts &
  MarketPrices &
  PendingOrders;
