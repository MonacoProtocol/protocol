import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { web3 } from "@coral-xyz/anchor";

export type SignAndSendInstructionsResponse = {
  signature: web3.TransactionSignature;
};

export type SignAndSendInstructionsBatchResponse = {
  signatures: web3.TransactionSignature[];
  failedInstructions: TransactionInstruction[];
};

export type MarketInstructionResponse = {
  marketPk: PublicKey;
  instruction: TransactionInstruction;
};

export type MarketOutcomeInstructionResponse = {
  outcome: string;
  outcomePda: PublicKey;
  instruction: TransactionInstruction;
};

export type MarketOutcomesInstructionsResponse = {
  instructions: MarketInstructionResponse[];
};

export type TransactionOptions = {
  computeUnitLimit?: number;
  computeUnitPrice?: number;
};

export type TransactionOptionsBatch = TransactionOptions & {
  batchSize?: number;
};
