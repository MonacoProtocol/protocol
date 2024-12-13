import { PublicKey } from "@solana/web3.js";
import { PendingOrders } from "./order";
import { GetAccount } from "./get_account";
import {
  MarketAccount,
  MarketMatchingPoolAccount,
  MarketOutcomeAccount,
  OrderAccount,
} from "@monaco-protocol/client-account-types";

export type MarketAccounts = {
  markets: GetAccount<MarketAccount>[];
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
  pendingOrders: GetAccount<OrderAccount>[];
  marketPrices: MarketPrice[];
};

export type MarketPricesAndPendingOrders = {
  market: MarketAccount;
} & MarketOutcomeAccounts &
  MarketPrices &
  PendingOrders;
