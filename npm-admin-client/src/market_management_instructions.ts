import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  Operator,
  TransactionResponse,
  ResponseFactory,
  ClientResponse,
  MarketInstructionResponse,
  MarketAccount,
} from "../types";
import { findAuthorisedOperatorsAccountPda } from "./operators";
import {
  findMarketCommissionPaymentQueuePda,
  findEscrowPda,
  findMarketFundingPda,
  findMarketLiquiditiesPda,
  findMarketMatchingQueuePda,
  findMarketOrderRequestQueuePda,
} from "./market_helpers";

export enum MarketManagementInstructionType {
  PUBLISH = 0,
  UNPUBLISH = 1,
  SUSPEND = 2,
  UNSUSPEND = 3,
  OPEN = 4,
  SET_READY_TO_CLOSE = 5,
  VOID = 6,
  SETTLE = 7,
  UPDATE_TITLE = 8,
  UPDATE_LOCK_TIME = 9,
  UPDATE_MARKET_EVENT_START_TIME = 10,
  UPDATE_MARKET_EVENT_START_TIME_TO_NOW = 11,
  UPDATE_MARKET_LOCK_TIME_TO_NOW = 12,
}

export type MarketUpdateInstructionData = {
  winningOutcomeIndex?: number;
  title?: string;
  marketLockTimestamp?: number;
  marketMatchingQueuePk?: PublicKey;
  eventStartTimeTimestamp?: number;
};

export async function buildMarketManagementInstruction(
  program: Program,
  marketPk: PublicKey,
  instructionType: MarketManagementInstructionType,
  instructionData?: MarketUpdateInstructionData,
): Promise<ClientResponse<MarketInstructionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  switch (instructionType) {
    case MarketManagementInstructionType.SETTLE: {
      if (instructionData?.winningOutcomeIndex === undefined) {
        throw new Error(
          "winningOutcomeIndex is required in instructionData. Received: " +
            JSON.stringify(instructionData),
        );
      }
      break;
    }
    case MarketManagementInstructionType.UPDATE_TITLE: {
      if (!instructionData?.title) {
        throw new Error(
          "title is required in instructionData. Received: " +
            JSON.stringify(instructionData),
        );
      }
      break;
    }
    case MarketManagementInstructionType.UPDATE_LOCK_TIME: {
      if (!instructionData?.marketLockTimestamp) {
        throw new Error(
          "marketLockTimestamp is required in instructionData. Received: " +
            JSON.stringify(instructionData),
        );
      }
      break;
    }
    case MarketManagementInstructionType.UPDATE_MARKET_EVENT_START_TIME: {
      if (!instructionData?.eventStartTimeTimestamp) {
        throw new Error(
          "eventStartTimeTimestamp is required in instructionData. Received: " +
            JSON.stringify(instructionData),
        );
      }
      break;
    }
  }

  switch (instructionType) {
    case MarketManagementInstructionType.PUBLISH: {
      const instruction = await program.methods
        .publishMarket()
        .accounts({
          market: new PublicKey(marketPk),
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketManagementInstructionType.UNPUBLISH: {
      const instruction = await program.methods
        .unpublishMarket()
        .accounts({
          market: new PublicKey(marketPk),
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketManagementInstructionType.SUSPEND: {
      const instruction = await program.methods
        .suspendMarket()
        .accounts({
          market: new PublicKey(marketPk),
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketManagementInstructionType.UNSUSPEND: {
      const instruction = await program.methods
        .unsuspendMarket()
        .accounts({
          market: new PublicKey(marketPk),
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketManagementInstructionType.OPEN: {
      const [
        liquiditiesPk,
        matchingQueuePk,
        commissionQueuePk,
        orderRequestQueuePk,
      ] = await Promise.all([
        findMarketLiquiditiesPda(program, marketPk),
        findMarketMatchingQueuePda(program, marketPk),
        findMarketCommissionPaymentQueuePda(program, marketPk),
        findMarketOrderRequestQueuePda(program, marketPk),
      ]);
      if (
        !liquiditiesPk.success ||
        !matchingQueuePk.success ||
        !commissionQueuePk.success ||
        !orderRequestQueuePk.success
      ) {
        liquiditiesPk.errors ? response.addErrors(liquiditiesPk.errors) : null;
        matchingQueuePk.errors
          ? response.addErrors(matchingQueuePk.errors)
          : null;
        commissionQueuePk.errors
          ? response.addErrors(commissionQueuePk.errors)
          : null;
        orderRequestQueuePk.errors
          ? response.addErrors(orderRequestQueuePk.errors)
          : null;
        return response.body;
      }
      const instruction = await program.methods
        .openMarket(false)
        .accounts({
          market: new PublicKey(marketPk),
          liquidities: liquiditiesPk.data.pda,
          matchingQueue: matchingQueuePk.data.pda,
          commissionPaymentQueue: commissionQueuePk.data.pda,
          orderRequestQueue: orderRequestQueuePk.data.pda,
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketManagementInstructionType.SET_READY_TO_CLOSE: {
      const marketEscrow = await findEscrowPda(program, marketPk);
      if (!marketEscrow.success) {
        response.addErrors(marketEscrow.errors);
        return response.body;
      }
      const marketFunding = await findMarketFundingPda(program, marketPk);
      if (!marketFunding.success) {
        response.addErrors(marketFunding.errors);
        return response.body;
      }
      const instruction = await program.methods
        .setMarketReadyToClose()
        .accounts({
          market: new PublicKey(marketPk),
          marketEscrow: marketEscrow.data.pda,
          marketFunding: marketFunding.data.pda,
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketManagementInstructionType.VOID: {
      const [marketEscrow, market] = await Promise.all([
        findEscrowPda(program, marketPk),
        (await program.account.market.fetch(marketPk)) as MarketAccount,
      ]);
      if (!marketEscrow.success) {
        response.addErrors(marketEscrow.errors);
        return response.body;
      }
      const marketMatchingQueuePk = market.marketStatus.initializing
        ? null
        : (await findMarketMatchingQueuePda(program, marketPk)).data.pda;
      const orderRequestQueuePk = market.marketStatus.initializing
        ? null
        : (await findMarketOrderRequestQueuePda(program, marketPk)).data.pda;
      const instruction = await program.methods
        .voidMarket()
        .accounts({
          market: new PublicKey(marketPk),
          marketEscrow: marketEscrow.data.pda,
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          marketMatchingQueue: marketMatchingQueuePk,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          orderRequestQueue: orderRequestQueuePk,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketManagementInstructionType.SETTLE: {
      const marketMatchingQueuePk = await findMarketMatchingQueuePda(
        program,
        marketPk,
      );
      const instruction = await program.methods
        .settleMarket(instructionData?.winningOutcomeIndex)
        .accounts({
          market: marketPk,
          marketMatchingQueue: marketMatchingQueuePk.data.pda,
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
          orderRequestQueue: (
            await findMarketOrderRequestQueuePda(program, marketPk)
          ).data.pda,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketManagementInstructionType.UPDATE_TITLE: {
      const instruction = await program.methods
        .updateMarketTitle(instructionData?.title)
        .accounts({
          market: marketPk,
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketManagementInstructionType.UPDATE_LOCK_TIME: {
      const instruction = await program.methods
        .updateMarketLocktime(new BN(instructionData?.marketLockTimestamp))
        .accounts({
          market: marketPk,
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketManagementInstructionType.UPDATE_MARKET_EVENT_START_TIME: {
      const instruction = await program.methods
        .updateMarketEventStartTime(
          new BN(instructionData?.eventStartTimeTimestamp),
        )
        .accounts({
          market: marketPk,
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketManagementInstructionType.UPDATE_MARKET_EVENT_START_TIME_TO_NOW: {
      const instruction = await program.methods
        .updateMarketEventStartTimeToNow()
        .accounts({
          market: marketPk,
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketManagementInstructionType.UPDATE_MARKET_LOCK_TIME_TO_NOW: {
      const instruction = await program.methods
        .updateMarketLocktimeToNow()
        .accounts({
          market: marketPk,
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    default: {
      response.addErrors([
        `Market management instruction type ${instructionType} is not supported`,
      ]);
      break;
    }
  }
  response.addResponseData({ marketPk: marketPk });
  return response.body;
}

export async function setupManagementRequest(program: Program) {
  const response = new ResponseFactory({} as TransactionResponse);
  const provider = program.provider as AnchorProvider;
  const authorisedOperators = await findAuthorisedOperatorsAccountPda(
    program,
    Operator.MARKET,
  );
  return { response, provider, authorisedOperators };
}
