import { BorshAccountsCoder } from "@project-serum/anchor";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { getAnchorProvider, getProtocolProgram } from "./util";
import {
  findAuthorisedOperatorsAccountPda,
  Operator,
} from "../npm-admin-client/src";

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

export async function dequeue_order() {
  if (process.argv.length != 5) {
    console.log("Usage: yarn run dequeueOrder <MATCHING_POOL_ID> <ORDER_ID>");
    process.exit(1);
  }

  const matchingPoolPk = process.argv[3];
  const orderPk = new PublicKey(process.argv[4]);

  const program = await getProtocolProgram();

  const authorisedOperators = await findAuthorisedOperatorsAccountPda(
    program,
    Operator.MARKET,
  );

  await program.methods
    .dequeueOrder(orderPk)
    .accounts({
      matchingPool: matchingPoolPk,
      authorisedOperators: authorisedOperators.data.pda,
      crankOperator: getAnchorProvider().wallet.publicKey,
    })
    .rpc();
}
