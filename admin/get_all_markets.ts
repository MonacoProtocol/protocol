import { BorshAccountsCoder } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { getAnchorProvider, getProtocolProgram } from "./util";

export async function get_all_markets() {
  const program = await getProtocolProgram();
  getAnchorProvider()
    .connection.getProgramAccounts(program.programId, {
      dataSlice: { offset: 0, length: 0 }, // fetch without any data.
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(
              BorshAccountsCoder.accountDiscriminator("market"),
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
