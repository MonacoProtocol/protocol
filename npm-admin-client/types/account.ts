import { PublicKey } from "@solana/web3.js";

export type AccountData<Account> = {
  publicKey: PublicKey;
  account: Account;
};

export type GetAccount<Account> = AccountData<Account>;
