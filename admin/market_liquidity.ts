import { PublicKey } from "@solana/web3.js";
import { getMarketOutcomeTitlesByMarket } from "../npm-client/src";
import {
  findMarketOutcomePda,
  findMarketOutcomePoolPda,
  getProtocolProgram,
} from "./util";

export async function print_market_liquidity() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run printMarketLiquidity <MARKET_ID>");
    process.exit(1);
  }

  const marketID = process.argv[3];
  const marketPK = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  protocolProgram.account.market.fetch(marketPK).then(async (market) => {
    const output = {};

    const marketOutcomeTitles = await getMarketOutcomeTitlesByMarket(
      protocolProgram,
      marketPK,
    );

    Array.from({ length: market.marketOutcomesCount }, (_, i) => i).forEach(
      async (marketOutcomeIndex) => {
        const outcomeTitle =
          marketOutcomeTitles.data.marketOutcomeTitles[marketOutcomeIndex];
        const outcomePda = await findMarketOutcomePda(
          marketPK,
          marketOutcomeIndex,
          protocolProgram,
        );
        const outcome = await protocolProgram.account.marketOutcome.fetch(
          outcomePda,
        );
        const priceLadder = outcome.priceLadder;

        for (const price of priceLadder) {
          const forPoolPda = await findMarketOutcomePoolPda(
            marketPK,
            outcomeTitle,
            price,
            true,
            protocolProgram,
          );
          const againstPoolPda = await findMarketOutcomePoolPda(
            marketPK,
            outcomeTitle,
            price,
            false,
            protocolProgram,
          );

          const forPool =
            await protocolProgram.account.marketMatchingPool.fetch(forPoolPda);
          const againstPool =
            await protocolProgram.account.marketMatchingPool.fetch(
              againstPoolPda,
            );

          if (forPool.liquidityAmount.toNumber() > 0) {
            if (!output[outcomeTitle]) output[outcomeTitle] = {};
            if (!output[outcomeTitle][price]) output[outcomeTitle][price] = {};
            output[outcomeTitle][price].forOutcome = forPool.liquidityAmount;
          }
          if (againstPool.liquidityAmount.toNumber() > 0) {
            if (!output[outcomeTitle]) output[outcomeTitle] = {};
            if (!output[outcomeTitle][price]) output[outcomeTitle][price] = {};
            output[outcomeTitle][price].against = againstPool.liquidityAmount;
          }
        }
      },
    );
    console.log(output);
  });
}
