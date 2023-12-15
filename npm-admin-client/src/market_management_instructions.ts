import { Program, AnchorProvider } from "@coral-xyz/anchor";
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

export enum MarketManagementInstructionType {
  PUBLISH = 0,
  UNPUBLISH = 1,
  SUSPEND = 2,
  UNSUSPEND = 3,
  OPEN = 4,
  SET_READY_TO_CLOSE = 5,
  VOID = 6,
}

export async function buildMarketStatusChangeInstruction(
  program: Program,
  marketPk: PublicKey,
  instructionType: MarketManagementInstructionType,
): Promise<ClientResponse<MarketInstructionResponse>> {
  const { response, provider, authorisedOperators } =
    await setupManagementRequest(program);

  if (!authorisedOperators.success) {
    response.addErrors(authorisedOperators.errors);
    return response.body;
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
    case MarketManagementInstructionType.SET_READY_TO_CLOSE: {
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
    case MarketManagementInstructionType.VOID: {
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
