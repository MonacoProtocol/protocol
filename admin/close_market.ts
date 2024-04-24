import { PublicKey } from "@solana/web3.js";
import {
  findEscrowPda,
  findMarketMatchingQueuePda,
  findCommissionPaymentsQueuePda,
} from "../npm-admin-client";
import { getProtocolProgram } from "./util";

export async function closeMarket() {
  const protocolProgram = await getProtocolProgram();

  if (process.argv.length != 4) {
    console.log("Usage: yarn closeMarket <MARKET_ID>");
    process.exit(1);
  }

  const marketPk = new PublicKey(process.argv[3]);
  const authorityPk = new PublicKey(
    "J2LqciLvyxVHMjMcda73459zWfFxw7rveDb5YAhSdGTe",
  );
  console.log(`Closing ${marketPk}`);

  await protocolProgram.methods
    .closeMarket()
    .accounts({
      market: marketPk,
      authority: authorityPk,
      marketEscrow: (await findEscrowPda(protocolProgram, marketPk)).data.pda,
      matchingQueue: (
        await findMarketMatchingQueuePda(protocolProgram, marketPk)
      ).data.pda,
      commissionPaymentQueue: (
        await findCommissionPaymentsQueuePda(protocolProgram, marketPk)
      ).data.pda,
    })
    .rpc()
    .catch((e) => {
      console.error(e);
    });
}
