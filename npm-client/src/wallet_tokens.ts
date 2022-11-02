import { PublicKey, LAMPORTS_PER_SOL, TokenAmount } from "@solana/web3.js";
import { AnchorProvider, Program } from "@project-serum/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  ClientResponse,
  GetWalletBalanceResponse,
  GetWalletBalancesResponse,
  ResponseFactory,
  GetWalletTokenAccountResponse,
  GetWalletTokenAccountsResponse,
} from "../types";

/**
 * Get the SOL balance for the provided program provider wallet, returned as the same format as token accounts.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @returns {GetWalletBalanceResponse} SOL balances for program providers wallet matching token account responses, including value adjusted for lamports
 *
 * @example
 *
 * const balance = await getSolBalance(program)
 */
async function getSolBalance(
  program: Program,
): Promise<ClientResponse<GetWalletBalanceResponse>> {
  const response = new ResponseFactory({} as GetWalletBalancesResponse);

  const provider = program.provider as AnchorProvider;
  try {
    const sol = await provider.connection.getBalance(provider.wallet.publicKey);
    const solValue = sol / LAMPORTS_PER_SOL;

    response.addResponseData({
      token: "solana",
      balance: {
        amount: sol.toString(),
        decimals: 9,
        uiAmount: solValue,
        uiAmountString: solValue.toString(),
      },
    });
  } catch (e) {
    response.addError(e);
  }

  return response.body;
}

/**
 * For the provided spl-token publicKey, get the token account for the program provider wallet.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param tokenMint {PublicKey} publicKey of the spl-token
 * @returns {GetWalletTokenAccountResponse} token account publicKey for the provided wallet and the provided tokenAccountPK
 *
 * @example
 *
 * const mintPk = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
 * const walletTokenAccount = await getWalletTokenAccount(program, mintPk)
 */
export async function getWalletTokenAccount(
  program: Program,
  tokenMint: PublicKey,
): Promise<ClientResponse<GetWalletTokenAccountResponse>> {
  const response = new ResponseFactory({} as GetWalletTokenAccountResponse);

  const provider = program.provider as AnchorProvider;
  try {
    const tokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      provider.wallet.publicKey,
    );
    response.addResponseData({
      tokenMint: tokenMint,
      associatedTokenAccount: tokenAccount,
    });
  } catch (e) {
    response.addError(e);
  }

  return response.body;
}

/**
 * For the provided list of spl-token publicKeys, get the associated spl-token account for the program provider wallet.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param tokenMints {PublicKey[]} publicKeys of spl-tokens
 * @returns {GetWalletTokenAccountsResponse} token account publicKeys for the provided wallet and the provided tokenAccountPKs
 *
 * @example
 *
 * const mintPk1 = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
 * const mintPk2 = new PublicKey('DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ')
 * const mintPks = [mintPk1, mintPk2]
 * const walletTokenAccounts = await getWalletTokenAccounts(program, mintPks)
 */
export async function getWalletTokenAccounts(
  program: Program,
  tokenMints: PublicKey[],
): Promise<ClientResponse<GetWalletTokenAccountsResponse>> {
  const response = new ResponseFactory({} as GetWalletTokenAccountsResponse);

  const tokenAccounts = [] as GetWalletTokenAccountResponse[];
  await Promise.all(
    tokenMints.map(async function (tokenMint) {
      const tokenAccount = await getWalletTokenAccount(program, tokenMint);
      if (tokenAccount.success) {
        tokenAccounts.push(tokenAccount.data);
      } else {
        response.addErrors(tokenAccount.errors);
      }
    }),
  );

  response.addResponseData({ accounts: tokenAccounts });

  return response.body;
}

/**
 * For the provided token account get the spl-token balance for that account; if no account is found, returns zero amounts.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param associatedTokenAccount {PublicKey} associatedTokenAccount for a wallet
 * @returns {TokenAmount} balance of the supplied token account; if no account is found, returns zero amounts
 *
 * @example
 *
 * const tokenAccount = new PublicKey('2Q1EYJVMDCqHULsS2nKdpYjq8isdqhXRTutnuB9YPh5z')
 * const walletTokenBalance = await getWalletTokenBalance(program, tokenAccount)
 */
async function getWalletTokenBalance(
  program: Program,
  associatedTokenAccount: PublicKey,
): Promise<ClientResponse<TokenAmount>> {
  const response = new ResponseFactory({} as TokenAmount);

  const provider = program.provider as AnchorProvider;
  let tokenBalance = {} as TokenAmount;
  try {
    const balance = await provider.connection.getTokenAccountBalance(
      associatedTokenAccount,
    );
    tokenBalance = balance.value;
  } catch (e) {
    tokenBalance = {
      amount: "0",
      decimals: 0,
      uiAmount: 0,
      uiAmountString: "0",
    } as TokenAmount;
  }

  response.addResponseData(tokenBalance);

  return response.body;
}

/**
 * For the provided wallet token accounts get the spl-token balances for those accounts.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param walletTokenAccounts {GetWalletTokenAccountsResponse} list of wallet token account object containing the publicKey of spl-token accounts
 * @returns {WalletTokenBalance[]} balances of the supplied token accounts, if no account is found, returns zero amounts
 *
 * @example
 *
 * const mintPk1 = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
 * const mintPk2 = new PublicKey('DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ')
 * const mintPks = [mintPk1, mintPk2]
 * const walletTokenAccounts = await getWalletTokenAccounts(program, mintPks)
 * const walletTokenBalances = await getWalletTokenBalances(program, walletTokenAccounts)
 */
async function getWalletTokenBalances(
  program: Program,
  walletTokenAccounts: GetWalletTokenAccountsResponse,
): Promise<ClientResponse<GetWalletBalancesResponse>> {
  const response = new ResponseFactory({} as GetWalletBalancesResponse);

  const balances = await Promise.all(
    walletTokenAccounts.accounts.map(async function (walletTokenAccount) {
      try {
        const balanceResponse = await getWalletTokenBalance(
          program,
          walletTokenAccount.associatedTokenAccount,
        );
        return {
          token: walletTokenAccount.tokenMint.toString(),
          balance: balanceResponse.data,
        };
      } catch (e) {
        response.addError(e);
        return {} as GetWalletBalanceResponse;
      }
    }),
  );

  response.addResponseData({
    balances: balances,
  });

  return response.body;
}

/**
 * For the provided token publicKeys, return their balances and SOL balance of the program provider wallet; if no account is found, returns zero amounts.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param tokenMints {PublicKey[]} publicKeys of spl-tokens
 * @returns {GetWalletBalancesResponse} balances of the supplied token accounts and SOL account; if no account is found, returns zero amounts
 *
 * @example
 *
 * const mintPk1 = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
 * const mintPk2 = new PublicKey('DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ')
 * const mintPks = [mintPk1, mintPk2]
 * const walletBalances = await getWalletTokenBalancesWithSol(program, mintPks)
 */
export async function getWalletTokenBalancesWithSol(
  program: Program,
  tokenMints: PublicKey[],
): Promise<ClientResponse<GetWalletBalancesResponse>> {
  const response = new ResponseFactory({} as GetWalletBalancesResponse);

  const walletTokenAccounts = await getWalletTokenAccounts(program, tokenMints);
  const [balances, solBalance] = await Promise.all([
    getWalletTokenBalances(program, walletTokenAccounts.data),
    getSolBalance(program),
  ]);

  const allBalances = [] as GetWalletBalanceResponse[];

  if (balances.success) {
    allBalances.push(...balances.data.balances);
  } else {
    response.addErrors(balances.errors);
  }

  if (solBalance.success) {
    allBalances.push(solBalance.data);
  } else {
    response.addErrors(solBalance.errors);
  }

  response.addResponseData({
    balances: allBalances,
  });

  return response.body;
}
