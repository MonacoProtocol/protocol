import { PublicKey } from "@solana/web3.js";

export interface ProductAccount {
  authority: PublicKey;
  payer: PublicKey;
  commissionEscrow: PublicKey;
  productTitle: string;
  commissionRate: number;
}
