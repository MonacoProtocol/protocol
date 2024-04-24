import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  findEscrowPda,
  findMarketMatchingQueuePda,
  findCommissionPaymentsQueuePda,
  findAuthorisedOperatorsAccountPda,
  Operator,
} from "../npm-admin-client";
import { getAnchorProvider, getProtocolProgram } from "./util";
import { getMarket, getMarketMatchingQueue } from "../npm-client";
import { Program } from "@coral-xyz/anchor";

export async function closeMarket() {
  const protocolProgram = await getProtocolProgram();

  if (process.argv.length != 4) {
    console.log("Usage: yarn closeMarket <MARKET_ID>");
    process.exit(1);
  }

  const marketPk = new PublicKey(process.argv[3]);
  const authorityPk = getAnchorProvider().wallet.publicKey;
  console.log(`Closing market ${marketPk} using authority ${authorityPk}`);

  // check if market exists
  const market = await getMarket(protocolProgram, marketPk);
  if (!market.success) {
    console.error(`Closing market ${marketPk} does not exist`);
    return;
  }

  // check market's authority
  const marketAuthorityPk = market.data.account.authority;
  console.log(
    `Closing market ${marketPk} expected authority ${marketAuthorityPk}`,
  );
  if (!marketAuthorityPk.equals(authorityPk)) {
    console.error(`Closing market ${marketPk} wrong authority`);
    return;
  }

  // check market's matching queue
  const marketMatchingQueuePk = await findMarketMatchingQueuePda(
    protocolProgram,
    marketPk,
  );
  console.log(
    `Closing market ${marketPk} expected matching queue ${marketMatchingQueuePk.data.pda}`,
  );

  const marketMatchingQueue = await getMarketMatchingQueue(
    protocolProgram,
    marketMatchingQueuePk.data.pda,
  );
  if (!marketMatchingQueue.success) {
    console.log(`Closing market ${marketPk} matching queue does not exist`);
    const authorisedOperators = await findAuthorisedOperatorsAccountPda(
      protocolProgram as Program,
      Operator.MARKET,
    );
    await protocolProgram.methods
      .initializeMarketQueues()
      .accounts({
        market: marketPk,
        matchingQueue: marketMatchingQueuePk.data.pda,
        marketOperator: getAnchorProvider().wallet.publicKey,
        authorisedOperators: authorisedOperators.data.pda,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
    console.log(`Closing market ${marketPk} initialize market queues`);
  }

  // close
  const marketEscrowPk = await findEscrowPda(protocolProgram, marketPk);
  const marketCommissionPaymentsQueuePk = await findCommissionPaymentsQueuePda(
    protocolProgram,
    marketPk,
  );

  console.log(`Closing market ${marketPk} executing`);
  await protocolProgram.methods
    .closeMarket()
    .accounts({
      market: marketPk,
      authority: authorityPk,
      marketEscrow: marketEscrowPk.data.pda,
      matchingQueue: marketMatchingQueuePk.data.pda,
      commissionPaymentQueue: marketCommissionPaymentsQueuePk.data.pda,
    })
    .rpc()
    .catch((e) => {
      console.error(e);
    });
  console.log(`Closing market ${marketPk} done`);
}
