import { Program, BorshAccountsCoder } from "@coral-xyz/anchor";
import { PublicKey, MemcmpFilter } from "@solana/web3.js";
import bs58 from "bs58";
import { Buffer } from "buffer";
import {
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
  GetAccount,
  MarketAccount,
  GetPublicKeys,
  MarketOutcomeAccount,
  MarketOutcomeAccounts,
  MarketOutcomeTitlesResponse,
} from "../types";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Mint, getMint } from "@solana/spl-token";

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
 * const marketTypePk = new PublicKey('f9cEhHopn2C9R4G6GaGakmUkCoBWmJ6c4YEArr83hYBWk')
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
 * For the provided spl-token, get the mint info for that token.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param mintPK {PublicKey} publicKey of an spl-token
 * @returns {MintInfo} mint information including mint authority and decimals
 *
 * @example
 *
 * const mintPk = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
 * const mintInfo = await getMintInfo(program, mintPk)
 */
export async function getMintInfo(
  program: Program,
  mintPK: PublicKey,
): Promise<ClientResponse<Mint>> {
  const response = new ResponseFactory({} as Mint);

  const provider = program.provider as AnchorProvider;
  try {
    const mintInfo = await getMint(provider.connection, mintPK);
    response.addResponseData(mintInfo);
  } catch (e) {
    response.addError(e);
  }

  return response.body;
}

/**
 * For the provided market publicKey, return the escrow account PDA (publicKey) for that market.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the escrow account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const escrowPda = await findEscrowPda(program, marketPK)
 */
export async function findEscrowPda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), marketPk.toBuffer()],
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
 * For the provided market publicKey, return the funding account PDA (publicKey) for that market.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the funding account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const fundingPda = await findMarketFundingPda(program, marketPK)
 */
export async function findMarketFundingPda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("funding"), marketPk.toBuffer()],
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
 * For the provided market publicKey, return the PDA (publicKey) of the market liquidities account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the market liquidities account
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
 * For the provided market publicKey, return the PDA (publicKey) of the market matching-queue account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the market matching-queue account
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketMatchingQueuePk = await findMarketMatchingQueuePda(program, marketPK)
 */
export async function findMarketMatchingQueuePda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);

  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("matching"), marketPk.toBuffer()],
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
 * For the provided market publicKey, return the commission-payment queue account PDA (publicKey) for that market.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the commission-payment queue
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketCommissionPaymentQueuePda = await findMarketCommissionPaymentQueuePda(program, marketPK)
 */
export async function findMarketCommissionPaymentQueuePda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("commission_payments"), marketPk.toBuffer()],
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
 * For the provided market publicKey, return the order request queue account PDA (publicKey) for that market.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {FindPdaResponse} PDA of the payment queue
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const orderRequestQueuePda = await findMarketOrderRequestQueuePda(program, marketPK)
 */
export async function findMarketOrderRequestQueuePda(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<FindPdaResponse>> {
  const response = new ResponseFactory({} as FindPdaResponse);
  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [Buffer.from("order_request"), marketPk.toBuffer()],
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
export class MarketOutcomes {
  public static marketOutcomeQuery(program: Program) {
    return new MarketOutcomes(program);
  }

  private program: Program;
  private _filter: MemcmpFilter[] = [];

  constructor(program: Program) {
    this.program = program;
    this._filter.push(
      this.toFilter(
        0,
        bs58.encode(BorshAccountsCoder.accountDiscriminator("market_outcome")),
      ),
    );
  }

  filterByMarket(market: PublicKey): MarketOutcomes {
    this._filter.push(this.toFilter(8, market.toBase58()));
    return this;
  }

  private toFilter(offset: number, bytes: string): MemcmpFilter {
    return { memcmp: { offset: offset, bytes: bytes } };
  }

  /**
   *
   * @returns {GetPublicKeys} list of all fetched market outcome publicKeys
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
      response.addResponseData({ publicKeys: publicKeys });
    } catch (e) {
      response.addError(e);
    }

    return response.body;
  }

  /**
   *
   * @returns {MarketOutcomeAccounts} fetched market outcome accounts mapped to their publicKey - ordered by index
   */
  async fetch(): Promise<ClientResponse<MarketOutcomeAccounts>> {
    const response = new ResponseFactory({} as MarketOutcomeAccounts);
    const accountPublicKeys = await this.fetchPublicKeys();

    if (!accountPublicKeys.success) {
      response.addErrors(accountPublicKeys.errors);
      return response.body;
    }

    try {
      const accountsWithData =
        (await this.program.account.marketOutcome.fetchMultiple(
          accountPublicKeys.data.publicKeys,
        )) as MarketOutcomeAccount[];

      const result = accountPublicKeys.data.publicKeys
        .map((accountPublicKey, i) => {
          return { publicKey: accountPublicKey, account: accountsWithData[i] };
        })
        .filter((o) => o.account);

      result.sort((a, b) => (a.account.index > b.account.index ? 1 : -1));

      response.addResponseData({ marketOutcomeAccounts: result });
    } catch (e) {
      response.addError(e);
    }
    return response.body;
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
): Promise<ClientResponse<MarketOutcomeAccounts>> {
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

  const marketOutcomeAccounts =
    marketOutcomesResponse.data.marketOutcomeAccounts;
  marketOutcomeAccounts.forEach((marketOutcomeAccount) =>
    result.push(marketOutcomeAccount.account.title),
  );

  response.addResponseData({ marketOutcomeTitles: result });

  return response.body;
}
