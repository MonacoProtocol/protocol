import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  GetAccount,
  MarketLiquidities,
  MarketLiquiditiesAccounts,
} from "../types";
import { BooleanCriterion, toFilters } from "./queries";

/**
 * For the provided market publicKey, return the PDA (publicKey) of the market liquidities account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the market matching-queue account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketLiquiditiesPk = await findMarketLiquiditiesPda(program, marketPK)
 */
export async function findMarketLiquiditiesPda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);

  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("liquidities"), marketPk.toBuffer()],
      program.programId,
    );

    response.addResponseData({
      pda: pda,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

/**
 * For the provided market-liquidities publicKey, return the market-liquidities account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketLiquiditiesPk {PublicKey} publicKey of the market-liquidities
 * @returns {MarketLiquidities} market-liquidities account info
 *
 * @example
 *
 * const marketLiquiditiesPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketLiquidities = await getMarketLiquidities(program, marketLiquiditiesPk)
 */
export async function getMarketLiquidities(
  program: Program,
  marketLiquiditiesPk: PublicKey,
): Promise<ClientResponse<GetAccount<MarketLiquidities>>> {
  const response = new ResponseFactory({} as GetAccount<MarketLiquidities>);
  try {
    const marketLiquidities = (await program.account.marketLiquidities.fetch(
      marketLiquiditiesPk,
    )) as MarketLiquidities;

    response.addResponseData({
      publicKey: marketLiquiditiesPk,
      account: marketLiquidities,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

export async function getCrossMatchEnabledMarketLiquidities(
  program: Program,
): Promise<ClientResponse<MarketLiquiditiesAccounts>> {
  const response = new ResponseFactory({} as MarketLiquiditiesAccounts);
  const connection = program.provider.connection;

  try {
    const enableCrossMatchingFilter = new BooleanCriterion(8 + 32);
    enableCrossMatchingFilter.setValue(true);

    const accounts = await connection.getProgramAccounts(program.programId, {
      dataSlice: { offset: 0, length: 0 }, // fetch without any data.
      filters: toFilters("market_liquidities", enableCrossMatchingFilter),
    });
    const accountKeys = accounts.map((account) => account.pubkey);

    const accountsWithData =
      (await program.account.marketLiquidities.fetchMultiple(
        accountKeys,
      )) as MarketLiquidities[];

    const result = accountKeys
      .map((accountKey, i) => {
        return { publicKey: accountKey, account: accountsWithData[i] };
      })
      .filter((o) => o.account);

    response.addResponseData({ accounts: result });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}
