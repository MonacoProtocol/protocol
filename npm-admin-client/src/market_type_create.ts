import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  ClientResponse,
  ResponseFactory,
  GetOrCreateAccountResponse,
  FindPdaResponse,
} from "../types";
import { MarketTypeAccount } from "@monaco-protocol/client-account-types";

export function findMarketTypePda(
  program: Program,
  marketType: string,
): ClientResponse<FindPdaResponse> {
  const responseFactory = new ResponseFactory({});
  responseFactory.addResponseData({
    pda: PublicKey.findProgramAddressSync(
      [Buffer.from("market_type"), Buffer.from(marketType)],
      program.programId,
    )[0],
  });
  return responseFactory.body;
}

/**
 * For the given parameters:
 *
 * - Attempt to fetch and return a market type account with the given marketTypeName
 * - If no market type account is found, attempt to create and return a new market type with the given data.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketTypeName {string} name of the market type being fetched or created
 * @param requiresDiscriminator {boolean} if creating a new market type, whether the market type requires a discriminator to be set on markets using the type
 * @param requiresValue {boolean} if creating a new market type, whether the market type requires a value (e.g. a number) to be set on markets using the type
 * @returns {GetOrCreateAccountResponse} the market type account and public key - if a new account was created, also includes the transaction id
 *
 * @example
 *
 *  const marketTypeName = "NewMarketType
 *  const requiresDiscriminator = false;
 *  const requiresValue = true;
 *  const response = await getOrCreateMarketType(program, marketTypeName, requiresDiscriminator, requiresValue);
 */
export async function getOrCreateMarketType(
  program: Program,
  marketTypeName: string,
  requiresDiscriminator = false,
  requiresValue = false,
): Promise<ClientResponse<GetOrCreateAccountResponse<MarketTypeAccount>>> {
  const response = new ResponseFactory({});

  let txId;
  let account;

  const publicKey = findMarketTypePda(program, marketTypeName).data.pda;

  try {
    account = await program.account.marketType.fetch(publicKey);
  } catch (_) {
    try {
      txId = await program.methods
        .createMarketType(marketTypeName, requiresDiscriminator, requiresValue)
        .accounts({ marketType: publicKey })
        .rpc();
      account = await program.account.marketType.fetch(publicKey);
    } catch (e) {
      response.addError(e);
      return response.body;
    }
  }

  response.addResponseData({
    account,
    publicKey,
    txId,
  });

  return response.body;
}
