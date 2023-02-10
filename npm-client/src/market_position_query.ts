import { BorshAccountsCoder, Program } from "@project-serum/anchor";
import { MemcmpFilter, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  ClientResponse,
  GetPublicKeys,
  MarketPosition,
  MarketPositionAccounts,
  ResponseFactory,
} from "../types";
/**
 * Base market position query builder allowing to filter by set fields. Returns publicKeys or accounts mapped to those publicKeys; filtered to remove any accounts closed during the query process.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @returns {GetPublicKeys || MarketPositionAccounts} publicKeys or accounts meeting query requirements filtered to remove any accounts closed during the query process
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketPositions = await MarketPositions.marketPositionQuery(program)
 *      .filterByMarket(marketPk)
 *      .filterByPaid(false)
 *      .fetch();
 *
 * Returns all market positions created for the given market that have not yet been paid out.
 */
export class MarketPositions {
  public static marketPositionQuery(program: Program) {
    return new MarketPositions(program);
  }

  private program: Program;
  private _filter: MemcmpFilter[] = [];

  constructor(program: Program) {
    this.program = program;
    this._filter.push(
      this.toFilter(
        0,
        bs58.encode(BorshAccountsCoder.accountDiscriminator("market_position")),
      ),
    );
  }

  private toFilter(offset: number, bytes: string): MemcmpFilter {
    return { memcmp: { offset: offset, bytes: bytes } };
  }

  filterByPurchaser(purchaser: PublicKey): MarketPositions {
    this._filter.push(this.toFilter(8, purchaser.toBase58()));
    return this;
  }

  filterByMarket(market: PublicKey): MarketPositions {
    this._filter.push(this.toFilter(8 + 32, market.toBase58()));
    return this;
  }
  filterByPaid(paid: boolean): MarketPositions {
    this._filter.push(this.toFilter(8 + 32 + 32, bs58.encode([paid ? 1 : 0])));
    return this;
  }

  /**
   *
   * @returns {GetPublicKeys} list of all fetched market position publicKeys
   */
  async fetchPublicKeys(): Promise<ClientResponse<GetPublicKeys>> {
    const response = new ResponseFactory({} as GetPublicKeys);
    const connection = this.program.provider.connection;

    try {
      const accounts = await connection.getProgramAccounts(
        this.program.programId,
        {
          dataSlice: { offset: 0, length: 0 }, // fetch without any data.
          filters: this._filter,
        },
      );
      const publicKeys = accounts.map((account) => account.pubkey);
      response.addResponseData({
        publicKeys: publicKeys,
      });
    } catch (e) {
      response.addError(e);
    }

    return response.body;
  }

  /**
   *
   * @returns {MarketPositionAccounts} fetched market position accounts mapped to their publicKey
   */
  async fetch(): Promise<ClientResponse<MarketPositionAccounts>> {
    const response = new ResponseFactory({} as MarketPositionAccounts);
    const accountPublicKeys = await this.fetchPublicKeys();

    if (!accountPublicKeys.success) {
      response.addErrors(accountPublicKeys.errors);
      return response.body;
    }

    try {
      const accountsWithData =
        (await this.program.account.marketPosition.fetchMultiple(
          accountPublicKeys.data.publicKeys,
          "confirmed",
        )) as MarketPosition[];

      const result = accountPublicKeys.data.publicKeys
        .map((accountPublicKey, i) => {
          return { publicKey: accountPublicKey, account: accountsWithData[i] };
        })
        .filter((o) => o.account);

      response.addResponseData({
        marketPositionAccounts: result,
      });
    } catch (e) {
      response.addError(e);
    }

    return response.body;
  }
}
