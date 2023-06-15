import { PublicKey } from "@solana/web3.js";
import { getProtocolProgram } from "./util";

export function print_order() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run printOrder <ADDRESS>");
    process.exit(1);
  }

  const orderPK = new PublicKey(process.argv[3]);
  get_order(orderPK).then(
    (order) => console.log(JSON.stringify(order)),
    (reason) => console.log(reason),
  );
}

async function get_order(orderPK: PublicKey) {
  const program = await getProtocolProgram();
  return await program.account.order.fetch(orderPK);
}
