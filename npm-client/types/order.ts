import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { GetAccount } from "./get_account";
import { OrderAccount } from "@monaco-protocol/client-account-types";

export type OrderInstructionResponse = {
  orderPk: PublicKey;
  instruction: TransactionInstruction;
};

export type OrderInstructionsResponse = {
  orderInstructions: OrderInstructionResponse[];
};

export type PendingOrders = {
  pendingOrders: GetAccount<OrderAccount>[];
};

export type OrderAccounts = {
  orderAccounts: GetAccount<OrderAccount>[];
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
