import { BorshAccountsCoder } from "@project-serum/anchor";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { getAnchorProvider, getProtocolProgram } from "./util";

export async function get_all_orders() {
  const program = await getProtocolProgram();
  getAnchorProvider()
    .connection.getProgramAccounts(program.programId, {
      dataSlice: { offset: 0, length: 0 }, // fetch without any data.
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(
              BorshAccountsCoder.accountDiscriminator("order"),
            ),
          },
        },
      ],
    })
    .then(
      (accounts) => {
        const accountPKs = accounts.map((account) => account.pubkey.toBase58());
        console.log(JSON.stringify(accountPKs));
      },
      (reason) => console.log(reason),
    );
}

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
