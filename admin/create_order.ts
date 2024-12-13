import { createOrderUiStake } from "../npm-client/src/create_order";
import { PublicKey } from "@solana/web3.js";
import { getProtocolProgram } from "./util";
import { findMarketOutcomePda } from "../npm-admin-client";
import { MarketOutcomeAccount } from "../npm-client-account-types";

// yarn run create_order <MARKET_ID> <OUTCOME_INDEX> <FOR (true|false)> <PRICE> <STAKE>
// or tsc; ANCHOR_WALLET=~/.config/solana/id.json yarn ts-node client.ts create_order <MARKET_ID> <OUTCOME_INDEX> <FOR (true|false)> <PRICE> <STAKE>

export async function create_order() {
  if (process.argv.length != 8) {
    console.log(
      "Usage: yarn run create_order <MARKET_ID> <OUTCOME_INDEX> <FOR (true|false)> <PRICE> <STAKE>",
    );
    process.exit(1);
  }

  const marketPk = new PublicKey(process.argv[3]);
  const marketOutcomeIndex = parseInt(process.argv[4], 10);
  const forOutcome = process.argv[5] == "true";
  const price = parseFloat(process.argv[6]);
  const stake = parseFloat(process.argv[7]);

  const protocolProgram = await getProtocolProgram();

  const outcome = (await protocolProgram.account.marketOutcome.fetch(
    (
      await findMarketOutcomePda(protocolProgram, marketPk, marketOutcomeIndex)
    ).data.pda,
  )) as unknown as MarketOutcomeAccount;

  const result = await createOrderUiStake(
    protocolProgram,
    marketPk,
    marketOutcomeIndex,
    forOutcome,
    price,
    stake,
    outcome.prices,
  );
  console.log(JSON.stringify(result, null, 2));
}
