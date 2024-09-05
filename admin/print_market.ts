import { PublicKey } from "@solana/web3.js";
import {
  findEscrowPda,
  findMarketCommissionPaymentQueuePda,
  findMarketLiquiditiesPda,
  findMarketMatchingQueuePda,
  findMarketOrderRequestQueuePda,
  getMarket,
} from "../npm-client";
import { getProtocolProgram } from "./util";
import { findMarketFundingPda } from "../npm-admin-client";

export async function printMarket() {
  const program = await getProtocolProgram();

  if (process.argv.length != 4) {
    console.log("Usage: yarn run printMarket <ADDRESS>");
    process.exit(1);
  }

  const marketPk = new PublicKey(process.argv[3]);

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
  const marketCommissionPaymentQueuePk =
    await findMarketCommissionPaymentQueuePda(program, marketPk);

  console.log(`Market: ${marketPk} : ${JSON.stringify(market, null, 2)}`);
  console.log(`- escrow: ${marketEscrowPk.data.pda.toBase58()}`);
  console.log(`- funding: ${marketFundingPk.data.pda.toBase58()}`);
  console.log(
    `- marketLiquidities: ${marketLiquiditiesPk.data.pda.toBase58()}`,
  );
  console.log(
    `- marketOrderRequestQueue: ${marketOrderRequestQueuePk.data.pda.toBase58()}`,
  );
  console.log(
    `- marketMatchingQueue: ${marketMatchingQueuePk.data.pda.toBase58()}`,
  );
  console.log(
    `- marketCommissionPaymentQueue: ${marketCommissionPaymentQueuePk.data.pda.toBase58()}`,
  );
}
