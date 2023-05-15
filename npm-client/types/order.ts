import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GetAccount } from "./get_account";

export interface OrderStatus {
  readonly open?: Record<string, never>;
  readonly matched?: Record<string, never>;
  readonly settledWin?: Record<string, never>;
  readonly settledLose?: Record<string, never>;
  readonly cancelled?: Record<string, never>;
  readonly voided?: Record<string, never>;
}

export type Match = {
  price: number;
  stake: number;
};

export type Order = {
  purchaser: PublicKey;
  market: PublicKey;
  marketOutcomeIndex: number;
  forOutcome: boolean;
  orderStatus: OrderStatus;
  product: PublicKey;
  stake: BN;
  voidedStake: BN;
  expectedPrice: number;
  creationTimestamp: BN;
  delayExpirationTimestamp: BN;
  stakeUnmatched: BN;
  payout: BN;
  payer: PublicKey;
};

export type PendingOrders = {
  pendingOrders: GetAccount<Order>[];
};

export type OrderAccounts = {
  orderAccounts: GetAccount<Order>[];
};

export type CreateOrderResponse = {
  orderPk: PublicKey;
  tnxID: string | void;
};

export type CancelOrderResponse = {
  orderPk: PublicKey;
  tnxID: string;
};

export type CancelOrdersResponse = {
  failedCancellationOrders: PublicKey[];
  tnxIDs: string[];
};

export type orderPdaResponse = {
  orderPk: PublicKey;
  distinctSeed: string;
};

export type StakeInteger = {
  stakeInteger: BN;
};
