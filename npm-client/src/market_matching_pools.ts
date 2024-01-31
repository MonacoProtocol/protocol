import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  ClientResponse,
  GetAccount,
  MarketAccount,
  MarketMatchingPoolAccount,
  MarketMatchingPoolAccounts,
  MarketMatchingPoolPublicKeysWithSeeds,
  MarketMatchingPoolPublicKeyWithSeeds,
  MarketMatchingPoolsWithSeeds,
  MarketMatchingPoolWithSeeds,
  ResponseFactory,
} from "../types";
import { FindPdaResponse } from "../types";
import { getMarketOutcomesByMarket } from "./market_outcome_query";
import { MarketMatchingPools } from "./market_matching_pool_query";

/**
 * For the provided market publicKey, outcome, price and forOutcome, return the PDA (publicKey) of the matching account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @param marketOutcomeIndex {number} index representing a market outcome
 * @param price {number} price for the matching pool
 * @param forOutcome {boolean} bool representing for or against a market outcome
 * @returns {FindPdaResponse} PDA of the market matching pool account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketOutcomeIndex = 0
 * const price = 1.5
 * const forOutcome = true
 * const marketMatchingPoolPda = await findMarketMatchingPoolPda(program, marketPK, marketOutcomeIndex, price, forOutcome)
 */
export async function findMarketMatchingPoolPda(
  program: Program,
  marketPk: PublicKey,
  marketOutcomeIndex: number,
  price: number,
  forOutcome: boolean,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  const priceDecimalPlaces = 3;
  const [pda, _] = await PublicKey.findProgramAddress(
    [
      marketPk.toBuffer(),
      Buffer.from(marketOutcomeIndex.toString()),
      Buffer.from("-"),
      Buffer.from(price.toFixed(priceDecimalPlaces).toString()),
      Buffer.from(forOutcome.toString()),
    ],
    program.programId,
  );

  response.addResponseData({
    pda: pda,
  });
  return response.body;
}

/**
 * For the provided market matching pool publicKey, return the market matching pool account details.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketMatchingPoolPk {PublicKey} publicKey of the market matching pool
 * @returns {GetAccount<MarketMatchingPoolAccount>} market matching pool account details
 *
 * @example
 *
 * const marketMatchingPoolPk = new PublicKey('DdBdS1EgatrdJXbqxVbZCzsErTXApyVyrJdaDGTiY56R')
 * const marketMatchingPool = await getMarketMatchingPool(program, marketMatchingPoolPk)
 */
export async function getMarketMatchingPool(
  program: Program,
  marketMatchingPoolPk: PublicKey,
): Promise<ClientResponse<GetAccount<MarketMatchingPoolAccount>>> {
  const response = new ResponseFactory(
    {} as GetAccount<MarketMatchingPoolAccount>,
  );
  try {
    const marketMatchingQueue = (await program.account.marketMatchingPool.fetch(
      marketMatchingPoolPk,
    )) as MarketMatchingPoolAccount;

    response.addResponseData({
      publicKey: marketMatchingPoolPk,
      account: marketMatchingQueue,
    });
  } catch (e) {
    response.addErrors([e]);
  }
  return response.body;
}

/**
 * For the provided marketMatchingPool PDAs, return the market matching pool accounts for those PDAs.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketMatchingPoolPDAs {PublicKey[]} PDAs of market matching pools
 * @returns {MarketMatchingPoolAccounts}
 *
 * @example
 *
 * const marketMatchingPoolPDA1 = new PublicKey('DdBdS1EgatrdJXbqxVbZCzsErTXApyVyrJdaDGTiY56R')
 * const marketMatchingPoolPDA2 = new PublicKey('3rTcT9Fe1xPM7x2iQKBPT6b6nPPuUWa9s2p3WxEMV1P1')
 * const marketMatchingPoolPDAs = [marketMatchingPoolPDA1, marketMatchingPoolPDA2]
 * const marketMatchingPools = await getMarketMatchingPoolAccounts(program, marketMatchingPoolPDAs)
 */
export async function getMarketMatchingPoolAccounts(
  program: Program,
  marketMatchingPoolPDAs: PublicKey[],
): Promise<ClientResponse<MarketMatchingPoolAccounts>> {
  const response = new ResponseFactory({} as MarketMatchingPoolAccounts);
  try {
    const matchingPools =
      (await program.account.marketMatchingPool.fetchMultiple(
        marketMatchingPoolPDAs,
      )) as MarketMatchingPoolAccount[];
    const result = marketMatchingPoolPDAs
      .map((pda, i) => {
        return { publicKey: pda, account: matchingPools[i] };
      })
      .filter((o) => o.account);
    response.addResponseData({ marketMatchingPools: result });
  } catch (e) {
    response.addErrors([e]);
  }
  return response.body;
}

/**
 * For the provided market, find any existing matching pools. Total number of matching pools can be
 * calculated as (number of prices * number of outcomes * 2). This also returns the seeds used to generate the PDA for
 * the matching pools.
 *
 * Note: due to the number of possible matching pools, caching this data is recommended for quick access
 *
 * @param program {Program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} public key of market
 * @returns {MarketMatchingPoolsWithSeeds} list of matching pool accounts
 *
 * @example
 *
 * const marketPk = new PublicKey("DdBdS1EgatrdJXbqxVbZCzsErTXApyVyrJdaDGTiY56R");
 * const matchingPools = await getAllMarketMatchingPools(program, marketPk);
 */
export async function getAllMarketMatchingPools(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<MarketMatchingPoolsWithSeeds>> {
  const response = new ResponseFactory({} as MarketMatchingPoolsWithSeeds);

  try {
    let marketMatchingPoolsWithSeeds =
      [] as GetAccount<MarketMatchingPoolWithSeeds>[];

    const query =
      MarketMatchingPools.marketMatchingPoolQuery(program).filterByMarket(
        marketPk,
      );

    const market = (await program.account.market.fetch(
      marketPk,
    )) as MarketAccount;

    for (let i = 0; i < market.marketOutcomesCount; i++) {
      const perOutcomeResponse = await query
        .filterByMarketOutcomeIndex(i)
        .fetch();

      if (!perOutcomeResponse.success) {
        console.log(`fail`);
        response.addErrors(perOutcomeResponse.errors);
        return response.body;
      }

      marketMatchingPoolsWithSeeds = marketMatchingPoolsWithSeeds.concat(
        perOutcomeResponse.data.marketMatchingPools.map((pool) => {
          return {
            publicKey: pool.publicKey,
            account: {
              marketMatchingPool: pool.account,
              seeds: {
                outcomeIndex: pool.account.marketOutcomeIndex.toString(),
                price: pool.account.price.toFixed(3).toString(),
                forOutcome: pool.account.forOutcome.toString(),
              },
            },
          };
        }),
      );
    }

    response.addResponseData({
      marketMatchingPoolsWithSeeds: marketMatchingPoolsWithSeeds,
    });
  } catch (e) {
    response.addErrors([e]);
  }

  return response.body;
}

/**
 * For the provided market, find all possible matching pool pda addresses. Total number of matching pools can be
 * calculated as (number of prices * number of outcomes * 2). This also returns the seeds used to generate the PDA for
 * the matching pools.
 *
 * @param program {Program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} public key of market
 * @returns {MarketMatchingPoolPublicKeysWithSeeds} list of PublicKeys
 *
 * @example
 *
 * const marketPk = new PublicKey("DdBdS1EgatrdJXbqxVbZCzsErTXApyVyrJdaDGTiY56R");
 * const matchingPoolPks = await findAllMarketMatchingPoolPks(program, marketPk);
 */
export async function findAllMarketMatchingPoolPks(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<MarketMatchingPoolPublicKeysWithSeeds>> {
  const response = new ResponseFactory(
    {} as MarketMatchingPoolPublicKeysWithSeeds,
  );

  try {
    const outcomeAccounts = await getMarketOutcomesByMarket(program, marketPk);
    if (outcomeAccounts.data.marketOutcomeAccounts.length == 0) {
      response.addResponseData({
        marketMatchingPoolPksWithSeeds: [],
      });
      return response.body;
    }
    const priceLadder =
      outcomeAccounts.data.marketOutcomeAccounts[0].account.priceLadder;
    const outcomes = outcomeAccounts.data.marketOutcomeAccounts.map(
      (outcome) => outcome.account.index,
    );

    const seedsMatrix: string[][] = [];
    for (const price of priceLadder) {
      for (const outcome of outcomes) {
        for (const forOutcome of [true, false]) {
          const seeds = [
            outcome.toString(),
            price.toFixed(3).toString(),
            forOutcome.toString(),
          ];
          seedsMatrix.push(seeds);
        }
      }
    }

    const marketMatchingPoolPksWithSeeds = await Promise.all(
      seedsMatrix.map(async (seeds) => {
        const [pda, _] = await PublicKey.findProgramAddress(
          [
            marketPk.toBuffer(),
            Buffer.from(seeds[0]), // outcome index
            Buffer.from("-"),
            Buffer.from(seeds[1]), // price
            Buffer.from(seeds[2]), // for outcome
          ],
          program.programId,
        );

        return {
          seeds: {
            outcomeIndex: seeds[0],
            price: seeds[1],
            forOutcome: seeds[2],
          },
          publicKey: pda,
        } as MarketMatchingPoolPublicKeyWithSeeds;
      }),
    );

    response.addResponseData({
      marketMatchingPoolPksWithSeeds: marketMatchingPoolPksWithSeeds,
    });
  } catch (e) {
    response.addErrors([e]);
  }

  return response.body;
}
