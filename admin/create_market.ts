import { PublicKey, Keypair } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import {
  createMarketWithOutcomesAndPriceLadder as npmCreateMarket,
  DEFAULT_PRICE_LADDER,
  MarketType,
} from "../npm-admin-client/src/";
import { getProtocolProgram } from "./util";

export async function create_market() {
  const protocolProgram = await getProtocolProgram();

  const eventAccountKeyPair = Keypair.generate();
  const marketToken = new PublicKey(
    "2QqxXa2aNCx3DLQCHgiC4P7Xfbe3B4bULM5eKpyAirGY",
  );

  const createMarketResponse = await npmCreateMarket(
    protocolProgram as Program,
    "Aduana Stars-Bechem United",
    MarketType.EventResultWinner,
    marketToken,
    1924254038,
    eventAccountKeyPair.publicKey,
    ["Aduana Stars", "Draw", "Bechem United"],
    DEFAULT_PRICE_LADDER,
    20,
  );

  if (createMarketResponse.success) {
    console.log(JSON.stringify(createMarketResponse.data.marketPk));
    console.log(JSON.stringify(createMarketResponse.data.market, null, 2));
  } else {
    console.log("Market Creation Failure");
    console.log(JSON.stringify(createMarketResponse.errors, null, 2));
  }
}

export function print_market() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run printMarket <ADDRESS>");
    process.exit(1);
  }

  const marketPK = new PublicKey(process.argv[3]);
  get_market(marketPK).then(
    (market) => console.log(JSON.stringify(market)),
    (reason) => console.log(reason),
  );
}

async function get_market(marketPK: PublicKey) {
  const program = await getProtocolProgram();
  return await program.account.market.fetch(marketPK);
}
