import { Program, AnchorProvider } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";

/**
 * Helper function to return a pda from the supplied seeds
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param seeds {(Buffer | Uint8Array)[]} list of seeds to generate the pda from
 * @returns {publicKey} pda constructed from the supplied seeds for the given program
 *
 * @example
 * const seed1 = Buffer.from("seed2")
 * const seed2 = Buffer.from("seed2")
 * const pda = await findPdaWithSeeds([seed1, seed2], program.programId)
 */
export async function findPdaWithSeeds(
  program: Program,
  seeds: (Buffer | Uint8Array)[],
): Promise<PublicKey | number> {
  const [pda] = await PublicKey.findProgramAddress(seeds, program.programId);
  return pda;
}

/**
 * Helper function to wait for the confirmation of a transaction
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param transactionId {string} string representation of the transaction ID to confirm
 * @returns (SignatureResult) null or error
 *
 * @example
 * const tnxId = "4aaXfPEgc6hcMiKMJAxZLv3QcjTAWPXrsyAswBJzXhoMn8bvViX8DMmmUx7gaNGWwnBnaky8SyJJrszyGZGAQjKC"
 * await confirmTransaction(program, tnxId)
 */
export async function confirmTransaction(
  program: Program,
  transactionId: string,
) {
  const provider = program.provider as AnchorProvider;
  await provider.connection.confirmTransaction(transactionId, "confirmed");
}
