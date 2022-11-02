import { PublicKey } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import assert from "assert";
import { monaco } from "../util/wrappers";
import { initialiseOutcome } from "../../npm-admin-client/src";

describe("Initialise outcome on market", () => {
  it("Initialises additional outcome", async () => {
    // create a new market
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

    const response = await initialiseOutcome(
      monaco.program as Program,
      market.pk,
      "EXTRA",
    );

    const marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketOutcomesCount, 4);

    assert.deepEqual(response.data.outcomePda, marketOutcomePk);
    const marketOutcome = await monaco.fetchMarketOutcome(
      response.data.outcomePda,
    );
    assert.deepEqual(marketOutcome.index, 3);
    assert.deepEqual(marketOutcome.title, "EXTRA");
    assert.deepEqual(marketOutcome.priceLadder, []);
  });
});
