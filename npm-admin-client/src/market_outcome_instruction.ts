import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  Operator,
  ClientResponse,
  ResponseFactory,
  FindPdaResponse,
} from "../types";
import { findAuthorisedOperatorsAccountPda } from "./operators";
import {
  MarketOutcomeInstructionResponse,
  MarketOutcomesInstructionsResponse,
} from "../types/transactions";
import { MarketAccount } from "@monaco-protocol/client-account-types";

export async function buildInitialiseOutcomeInstruction(
  program: Program,
  marketPk: PublicKey,
  outcome: string,
  outcomeIndex: number,
  priceLadderPk?: PublicKey,
): Promise<ClientResponse<MarketOutcomeInstructionResponse>> {
  const response = new ResponseFactory({} as MarketOutcomeInstructionResponse);
  const provider = program.provider as AnchorProvider;

  const [authorisedOperatorsPda, nextOutcomePda] = await Promise.all([
    findAuthorisedOperatorsAccountPda(program, Operator.MARKET),
    findMarketOutcomePda(program, marketPk, outcomeIndex),
  ]);

  if (!authorisedOperatorsPda.success) {
    response.addErrors(authorisedOperatorsPda.errors);
    return response.body;
  }

  if (!nextOutcomePda.success) {
    response.addErrors(nextOutcomePda.errors);
    return response.body;
  }
  try {
    const instruction = await program.methods
      .initializeMarketOutcome(outcome)
      .accounts({
        systemProgram: SystemProgram.programId,
        outcome: nextOutcomePda.data.pda,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        priceLadder: priceLadderPk == undefined ? null : priceLadderPk,
        market: marketPk,
        authorisedOperators: authorisedOperatorsPda.data.pda,
        marketOperator: provider.wallet.publicKey,
      })
      .instruction();

    response.addResponseData({
      outcome: outcome,
      outcomePda: nextOutcomePda.data.pda,
      instruction: instruction,
    });
  } catch (e) {
    response.addError(e);
    return response.body;
  }

  return response.body;
}

export async function buildInitialiseOutcomesInstructions(
  program: Program,
  marketPk: PublicKey,
  outcomes: string[],
  priceLadderPk?: PublicKey,
  startingIndex?: number,
): Promise<ClientResponse<MarketOutcomesInstructionsResponse>> {
  const response = new ResponseFactory(
    {} as MarketOutcomesInstructionsResponse,
  );

  let resolvedIndex = 0;
  if (startingIndex == undefined) {
    const market = (await program.account.market.fetch(
      marketPk,
    )) as unknown as MarketAccount;
    resolvedIndex = market.marketOutcomesCount;
  }
  const instructions = await Promise.all(
    outcomes.map((outcome, index) =>
      buildInitialiseOutcomeInstruction(
        program,
        marketPk,
        outcome,
        startingIndex ? startingIndex + index : resolvedIndex + index,
        priceLadderPk,
      ),
    ),
  );

  response.addResponseData({
    instructions: instructions.map((i) => i.data),
  });

  return response.body;
}

export function findMarketOutcomePda(
  program: Program,
  marketPk: PublicKey,
  marketOutcomeIndex: number,
): ClientResponse<FindPdaResponse> {
  const response = new ResponseFactory({} as FindPdaResponse);

  try {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [marketPk.toBuffer(), Buffer.from(marketOutcomeIndex.toString())],
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
