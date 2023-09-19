import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  findMarketTypePda,
  getOrCreateMarketType,
} from "../npm-admin-client/src/";
import { getProtocolProgram } from "./util";

export async function createMarketType() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run createMarketType <NAME>");
    process.exit(1);
  }

  const protocolProgram = await getProtocolProgram();
  const response = await getOrCreateMarketType(
    protocolProgram as Program,
    process.argv[3],
  );
  console.log(JSON.stringify(response, null, 2));
}

export async function printAllMarketTypes() {
  const protocolProgram = await getProtocolProgram();
  const marketTypes = await protocolProgram.account.marketType.all();
  console.log(JSON.stringify(marketTypes, null, 2));
}

export async function printMarketTypeByName() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run printMarketTypeByName <NAME>");
    process.exit(1);
  }
  const protocolProgram = await getProtocolProgram();
  const publicKey = findMarketTypePda(protocolProgram, process.argv[3]).data
    .pda;
  const marketType = await protocolProgram.account.marketType.fetch(publicKey);
  console.log(JSON.stringify(marketType, null, 2));
}

export async function printMarketType() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run printMarketType <ADDRESS>");
    process.exit(1);
  }
  const protocolProgram = await getProtocolProgram();
  const publicKey = new PublicKey(process.argv[3]);
  const marketType = await protocolProgram.account.marketType.fetch(publicKey);
  console.log(JSON.stringify(marketType, null, 2));
}
