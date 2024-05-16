import { PublicKey, TransactionInstruction } from "@solana/web3.js";
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
  product: PublicKey | null;
  stake: BN;
  voidedStake: BN;
  expectedPrice: number;
  creationTimestamp: BN;
  stakeUnmatched: BN;
  payout: BN;
  payer: PublicKey;
  productCommissionRate: number;
};

export type OrderInstructionResponse = {
  orderPk: PublicKey;
  instruction: TransactionInstruction;
};

export type OrderInstructionsResponse = {
  orderInstructions: OrderInstructionResponse[];
};

export type PendingOrders = {
  pendingOrders: GetAccount<Order>[];
};

export type OrderAccounts = {
  orderAccounts: GetAccount<Order>[];
};

export type OrderTransactionResponse = {
  orderPk: PublicKey;
  tnxID: string | void;
};

export type CancelOrdersResponse = {
  failedCancellationOrders: PublicKey[];
  tnxIDs: string[];
};

export type orderPdaResponse = {
  orderPk: PublicKey;
  distinctSeed: Uint8Array;
};

export type StakeInteger = {
  stakeInteger: BN;
};
