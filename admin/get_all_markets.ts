import { BorshAccountsCoder } from "@project-serum/anchor";
import bs58 from "bs58";
import { getAnchorProvider, getProtocolProgram } from "./util";
import { Markets } from "../npm-client/src/market_query";
import { MarketStatus } from "../npm-client/types/market";

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

export async function getAllMarketsReadyForSettlement() {
  console.log(
    JSON.stringify(
      await Markets.marketQuery(await getProtocolProgram())
        .filterByStatus(MarketStatus.ReadyForSettlement)
        .fetchPublicKeys(),
      null,
      2,
    ),
  );
}
