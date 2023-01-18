import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import {
  findMarketOutcomePda,
  getAnchorProvider,
  getProtocolProgram,
} from "./util";
import {
  findAuthorisedOperatorsAccountPda,
  Operator,
} from "../npm-admin-client/src";

export async function addPricesToLadder() {
  const protocolProgram = await getProtocolProgram();
  if (process.argv.length != 5) {
    console.log(
      "Usage: yarn run addPricesToLadder <MARKET_ID> [<PRICE_TO_ADD>,...]",
    );
    process.exit(1);
  }

  const marketPda = new PublicKey(process.argv[3]);
  const pricesToAdd = JSON.parse(process.argv[4]);

  const market = await protocolProgram.account.market.fetch(marketPda);
  const authorisedOperators = await findAuthorisedOperatorsAccountPda(
    protocolProgram as Program,
    Operator.MARKET,
  );

  Array.from({ length: market.marketOutcomesCount }, (_, i) => i).forEach(
    async (marketOutcomeIndex) => {
      const marketOutcomePda = await findMarketOutcomePda(
        marketPda,
        marketOutcomeIndex,
        protocolProgram,
      );
      await protocolProgram.methods
        .addPricesToMarketOutcome(marketOutcomeIndex, pricesToAdd)
        .accounts({
          systemProgram: SystemProgram.programId,
          outcome: marketOutcomePda,
          market: marketPda,
          marketOperator: getAnchorProvider().wallet.publicKey,
          authorisedOperators: authorisedOperators.data.pda,
        })
        .rpc();
    },
  );
}
