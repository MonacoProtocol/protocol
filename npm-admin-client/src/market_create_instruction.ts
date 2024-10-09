import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Program, web3, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  Operator,
  ClientResponse,
  ResponseFactory,
  EpochTimeStamp,
  MarketInstructionOptions,
  MarketOrderBehaviourValue,
} from "../types";
import { findAuthorisedOperatorsAccountPda } from "./operators";
import {
  findMarketPda,
  getMarket,
  getMintInfo,
  findEscrowPda,
  findMarketFundingPda,
} from "./market_helpers";
import { findMarketTypePda } from "./market_type_create";
import { MarketInstructionResponse } from "../types/transactions";
import { MarketAccount } from "@monaco-protocol/client-account-types";

export async function buildCreateMarketInstruction(
  program: Program,
  marketName: string,
  marketType: string,
  marketTokenPk: PublicKey,
  marketLockTimestamp: EpochTimeStamp,
  eventAccountPk: PublicKey,
  options?: MarketInstructionOptions,
): Promise<ClientResponse<MarketInstructionResponse>> {
  const response = new ResponseFactory({});

  /* eslint-disable */
  // prettier-ignore-start
  const marketTypeDiscriminator = options?.marketTypeDiscriminator
    ? options.marketTypeDiscriminator
    : null;
  const marketTypeValue = options?.marketTypeValue
    ? options.marketTypeValue
    : null;
  const existingMarketPk = options?.existingMarketPk
    ? options.existingMarketPk
    : null;
  const eventStartTimestamp = options?.eventStartTimestamp
    ? options.eventStartTimestamp
    : marketLockTimestamp;
  const inplayEnabled = options?.inplayEnabled ? options.inplayEnabled : false;
  const inplayOrderDelay = options?.inplayOrderDelay
    ? options.inplayOrderDelay
    : 0;
  const eventStartOrderBehaviour = options?.eventStartOrderBehaviour
    ? options.eventStartOrderBehaviour
    : MarketOrderBehaviourValue.none;
  const marketLockOrderBehaviour = options?.marketLockOrderBehaviour
    ? options.marketLockOrderBehaviour
    : MarketOrderBehaviourValue.none;
  // prettier-ignore-end
  /* eslint-enable */

  const provider = program.provider as AnchorProvider;
  const mintDecimalOffset = 3;

  const marketTypePk = findMarketTypePda(program, marketType).data.pda;

  let version = 0;
  if (existingMarketPk) {
    let existingMarket = options?.existingMarket;
    if (!existingMarket) {
      const existingMarketResponse = await getMarket(program, existingMarketPk);
      if (!existingMarketResponse.success) {
        response.addErrors(existingMarketResponse.errors);
        return response.body;
      }
      existingMarket = existingMarketResponse.data.account;
    }
    version = (existingMarket as MarketAccount).version + 1;
  }

  const marketPda = (
    await findMarketPda(
      program,
      eventAccountPk,
      marketTypePk,
      marketTypeDiscriminator,
      marketTypeValue,
      marketTokenPk,
      version,
    )
  ).data.pda;

  const [escrowPda, fundingPda, authorisedOperators, mintInfo] =
    await Promise.all([
      findEscrowPda(program, marketPda),
      findMarketFundingPda(program, marketPda),
      findAuthorisedOperatorsAccountPda(program, Operator.MARKET),
      getMintInfo(program, marketTokenPk),
    ]);

  try {
    const instruction = await program.methods
      .createMarket(
        eventAccountPk,
        marketTypeDiscriminator,
        marketTypeValue,
        marketName,
        mintInfo.data.decimals - mintDecimalOffset,
        new BN(marketLockTimestamp),
        new BN(eventStartTimestamp),
        inplayEnabled,
        inplayOrderDelay,
        eventStartOrderBehaviour,
        marketLockOrderBehaviour,
      )
      .accounts({
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        existingMarket: existingMarketPk,
        market: marketPda,
        marketType: marketTypePk,
        escrow: escrowPda.data.pda,
        funding: fundingPda.data.pda,
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
        rent: web3.SYSVAR_RENT_PUBKEY,
        mint: marketTokenPk,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    response.addResponseData({
      marketPk: marketPda,
      instruction: instruction,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }
  return response.body;
}
