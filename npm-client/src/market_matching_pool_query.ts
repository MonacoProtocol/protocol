import {
  ClientResponse,
  GetPublicKeys,
  MarketMatchingPoolAccount,
  MarketMatchingPoolAccounts,
  ResponseFactory,
} from "../types";
import {
  BooleanCriterion,
  PublicKeyCriterion,
  toFilters,
  U16Criterion,
} from "./queries";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export class MarketMatchingPools {
  public static marketMatchingPoolQuery(program: Program) {
    return new MarketMatchingPools(program);
  }

  private program: Program;
  private market: PublicKeyCriterion = new PublicKeyCriterion(8);
  private marketOutcomeIndex: U16Criterion = new U16Criterion(8 + 32);
  private forOutcome: BooleanCriterion = new BooleanCriterion(8 + 32 + 2);

  constructor(program: Program) {
    this.program = program;
  }

  filterByMarket(market: PublicKey): MarketMatchingPools {
    this.market.setValue(market);
    return this;
  }

  filterByMarketOutcomeIndex(marketOutcomeIndex: number): MarketMatchingPools {
    this.marketOutcomeIndex.setValue(marketOutcomeIndex);
    return this;
  }

  filterByForOutcome(forOutcome: boolean): MarketMatchingPools {
    this.forOutcome.setValue(forOutcome);
    return this;
  }

  /**
   *
   * @returns {GetPublicKeys} list of all fetched market matching pool publicKeys
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
            "market_matching_pool",
            this.market,
            this.marketOutcomeIndex,
            this.forOutcome,
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
   * @returns {MarketMatchingPoolAccounts} fetched market matching pool accounts mapped to their publicKey - ordered by index
   */
  async fetch(): Promise<ClientResponse<MarketMatchingPoolAccounts>> {
    const response = new ResponseFactory({} as MarketMatchingPoolAccounts);
    const accountPublicKeys = await this.fetchPublicKeys();

    if (!accountPublicKeys.success) {
      response.addErrors(accountPublicKeys.errors);
      return response.body;
    }

    try {
      const accountsWithData =
        (await this.program.account.marketMatchingPool.fetchMultiple(
          accountPublicKeys.data.publicKeys,
          "confirmed",
        )) as MarketMatchingPoolAccount[];

      const result = accountPublicKeys.data.publicKeys
        .map((accountPublicKey, i) => {
          return { publicKey: accountPublicKey, account: accountsWithData[i] };
        })
        .filter((o) => o.account);

      response.addResponseData({ marketMatchingPools: result });
    } catch (e) {
      response.addError(e);
    }
    return response.body;
  }
}
