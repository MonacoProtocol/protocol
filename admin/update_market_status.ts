import {
  settleMarket,
  publishMarket,
  unpublishMarket,
  suspendMarket,
  unsuspendMarket,
} from "../npm-admin-client/src";
import { getProtocolProgram } from "./util";
import { PublicKey } from "@solana/web3.js";

// yarn run settleMarket <MARKET_ID> <WINNING_OUTCOME_INDEX>
// or tsc; ANCHOR_WALLET=~/.config/solana/id.json yarn ts-node client.ts settle_market <MARKET_ID> <WINNING_OUTCOME_INDEX>

export async function settle_market() {
  if (process.argv.length != 5) {
    console.log(
      "Usage: yarn run settleMarket <MARKET_ID> <WINNING_OUTCOME_INDEX>",
    );
    process.exit(1);
  }

  const marketID = process.argv[3];
  const winningOutcomeIndex = parseInt(process.argv[4], 10);
  const marketPk = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  await settleMarket(protocolProgram, marketPk, winningOutcomeIndex);
}

export async function publish_market() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run publishMarket <MARKET_ID>");
    process.exit(1);
  }

  const marketID = process.argv[3];
  const marketPk = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  await publishMarket(protocolProgram, marketPk);
}

export async function unpublish_market() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run unpublishMarket <MARKET_ID>");
    process.exit(1);
  }

  const marketID = process.argv[3];
  const marketPk = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  await unpublishMarket(protocolProgram, marketPk);
}

export async function suspend_market() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run suspendMarket <MARKET_ID>");
    process.exit(1);
  }

  const marketID = process.argv[3];
  const marketPk = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  await suspendMarket(protocolProgram, marketPk);
}

export async function unsuspend_market() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run unsuspendMarket <MARKET_ID>");
    process.exit(1);
  }

  const marketID = process.argv[3];
  const marketPk = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  await unsuspendMarket(protocolProgram, marketPk);
}
