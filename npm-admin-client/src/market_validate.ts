import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { getMarketOutcomesByMarket } from "./npm-client-duplicates";
import {
  ClientResponse,
  ResponseFactory,
  GetAccount,
  MarketOutcomeAccount,
  ValidateMarketResponse,
  ValidateMarketOutcomePriceLadder,
  ValidateMarketOutcomeTitles,
} from "../types";

/**
 * For the given market account, validate that all expected outcomes exist on that market and that all outcomes have the expected price ladder
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey}
 * @param expectedOutcomeTitles {string[]} list of expected outcomes for the market
 * @param expectedPriceLadder {number[]} array of price points expected on each outcome
 * @returns {ValidateMarketResponse} Summary of the validity of the market for the given parameters, including a break down of any missing or additional outcomes or prices on the price ladders in relation to the expected and returned outcomes and price ladders
 *
 * @example
 *
 * const marketPk = new PublicKey('6KVA6wF9FwkjX2Ej1sdwX4TrsJ6MFnDwKv5D8njf1fmm')
 * const expectedOutcomes = ["Red", "Draw", "Blue"]
 * const priceLadder = DEFAULT_PRICE_LADDER
 * const validateMarket = validateMarketOutcomes(program, marketPk, expectedOutcomes, expectedPriceLadder)
 */
export async function validateMarketOutcomes(
  program: Program,
  marketPk: PublicKey,
  expectedOutcomeTitles: string[],
  expectedPriceLadder: number[],
): Promise<ClientResponse<ValidateMarketResponse>> {
  const response = new ResponseFactory({} as ValidateMarketResponse);
  const outcomesResponse = await getMarketOutcomesByMarket(program, marketPk);
  if (!outcomesResponse.success) {
    response.addErrors(outcomesResponse.errors);
    return response.body;
  }
  const outcomeTitlesOnMarket = outcomesResponse.data.marketOutcomeAccounts.map(
    (market) => market.account.title,
  );
  const validatedTitles = validateOutcomeTitles(
    outcomeTitlesOnMarket,
    expectedOutcomeTitles,
  );
  response.addResponseData(validatedTitles);

  const outcomeValidation = [] as ValidateMarketOutcomePriceLadder[];
  const outcomeAccounts = outcomesResponse.data.marketOutcomeAccounts;
  for (const outcomeAccount of outcomeAccounts) {
    outcomeValidation.push(
      validateOutcomePriceLadder(outcomeAccount, expectedPriceLadder),
    );
  }
  const priceLaddersValidation = new Set();
  outcomeValidation.map((outcome) => {
    priceLaddersValidation.add(outcome.priceLadderValid);
  });
  const priceLaddersValid =
    priceLaddersValidation.has(true) && priceLaddersValidation.size === 1;

  response.addResponseData({
    priceLaddersValid: priceLaddersValid,
    marketValid: validatedTitles.outcomesValid && priceLaddersValid,
    priceLadderValidation: outcomeValidation,
  });

  return response.body;
}

function validateOutcomeTitles(
  outcomeTitlesOnMarket: string[],
  expectedOutcomeTitles: string[],
): ValidateMarketOutcomeTitles {
  let outcomesValid = true;
  const missingOutcomes = [] as string[];
  const additionalOutcomes = [] as string[];
  for (const expectedOutcomeTitle of expectedOutcomeTitles) {
    if (!outcomeTitlesOnMarket.includes(expectedOutcomeTitle)) {
      outcomesValid = false;
      missingOutcomes.push(expectedOutcomeTitle);
    }
  }
  for (const outcomeTitle of outcomeTitlesOnMarket) {
    if (!expectedOutcomeTitles.includes(outcomeTitle)) {
      outcomesValid = false;
      additionalOutcomes.push(outcomeTitle);
    }
  }
  return {
    outcomesValid: outcomesValid,
    missingOutcomes: missingOutcomes,
    additionalOutcomes: additionalOutcomes,
  };
}

function validateOutcomePriceLadder(
  outcome: GetAccount<MarketOutcomeAccount>,
  expectedPriceLadder: number[],
): ValidateMarketOutcomePriceLadder {
  let priceLadderValid = true;
  const missingPrices = [] as number[];
  const additionalPrices = [] as number[];
  const outcomePk = outcome.publicKey;
  const priceLadder = outcome.account.priceLadder;
  for (const expectedPrice of expectedPriceLadder) {
    if (!priceLadder.includes(+expectedPrice)) {
      priceLadderValid = false;
      missingPrices.push(+expectedPrice);
    }
  }
  for (const price of priceLadder) {
    if (!expectedPriceLadder.includes(+price)) {
      priceLadderValid = false;
      additionalPrices.push(+price);
    }
  }
  return {
    priceLadderValid: priceLadderValid,
    outcomePk: outcomePk,
    missingPrices: missingPrices,
    additionalPrices: additionalPrices,
  };
}
