import {
  settleMarket,
  openMarket as openMarketClient,
  publishMarket,
  unpublishMarket,
  suspendMarket,
  unsuspendMarket,
  setMarketReadyToClose as setMarketReadyToCloseClient,
  setMarketReadyToVoid as setMarketReadyToVoidClient,
} from "../npm-admin-client/src";
import { checkResponse, getProtocolProgram } from "./util";
import { PublicKey } from "@solana/web3.js";

// yarn run settleMarket <MARKET_ID> <WINNING_OUTCOME_INDEX>
// or tsc; ANCHOR_WALLET=~/.config/solana/id.json yarn ts-node client.ts settle_market <MARKET_ID> <WINNING_OUTCOME_INDEX>

export async function openMarket() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run openMarket <MARKET_ID>");
    process.exit(1);
  }

  const marketID = process.argv[3];
  const marketPk = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  checkResponse(await openMarketClient(protocolProgram, marketPk));
}

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
  checkResponse(
    await settleMarket(protocolProgram, marketPk, winningOutcomeIndex),
  );
}

export async function setMarketReadyToClose() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run setMarketReadyToClose <MARKET_ID>");
    process.exit(1);
  }

  const marketID = process.argv[3];
  const marketPk = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  checkResponse(await setMarketReadyToCloseClient(protocolProgram, marketPk));
}

export async function setMarketReadyToVoid() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run setMarketReadyToVoid <MARKET_ID>");
    process.exit(1);
  }

  const marketID = process.argv[3];
  const marketPk = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  checkResponse(await setMarketReadyToVoidClient(protocolProgram, marketPk));
}

export async function publish_market() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run publishMarket <MARKET_ID>");
    process.exit(1);
  }

  const marketID = process.argv[3];
  const marketPk = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  checkResponse(await publishMarket(protocolProgram, marketPk));
}

export async function unpublish_market() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run unpublishMarket <MARKET_ID>");
    process.exit(1);
  }

  const marketID = process.argv[3];
  const marketPk = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  checkResponse(await unpublishMarket(protocolProgram, marketPk));
}

export async function suspend_market() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run suspendMarket <MARKET_ID>");
    process.exit(1);
  }

  const marketID = process.argv[3];
  const marketPk = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  checkResponse(await suspendMarket(protocolProgram, marketPk));
}

export async function unsuspend_market() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run unsuspendMarket <MARKET_ID>");
    process.exit(1);
  }

  const marketID = process.argv[3];
  const marketPk = new PublicKey(marketID);

  const protocolProgram = await getProtocolProgram();
  checkResponse(await unsuspendMarket(protocolProgram, marketPk));
}
