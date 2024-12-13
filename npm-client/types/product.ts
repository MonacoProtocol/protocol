import { PublicKey } from "@solana/web3.js";
import { GetAccount } from "./get_account";
import { ProductAccount } from "@monaco-protocol/client-account-types";

export type CreateProductResponse = {
  productPk: PublicKey;
  tnxID: string | void;
};

export type ProductAccounts = {
  productAccounts: GetAccount<ProductAccount>[];
};
