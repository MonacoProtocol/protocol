import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider, getProvider, Program } from "@coral-xyz/anchor";
import { getMint } from "@solana/spl-token";
import { Buffer } from "buffer";
import process from "process";

const PROGRAM_TYPE = {
  release: new PublicKey("monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih"),
  edge: new PublicKey("mpDEVnZKneBb4w1vQsoTgMkNqnFe1rwW8qjmf3NsrAU"),
};

export async function getProtocolProgram() {
  const provider = getAnchorProvider();

  let programId = process.env.PROGRAM_ADDRESS;
  if (programId == undefined) {
    const program = process.env.PROGRAM_TYPE;
    if (program == undefined) {
      console.log("Please ensure PROGRAM_TYPE variable is set <release|edge>");
      process.exit(1);
      return;
    }

    // TODO need to support other clusters here too, e.g., localnet
    programId = PROGRAM_TYPE[program.toLowerCase()];
    if (programId == undefined) {
      console.log(`Program id not found for PROGRAM_TYPE ${program}`);
      process.exit(1);
      return;
    }
  }

  return Program.at(programId, provider);
}

export function getAnchorProvider(): AnchorProvider {
  return getProvider() as AnchorProvider;
}

export async function getMintInfo(mintPK: PublicKey) {
  return await getMint(getAnchorProvider().connection, mintPK);
}

export async function findMarketOutcomePoolPda(
  marketAccount: PublicKey,
  marketOutcome: string,
  price: number,
  forOutcome: boolean,
  protocolProgram: Program,
) {
  const [pda, _] = await PublicKey.findProgramAddress(
    [
      marketAccount.toBuffer(),
      Buffer.from(marketOutcome),
      Buffer.from(price.toFixed(3).toString()),
      Buffer.from(forOutcome.toString()),
    ],
    protocolProgram.programId,
  );
  return pda;
}

export async function findMarketOutcomePda(
  marketPda: PublicKey,
  marketOutcomeIndex: number,
  protocolProgram: Program,
) {
  const [pda, _] = await PublicKey.findProgramAddress(
    [marketPda.toBuffer(), Buffer.from(marketOutcomeIndex.toString())],
    protocolProgram.programId,
  );
  return pda;
}

export async function batchProcessInstructions(
  instructions: any[],
  batchSize = 5,
) {
  const provider = getAnchorProvider();

  let processedInstructions = 0;
  let instructionBatch = [] as TransactionInstruction[];
  for (let i = 0; i < instructions.length; i++) {
    const instruction = instructions[i];
    instructionBatch.push(instruction);

    // BATCH LIMIT REACHED - SEND TRANSACTION
    if (instructionBatch.length == batchSize || i == instructions.length - 1) {
      const transaction = new Transaction();

      instructionBatch.forEach((instruction) => transaction.add(instruction));

      transaction.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      transaction.feePayer = provider.wallet.publicKey;

      try {
        const signedTx = await provider.wallet.signTransaction(transaction);
        const tx = await provider.connection.sendRawTransaction(
          signedTx.serialize(),
        );
        processedInstructions += instructionBatch.length;
        console.log(
          `Processed ${processedInstructions} / ${instructions.length} instructions - ${tx}`,
        );
      } catch (error) {
        console.error(
          `Exception while batch processing instructions ${JSON.stringify(
            instructionBatch,
          )}: `,
          error,
        );
      }
      instructionBatch = [];
    }
  }
}

export function checkResponse(response: {
  success: boolean;
  errors: object[];
}) {
  if (!response.success) {
    console.error(JSON.stringify(response.errors, null, 2));
  }
}
