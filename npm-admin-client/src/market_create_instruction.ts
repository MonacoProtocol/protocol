import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Program, web3, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  Operator,
  ClientResponse,
  ResponseFactory,
  EpochTimeStamp,
  MarketOrderBehaviour,
  MarketOrderBehaviourValue,
  MarketAccount,
} from "../types";
import { findAuthorisedOperatorsAccountPda } from "./operators";
import {
  findMarketPda,
  getMarket,
  getMintInfo,
  findEscrowPda,
  findCommissionPaymentsQueuePda,
} from "./market_helpers";
import { findMarketTypePda } from "./market_type_create";
import { MarketInstructionResponse } from "../types/transactions";

export async function buildCreateMarketInstruction(
  program: Program,
  marketName: string,
  marketType: string,
  marketTokenPk: PublicKey,
  marketLockTimestamp: EpochTimeStamp,
  eventAccountPk: PublicKey,
  options?: {
    marketTypeDiscriminator?: string;
    marketTypeValue?: string;
    existingMarketPk?: PublicKey;
    existingMarket?: MarketAccount;
    eventStartTimestamp?: EpochTimeStamp;
    inplayEnabled?: boolean;
    inplayOrderDelay?: number;
    eventStartOrderBehaviour?: MarketOrderBehaviour;
    marketLockOrderBehaviour?: MarketOrderBehaviour;
  },
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
    version = existingMarket.version + 1;
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

  const [escrowPda, authorisedOperators, mintInfo, paymentsQueuePda] =
    await Promise.all([
      findEscrowPda(program, marketPda),
      findAuthorisedOperatorsAccountPda(program, Operator.MARKET),
      getMintInfo(program, marketTokenPk),
      findCommissionPaymentsQueuePda(program, marketPda),
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
        systemProgram: SystemProgram.programId,
        escrow: escrowPda.data.pda,
        mint: marketTokenPk,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
        authorisedOperators: authorisedOperators.data.pda,
        marketOperator: provider.wallet.publicKey,
        commissionPaymentQueue: paymentsQueuePda.data.pda,
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
