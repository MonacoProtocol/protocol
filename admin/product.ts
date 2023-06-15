import { createProduct } from "../npm-client/src/product";
import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";

export async function create_product() {
  if (process.argv.length != 6) {
    console.log(
      "Usage: yarn run create_product <PRODUCT_TITLE> <COMMISSION_RATE> <COMMISSION_ESCROW>",
    );
    process.exit(1);
  }

  const title = process.argv[3];
  const commissionRate = parseFloat(process.argv[4]);
  const commissionEscrow = new PublicKey(process.argv[5]);

  const program = await getProtocolProductProgram();
  const result = await createProduct(
    program as Program,
    title,
    commissionRate,
    commissionEscrow,
  );
  console.log(JSON.stringify(result, null, 2));
}

function getProtocolProductProgram() {
  return Program.at(
    "mppFrYmM6A4Ud3AxRbGXsGisX1HUsbDfp1nrg9FQJEE",
    anchor.getProvider(),
  );
}
