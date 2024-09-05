import { Keypair, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  createMarketWithOutcomesAndPriceLadder as npmCreateMarket,
  MarketOrderBehaviourValue,
} from "../npm-admin-client/src/";
import { getProtocolProgram } from "./util";
import { Markets, MarketStatusFilter } from "../npm-client";

/**
 * Example create market script - parameters used for market creation might be need to replaced/created before use
 */
export async function create_market() {
  const protocolProgram = await getProtocolProgram();
  const marketTokenString =
    process.argv.length > 3
      ? process.argv[3]
      : "2QqxXa2aNCx3DLQCHgiC4P7Xfbe3B4bULM5eKpyAirGY";
  const priceLadderString =
    process.argv.length > 4
      ? process.argv[4]
      : "94VCY4rWi3nvyNPHnsRV65n3JZxiPSvXbxfvJydYw9uA";

  const marketTokenPk = new PublicKey(marketTokenString);
  const priceLadderPk = new PublicKey(priceLadderString);

  const eventAccountKeyPair = Keypair.generate();

  const createMarketResponse = await npmCreateMarket(
    protocolProgram as Program,
    "Aduana Stars-Bechem United",
    "TEST",
    marketTokenPk,
    1924254038,
    eventAccountKeyPair.publicKey,
    ["Aduana Stars", "Draw", "Bechem United"],
    priceLadderPk,
    {
      eventStartOrderBehaviour: MarketOrderBehaviourValue.cancelUnmatched,
      marketLockOrderBehaviour: MarketOrderBehaviourValue.cancelUnmatched,
      batchSize: 20,
    },
  );

  if (createMarketResponse.success) {
    console.log(JSON.stringify(createMarketResponse.data.marketPk));
    console.log(JSON.stringify(createMarketResponse.data.market, null, 2));
  } else {
    console.log("Market Creation Failure");
    console.log(JSON.stringify(createMarketResponse.errors, null, 2));
  }
}

export async function getMarketsByStatus() {
  const program = await getProtocolProgram();
  const query = Markets.marketQuery(program);
  const result = { totals: {}, pks: {} };
  let total = 0;
  for (const status in MarketStatusFilter) {
    if (!isNaN(parseInt(status))) continue;
    const marketPksWithStatus = (
      await query
        .filterByStatus(
          MarketStatusFilter[status as keyof typeof MarketStatusFilter],
        )
        .fetchPublicKeys()
    ).data.publicKeys;
    result.totals[status] = marketPksWithStatus.length;
    result.pks[status] = marketPksWithStatus;
    total += result.totals[status];
  }
  result.totals["total"] = total;
  console.log(JSON.stringify(result, null, 2));
}
