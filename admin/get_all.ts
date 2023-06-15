import { BorshAccountsCoder } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { getAnchorProvider, getProtocolProgram } from "./util";

export async function getAllMarkets() {
  await _getAllByDiscriminator("market");
}

export async function getAllOrders() {
  await _getAllByDiscriminator("order");
}

export async function getAll() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run getAll <ACCOUNT_DISCRIMINATOR>");
    process.exit(1);
  }

  await _getAllByDiscriminator(process.argv[3]);
}

async function _getAllByDiscriminator(accountDiscriminator: string) {
  const program = await getProtocolProgram();
  getAnchorProvider()
    .connection.getProgramAccounts(program.programId, {
      dataSlice: { offset: 0, length: 0 }, // fetch without any data.
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(
              BorshAccountsCoder.accountDiscriminator(accountDiscriminator),
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
