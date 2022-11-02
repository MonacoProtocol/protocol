import { PublicKey, TokenAmount } from "@solana/web3.js";

export type GetWalletTokenAccountResponse = {
  tokenMint: PublicKey;
  associatedTokenAccount: PublicKey;
};

export type GetWalletTokenAccountsResponse = {
  accounts: GetWalletTokenAccountResponse[];
};

export type GetWalletBalanceResponse = {
  token: string;
  balance: TokenAmount;
};

export type GetWalletBalancesResponse = {
  balances: GetWalletBalanceResponse[];
};
