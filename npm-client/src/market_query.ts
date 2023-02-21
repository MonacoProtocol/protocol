import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  ClientResponse,
  ResponseFactory,
  MarketAccounts,
  MarketAccount,
  GetPublicKeys,
  MarketStatus,
} from "../types";
import { PublicKeyCriterion, ByteCriterion, toFilters } from "./queries";

export class Markets {
  /**
   * Base market query builder allowing to filter by set fields. Returns publicKeys or accounts mapped to those publicKeys; filtered to remove any accounts closed during the query process.
   *
   * Some preset queries are available for convenience:
   * - getMarketAccountsByStatus
   * - getMarketAccountsByEvent
   * - getMarketAccountsByStatusAndMintAccount
   *
   * @param program {program} anchor program initialized by the consuming client
   * @returns {GetPublicKeys || MarketAccounts} publicKeys or accounts meeting query requirements filtered to remove any accounts closed during the query process
   *
   * @example
   *
   * const authorityPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
   * const eventPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
   * const markets = await Markets.marketQuery(program)
   *      .filterByAuthority(authorityPk)
   *      .filterByStatus(MarketStatus.Settled)
   *      .filterByEvent(eventPk)
   *      .fetch();
   *
   * Returns all markets created by the given authority, for the specified event, with a settled status.
   */
  public static marketQuery(program: Program) {
    return new Markets(program);
  }

  private program: Program;

  private authority: PublicKeyCriterion = new PublicKeyCriterion(8);
  private event: PublicKeyCriterion = new PublicKeyCriterion(8 + 32);
  private mintAccount: PublicKeyCriterion = new PublicKeyCriterion(8 + 32 + 32);
  private status: ByteCriterion = new ByteCriterion(8 + 32 + 32 + 32);

  constructor(program: Program) {
    this.program = program;
  }

  filterByAuthority(authority: PublicKey): Markets {
    this.authority.setValue(authority);
    return this;
  }

  filterByEvent(event: PublicKey): Markets {
    this.event.setValue(event);
    return this;
  }

  filterByMintAccount(mintAccount: PublicKey): Markets {
    this.mintAccount.setValue(mintAccount);
    return this;
  }

  filterByStatus(status: MarketStatus): Markets {
    this.status.setValue(status);
    return this;
  }

  /**
   *
   * @returns {GetPublicKeys} list of all fetched market publicKeys
   */
  async fetchPublicKeys(): Promise<ClientResponse<GetPublicKeys>> {
    const response = new ResponseFactory({} as GetPublicKeys);
    const connection = this.program.provider.connection;

    try {
      const accounts = await connection.getProgramAccounts(
        this.program.programId,
        {
          dataSlice: { offset: 0, length: 0 }, // fetch without any data.
          filters: toFilters(
            "market",
            this.authority,
            this.event,
            this.mintAccount,
            this.status,
          ),
        },
      );
      const publicKeys = accounts.map((account) => account.pubkey);
      response.addResponseData({ publicKeys: publicKeys });
    } catch (e) {
      response.addError(e);
    }

    return response.body;
  }

  /**
   *
   * @returns {MarketAccounts} fetched market accounts mapped to their publicKey
   */
  async fetch(): Promise<ClientResponse<MarketAccounts>> {
    const response = new ResponseFactory({} as MarketAccounts);
    const accountPublicKeys = await this.fetchPublicKeys();

    if (!accountPublicKeys.success) {
      response.addErrors(accountPublicKeys.errors);
      return response.body;
    }

    try {
      const accountsWithData = (await this.program.account.market.fetchMultiple(
        accountPublicKeys.data.publicKeys,
        "confirmed",
      )) as MarketAccount[];

      const result = accountPublicKeys.data.publicKeys
        .map((accountPublicKey, i) => {
          return { publicKey: accountPublicKey, account: accountsWithData[i] };
        })
        .filter((o) => o.account);

      response.addResponseData({ markets: result });
    } catch (e) {
      response.addError(e);
    }
    return response.body;
  }
}

/**
 * Get all market accounts for the provided market status.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param status {MarketStatus} status of the market, provided by the MarketStatus enum
 * @returns { MarketAccounts } fetched market accounts mapped to their publicKey
 *
 * @example
 * const status = MarketStatus.Open
 * const marketAccounts = await getMarketAccountsByStatus(program, status)
 */
export async function getMarketAccountsByStatus(
  program: Program,
  status: MarketStatus,
): Promise<ClientResponse<MarketAccounts>> {
  return await Markets.marketQuery(program).filterByStatus(status).fetch();
}

/**
 * Get all market accounts for the provided event publicKey.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param eventPk {PublicKey} publicKey of the event
 * @returns { MarketAccounts } fetched market accounts mapped to their publicKey
 *
 * @example
 * const eventPk = new PublicKey("EMBekXVLLKVxteFvme4tjUfruv8WvMCQkp5xydaLzDEP")
 * const marketAccounts = await getMarketAccountsByEvent(program, eventPk)
 */
export async function getMarketAccountsByEvent(
  program: Program,
  eventPk: PublicKey,
): Promise<ClientResponse<MarketAccounts>> {
  return await Markets.marketQuery(program).filterByEvent(eventPk).fetch();
}

/**
 * Get all market accounts for the provided market status and mint account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param status {MarketStatus} status of the market, provided by the MarketStatus enum
 * @param mintAccount {PublicKey} publicKey of the mint account
 * @returns {MarketAccounts} fetched market accounts mapped to their publicKey
 *
 * @example
 * const status = MarketStatus.Open
 * const mintAccount = new PublicKey("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")
 * const marketAccounts = await getMarketAccountsByStatusAndMintAccount(program, status, mintAccount)
 */
export async function getMarketAccountsByStatusAndMintAccount(
  program: Program,
  status: MarketStatus,
  mintAccount: PublicKey,
): Promise<ClientResponse<MarketAccounts>> {
  return await Markets.marketQuery(program)
    .filterByStatus(status)
    .filterByMintAccount(mintAccount)
    .fetch();
}
