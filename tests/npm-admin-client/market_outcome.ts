import { PublicKey } from "@solana/web3.js";
import { workspace } from "@coral-xyz/anchor";
import assert from "assert";
import { monaco } from "../util/wrappers";
import {
  confirmTransaction,
  initialiseOutcomes,
} from "../../npm-admin-client/src";

describe("Initialise outcome on market", () => {
  it("Initialises additional outcome", async () => {
    // create a new market
    const protocolProgram = workspace.MonacoProtocol;
    const market = await monaco.createMarket(
      ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
      [1.001, 1.01, 1.1],
    );

    // check the state of the newly created account
    const account = await monaco.fetchMarket(market.pk);
    assert.deepEqual(account.title, "SOME TITLE");
    assert.deepEqual(account.marketOutcomesCount, 3);

    const marketOutcomeIndex = account.marketOutcomesCount;
    const [marketOutcomePk] = await PublicKey.findProgramAddress(
      [market.pk.toBuffer(), Buffer.from(marketOutcomeIndex.toString())],
      monaco.program.programId,
    );

    const response = await initialiseOutcomes(protocolProgram, market.pk, [
      "EXTRA",
    ]);

    for (const signature of response.data.signatures) {
      await confirmTransaction(protocolProgram, signature);
    }

    await new Promise((e) => setTimeout(e, 1000));

    const marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketOutcomesCount, 4);

    const marketOutcome = await monaco.fetchMarketOutcome(marketOutcomePk);
    assert.deepEqual(marketOutcome.index, 3);
    assert.deepEqual(marketOutcome.title, "EXTRA");
    assert.deepEqual(marketOutcome.priceLadder, []);
  });
});
