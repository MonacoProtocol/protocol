import { PublicKey } from "@solana/web3.js";
import { GetAccount } from "./get_account";

export type Product = {
  authority: PublicKey;
  payer: PublicKey;
  commissionEscrow: PublicKey;
  productTitle: string;
  commissionRate: number;
};

export type CreateProductResponse = {
  productPk: PublicKey;
  tnxID: string | void;
};

export type ProductAccounts = {
  productAccounts: GetAccount<Product>[];
};
