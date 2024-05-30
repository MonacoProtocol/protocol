import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  GetAccount,
  MarketAccount,
  MarketAccounts,
} from "../types";

/**
 * For the provided event publicKey, market type and mint publicKey return a Program Derived Address (PDA). This PDA is used for market creation.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param eventPk {PublicKey} publicKey of an event
 * @param marketTypePk {PublicKey} publicKey of the market type
 * @param marketTypeDiscriminator {string} discriminator of the market type
 * @param marketTypeValue {string} value of the market type
 * @param mintPk {PublicKey} publicKey of the currency token
 * @param version {number} (Optional) version of the market, defaults to 0
 * @returns {FindPdaResponse} publicKey (PDA) and the seed used to generate it
 *
 * @example
 *
 * const eventPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketTypePk =  new PublicKey('n2C9R4G6GaPwFAxaNWM33DoBWmZtBBDFZf9cWM3xaNW')
 * const marketTypeDiscriminator = null;
 * const marketTypeValue = null;
 * const mintPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
 * const marketPda = await findMarketPda(program, eventPk, marketTypePk, marketTypeDiscriminator, marketTypeValue, mintPk)
 */
export async function findMarketPda(
  program: Program,
  eventPk: PublicKey,
  marketTypePk: PublicKey,
  marketTypeDiscriminator: string | null,
  marketTypeValue: string | null,
  mintPk: PublicKey,
  version = 0,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);

  try {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        eventPk.toBuffer(),
        marketTypePk.toBuffer(),
        marketTypeDiscriminator == null
          ? Buffer.from([])
          : Buffer.from(marketTypeDiscriminator),
        Buffer.from("␞"),
        marketTypeValue == null
          ? Buffer.from([])
          : Buffer.from(marketTypeValue),
        Buffer.from("␞"),
        Buffer.from(version.toString()),
        mintPk.toBuffer(),
      ],
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
 * For the provided market publicKey, get the market account details.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of the market
 * @returns {MarketAccount} market account details
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const market = await getMarket(program, marketPK)
 */
export async function getMarket(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<GetAccount<MarketAccount>>> {
  const response = new ResponseFactory({} as GetAccount<MarketAccount>);
  try {
    const market = (await program.account.market.fetch(
      marketPk,
    )) as MarketAccount;
    response.addResponseData({
      publicKey: marketPk,
      account: market,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

/**
 * For the provided list of market publicKeys, get the market account details for each.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPks {PublicKey} publicKey of a market
 * @returns {MarketAccounts} list of market account details
 *
 * @example
 *
 * const marketPk1 = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketPk2 = new PublicKey('4JKcFnuBRH8YDnJDHqAn4MTQhCCqAHywB8hTceu4bc2h')
 * const marketPks = [marketPk1, marketPk2]
 * const markets = await getMarkets(program, marketPks)
 */
export async function getMarkets(
  program: Program,
  marketPks: PublicKey[],
): Promise<ClientResponse<MarketAccounts>> {
  const response = new ResponseFactory({} as MarketAccounts);

  const markets = await Promise.all(
    marketPks.map(async function (marketPk) {
      const market = await getMarket(program, marketPk);
      if (market.success) {
        return market.data;
      } else {
        response.addErrors(market.errors);
      }
    }),
  );

  response.addResponseData({
    markets: markets,
  });
  return response.body;
}
