import { TransactionInstruction } from "@solana/web3.js";
import { web3 } from "@coral-xyz/anchor";

export type SignAndSendInstructionsResponse = {
  signature: web3.TransactionSignature;
};

export type SignAndSendInstructionsBatchResponse = {
  signatures: web3.TransactionSignature[];
  failedInstructions: TransactionInstruction[];
};
