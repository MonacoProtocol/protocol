import { PublicKey } from "@solana/web3.js";

export type ProductConfig = {
  authority: PublicKey;
  payer: PublicKey;
  commissionEscrow: PublicKey;
  productTitle: string;
  commissionRate: number;
};

export type CreateProductConfigResponse = {
  productConfigPk: PublicKey;
  tnxID: string | void;
};
