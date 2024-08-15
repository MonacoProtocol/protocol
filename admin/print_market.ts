import { PublicKey } from "@solana/web3.js";
import {
  findEscrowPda,
  findMarketLiquiditiesPda,
  findMarketMatchingQueuePda,
  findMarketOrderRequestQueuePda,
  getMarket,
} from "../npm-client";
import { getProtocolProgram } from "./util";
import { findMarketFundingPda } from "../npm-admin-client";

export async function getMarketData(marketPk: PublicKey) {
  const program = await getProtocolProgram();
  const market = await getMarket(program, marketPk);
  const marketEscrowPk = await findEscrowPda(program, marketPk);
  const marketFundingPk = await findMarketFundingPda(program, marketPk);
  const marketLiquiditiesPk = await findMarketLiquiditiesPda(program, marketPk);
  const marketOrderRequestQueuePk = await findMarketOrderRequestQueuePda(
    program,
    marketPk,
  );
  const marketMatchingQueuePk = await findMarketMatchingQueuePda(
    program,
    marketPk,
  );

  return {
    market,
    marketEscrow: marketEscrowPk,
    marketFunding: marketFundingPk,
    marketLiquidities: marketLiquiditiesPk,
    marketOrderRequestQueue: marketOrderRequestQueuePk,
    marketMatchingQueue: marketMatchingQueuePk,
  };
}
