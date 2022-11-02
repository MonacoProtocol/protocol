import { PublicKey } from "@solana/web3.js";
import { Program, BN } from "@project-serum/anchor";
import { MarketPosition } from "../types";
import { ClientResponse, ResponseFactory, FindPdaResponse } from "../types";
import { getMarketOutcomeTitlesByMarket } from "./market_outcome_query";

/**
 * For the provided market publicKey and purchaser wallet publicKey, return the PDA (publicKey) of that wallets market position account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @param purchaserPk {PublicKey} publicKey of the purchasing wallet
 * @returns {PublicKey} PDA of the market position for the supplied purchaser wallet
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const purchaserPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
 * const marketPositionPda = await findMarketPositionPda(program, marketPK, purchaserPk)
 */
export async function findMarketPositionPda(
  program: Program,
  marketPk: PublicKey,
  purchaserPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  const [pda, _] = await PublicKey.findProgramAddress(
    [purchaserPk.toBuffer(), marketPk.toBuffer()],
    program.programId,
  );
  response.addResponseData({
    pda: pda,
  });
  return response.body;
}

/**
 * For the provided wallet publicKey and market publicKey, return the market position account of that wallet.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @param purchaserPk {PublicKey} publicKey of the purchasing wallet
 * @returns {MarketPosition} market position account info
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const purchaserPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
 * const marketPosition = await getMarketPosition(program, marketPK, purchaserPk)
 */
export async function getMarketPosition(
  program: Program,
  marketPk: PublicKey,
  purchaserPk: PublicKey,
): Promise<ClientResponse<MarketPosition>> {
  const response = new ResponseFactory({} as MarketPosition);

  let marketPosition = {} as MarketPosition;
  let marketOutcomeTitles = [] as string[];

  try {
    const marketPositionPda = await findMarketPositionPda(
      program,
      marketPk,
      purchaserPk,
    );

    if (!marketPositionPda.success) {
      response.addErrors(marketPositionPda.errors);
      return response.body;
    }

    marketPosition = (await program.account.marketPosition.fetch(
      marketPositionPda.data.pda,
    )) as MarketPosition;

    const marketOutcomeTitlesResponse = await getMarketOutcomeTitlesByMarket(
      program,
      marketPk,
    );

    if (!marketOutcomeTitlesResponse.success) {
      response.addErrors(marketOutcomeTitlesResponse.errors);
      return response.body;
    }

    marketOutcomeTitles = marketOutcomeTitlesResponse.data.marketOutcomeTitles;
  } catch (e) {
    response.addError(e);
    return response.body;
  }

  marketPosition.outcomePositions = new Map<string, BN>();
  marketPosition.marketOutcomeSums.forEach(
    (marketOutcomeSum: BN, index: number) => {
      marketPosition.outcomePositions.set(
        marketOutcomeTitles[index],
        marketOutcomeSum,
      );
    },
  );

  response.addResponseData(marketPosition);

  return response.body;
}
