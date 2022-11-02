import { PublicKey } from "@solana/web3.js";

export type AccountData<Account> = {
  publicKey: PublicKey;
  account: Account;
};

export type GetAccount<Account> = AccountData<Account>;

export type GetAccounts<Account> = AccountData<Account>[];

export type GetPublicKeys = {
  publicKeys: PublicKey[];
};
