import {
  createPriceLadderWithPrices,
  findPriceLadderPda,
} from "../npm-admin-client/src/";
import { getProtocolProgram } from "./util";

export async function createPriceLadder() {
  if (process.argv.length != 5) {
    console.log(
      "Usage: yarn run createPriceLadder <NAME> <JSON_LIST_OF_PRICES>",
    );
    process.exit(1);
  }

  const distinctSeed = process.argv[3];
  const prices = JSON.parse(process.argv[4]);

  const protocolProgram = await getProtocolProgram();
  const priceLadderPk = findPriceLadderPda(protocolProgram, distinctSeed).data
    .pda;

  const response = await createPriceLadderWithPrices(
    protocolProgram,
    priceLadderPk,
    distinctSeed,
    prices,
  );
  if (!response.success) {
    throw response.errors[0];
  }
  console.log(priceLadderPk);
}
