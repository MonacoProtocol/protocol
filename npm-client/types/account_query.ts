import { AccountInfo, PublicKey } from "@solana/web3.js";

export type AccountResult<T> = {
  publicKey: PublicKey;
  accountInfo: AccountInfo<Buffer>;
  account: T;
};

export type AccountQueryResult<T> = {
  accounts: AccountResult<T>[];
  slot: number;
};
