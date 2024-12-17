import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  ClientResponse,
  MarketOutcomeAccount,
  MarketOutcomeTitlesResponse,
  ResponseFactory,
} from "../types";
import { PublicKeyCriterion } from "./queries/filtering";
import { AccountQuery } from "./queries/account_query";
import { AccountQueryResult } from "../types/account_query";

/**
 * Base market outcome query builder allowing to filter by set fields. Returns publicKeys or accounts mapped to those publicKeys; filtered to remove any accounts closed during the query process.
 *
 * Some preset queries are available for convenience:
 * - getMarketOutcomesByMarket
 * - getMarketOutcomeTitlesByMarket
 *
 * @param program {program} anchor program initialized by the consuming client
 * @returns {GetPublicKeys || MarketOutcomeAccounts} publicKeys or accounts meeting query requirements filtered to remove any accounts closed during the query process
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOutcomes = await MarketOutcomes.marketOutcomeQuery(program)
 *      .filterByMarket(marketPk)
 *      .fetch();
 *
 * Returns all market outcomes created for the given market.
 */
export class MarketOutcomes extends AccountQuery<MarketOutcomeAccount> {
  public static marketOutcomeQuery(program: Program) {
    return new MarketOutcomes(program);
  }

  private market: PublicKeyCriterion = new PublicKeyCriterion(8);

  constructor(program: Program) {
    super(program, "MarketOutcome", (a, b) => (a.index > b.index ? 1 : -1));
    this.setFilterCriteria(this.market);
  }

  filterByMarket(market: PublicKey): MarketOutcomes {
    this.market.setValue(market);
    return this;
  }
}

/**
 * Get all market outcome accounts for the provided market.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market
 * @returns { MarketOutcomeAccounts } fetched market outcome accounts mapped to their publicKey - ordered by index
 *
 * @example
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOutcomes = await getMarketOutcomesByMarket(program, marketPk)
 */
export async function getMarketOutcomesByMarket(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<AccountQueryResult<MarketOutcomeAccount>>> {
  return await MarketOutcomes.marketOutcomeQuery(program)
    .filterByMarket(marketPk)
    .fetch();
}

/**
 * Get all market outcome titles for the provided market.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market
 * @returns { MarketOutcomeTitlesResponse } fetched market outcome titles - ordered by index
 *
 * @example
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOutcomeTitles = await getMarketOutcomeTitlesByMarket(program, marketPk)
 */
export async function getMarketOutcomeTitlesByMarket(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<MarketOutcomeTitlesResponse>> {
  const response = new ResponseFactory({});
  const result = [] as string[];

  const marketOutcomesResponse = await MarketOutcomes.marketOutcomeQuery(
    program,
  )
    .filterByMarket(marketPk)
    .fetch();

  if (!marketOutcomesResponse.success) {
    response.addErrors(marketOutcomesResponse.errors);
    return response.body;
  }

  const marketOutcomeAccounts = marketOutcomesResponse.data.accounts;
  marketOutcomeAccounts.forEach((marketOutcomeAccount) =>
    result.push(marketOutcomeAccount.account.title),
  );

  response.addResponseData({ marketOutcomeTitles: result });

  return response.body;
}
