import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  Operator,
  TransactionResponse,
  ResponseFactory,
  ClientResponse,
  MarketInstructionResponse,
} from "../types";
import { findAuthorisedOperatorsAccountPda } from "./operators";
import { findEscrowPda } from "./market_helpers";

export enum MarketStatusChangeInstructionType {
  PUBLISH = 0,
  UNPUBLISH = 1,
  SUSPEND = 2,
  UNSUSPEND = 3,
  OPEN = 4,
  SET_READY_TO_CLOSE = 5,
  VOID = 6,
}

export enum MarketUpdateInstructionType {
  SETTLE = 0,
  UPDATE_TITLE = 1,
  UPDATE_LOCK_TIME = 2,
  UPDATE_MARKET_EVENT_START_TIME = 3,
  UPDATE_MARKET_EVENT_START_TIME_TO_NOW = 4,
}

export type MarketUpdateInstructionData = {
  winningOutcomeIndex?: number;
  title?: string;
  marketLockTimestamp?: number;
  eventStartTimeTimestamp?: number;
};

export async function buildMarketUpdateInstruction(
  program: Program,
  marketPk: PublicKey,
  instructionType: MarketUpdateInstructionType,
  instructionData?: MarketUpdateInstructionData,
): Promise<ClientResponse<MarketInstructionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  try {
    switch (instructionType) {
      case MarketUpdateInstructionType.SETTLE: {
        if (!instructionData?.winningOutcomeIndex) {
          throw new Error("winningOutcomeIndex is required in instructionData");
        }
        break;
      }
      case MarketUpdateInstructionType.UPDATE_TITLE: {
        if (!instructionData?.title) {
          throw new Error("title is required in instructionData");
        }
        break;
      }
      case MarketUpdateInstructionType.UPDATE_LOCK_TIME: {
        if (!instructionData?.marketLockTimestamp) {
          throw new Error("marketLockTimestamp is required in instructionData");
        }
        break;
      }
      case MarketUpdateInstructionType.UPDATE_MARKET_EVENT_START_TIME: {
        if (!instructionData?.eventStartTimeTimestamp) {
          throw new Error(
            "eventStartTimeTimestamp is required in instructionData",
          );
        }
        break;
      }
    }

    switch (instructionType) {
      case MarketUpdateInstructionType.SETTLE: {
        const instruction = await program.methods
          .settleMarket(instructionData?.winningOutcomeIndex)
          .accounts({
            market: marketPk,
            authorisedOperators: authorisedOperators.data.pda,
            marketOperator: provider.wallet.publicKey,
          })
          .instruction();
        response.addResponseData({ instruction: instruction });
        break;
      }
      case MarketUpdateInstructionType.UPDATE_TITLE: {
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
      case MarketUpdateInstructionType.UPDATE_LOCK_TIME: {
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
      case MarketUpdateInstructionType.UPDATE_MARKET_EVENT_START_TIME: {
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
      case MarketUpdateInstructionType.UPDATE_MARKET_EVENT_START_TIME_TO_NOW: {
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
      default: {
        response.addErrors([
          `Market update instruction type ${instructionType} is not supported`,
        ]);
        break;
      }
    }
  } catch (e) {
    response.addError(e);
  }
  response.addResponseData({ marketPk: marketPk });
  return response.body;
}

export async function buildMarketStatusChangeInstruction(
  program: Program,
  marketPk: PublicKey,
  instructionType: MarketStatusChangeInstructionType,
): Promise<ClientResponse<MarketInstructionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
  }

  switch (instructionType) {
    case MarketStatusChangeInstructionType.PUBLISH: {
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
    case MarketStatusChangeInstructionType.UNPUBLISH: {
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
    case MarketStatusChangeInstructionType.SUSPEND: {
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
    case MarketStatusChangeInstructionType.UNSUSPEND: {
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
    case MarketStatusChangeInstructionType.OPEN: {
      const marketEscrow = await findEscrowPda(program, marketPk);
      if (!marketEscrow.success) {
        response.addErrors(marketEscrow.errors);
        return response.body;
      }
      const instruction = await program.methods
        .openMarket()
        .accounts({
          market: new PublicKey(marketPk),
          marketEscrow: marketEscrow.data.pda,
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketStatusChangeInstructionType.SET_READY_TO_CLOSE: {
      const marketEscrow = await findEscrowPda(program, marketPk);
      if (!marketEscrow.success) {
        response.addErrors(marketEscrow.errors);
        return response.body;
      }
      const instruction = await program.methods
        .setMarketReadyToClose()
        .accounts({
          market: new PublicKey(marketPk),
          marketEscrow: marketEscrow.data.pda,
          authorisedOperators: authorisedOperators.data.pda,
          marketOperator: provider.wallet.publicKey,
        })
        .instruction();
      response.addResponseData({ instruction: instruction });
      break;
    }
    case MarketStatusChangeInstructionType.VOID: {
      const marketEscrow = await findEscrowPda(program, marketPk);
      if (!marketEscrow.success) {
        response.addErrors(marketEscrow.errors);
        return response.body;
      }
      const instruction = await program.methods
        .voidMarket()
        .accounts({
          market: new PublicKey(marketPk),
          marketEscrow: marketEscrow.data.pda,
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
