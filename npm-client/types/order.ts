import { PublicKey } from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import { GetAccount } from "./get_account";

export enum OrderStatus {
  Open = 0x00,
  Matched = 0x01,
  SettledWin = 0x02,
  SettledLose = 0x03,
  Cancelled = 0x04,
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
  stake: BN;
  voidedStake: BN;
  expectedPrice: number;
  creationTimestamp: BN;
  stakeUnmatched: BN;
  payout: BN;
  matches: Match[];
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
