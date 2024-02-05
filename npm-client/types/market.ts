import { BN } from "@coral-xyz/anchor";
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
  readonly readyToVoid?: Record<string, never>;
  readonly voided?: Record<string, never>;
}

export interface MarketOrderBehaviour {
  none?: Record<string, never>;
  cancelUnmatched?: Record<string, never>;
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
  marketType: PublicKey;
  marketTypeDiscriminator: string;
  marketTypeValue: string;
  marketWinningOutcomeIndex?: number;
  mintAccount: PublicKey;
  published: boolean;
  suspended: boolean;
  title: string;
  inplay: boolean;
  inplayEnabled: boolean;
  inplayOrderDelay: number;
  eventStartOrderBehaviour: MarketOrderBehaviour;
  marketLockOrderBehaviour: MarketOrderBehaviour;
  eventStartTimestamp: BN;
  unsettledAccountsCount: number;
  unclosedAccountsCount: number;
  version: number;
};

export type MarketAccounts = {
  markets: GetAccount<MarketAccount>[];
};

export type MarketMatchingQueueAccount = {
  market: PublicKey;
  matches: MarketMatchingQueue;
};

export type MarketMatchingQueue = {
  front: number;
  len: number;
  items: MarketMatchingQueueOrderMatch[];
};

export type MarketMatchingQueueOrderMatch = {
  pk: PublicKey;
  purchaser: PublicKey;

  forOutcome: boolean;
  outcomeIndex: number;
  price: number;
  stake: number;
};

export type MarketMatchingPoolAccount = {
  market: PublicKey;
  inplay: boolean;
  forOutcome: boolean;
  marketOutcomeIndex: number;
  price: number;
  orders: {
    front: number;
    len: number;
    items: PublicKey[];
  };
  liquidityAmount: BN;
  matchedAmount: BN;
  payer: PublicKey;
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
  prices: PublicKey;
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
  marketOrderRequestQueuePda: PublicKey;
  marketOutcomePda: PublicKey;
  marketOutcomePoolPda: PublicKey;
  marketMatchingQueuePda: PublicKey;
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

export type MarketPaymentsQueueAccount = {
  market: PublicKey;
  paymentQueue: {
    front: number;
    len: number;
    items: PaymentInfo[];
  };
};

export type PaymentInfo = {
  from: PublicKey;
  to: PublicKey;
  amount: BN;
};
