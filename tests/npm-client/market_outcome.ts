import { Program } from "@project-serum/anchor";
import assert from "assert";
import {
  MarketOutcomes,
  getMarketOutcomesByMarket,
  getMarketOutcomeTitlesByMarket,
} from "../../npm-client/src/market_outcome_query";
import { monaco } from "../util/wrappers";

describe("Market Outcomes", () => {
  it("marketOutcomeQuery fetchPublicKeys", async () => {
    // Create market, purchaser
    const market = await monaco.create3WayMarket([3.0]);

    const response = await MarketOutcomes.marketOutcomeQuery(
      monaco.program as Program,
    )
      .filterByMarket(market.pk)
      .fetchPublicKeys();

    assert.deepEqual(response.data.publicKeys.length, 3);
  });

  it("marketOutcomeQuery fetch", async () => {
    // Create market, purchaser
    const market = await monaco.create3WayMarket([3.0]);

    const response = await MarketOutcomes.marketOutcomeQuery(
      monaco.program as Program,
    )
      .filterByMarket(market.pk)
      .fetch();

    const titles = response.data.marketOutcomeAccounts.map(
      (account) => account.account.title,
    );

    assert.deepEqual(titles, ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"]);
  });

  it("getMarketOutcomesByMarket", async () => {
    // Create market, purchaser
    const market = await monaco.create3WayMarket([3.0]);

    const response = await getMarketOutcomesByMarket(
      monaco.program as Program,
      market.pk,
    );

    const titles = response.data.marketOutcomeAccounts.map(
      (account) => account.account.title,
    );

    assert.deepEqual(titles, ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"]);
  });

  it("getMarketOutcomeTitlesByMarket", async () => {
    // Create market, purchaser
    const market = await monaco.create3WayMarket([3.0]);

    const response = await getMarketOutcomeTitlesByMarket(
      monaco.program as Program,
      market.pk,
    );

    assert.deepEqual(response.data.marketOutcomeTitles, [
      "TEAM_1_WIN",
      "DRAW",
      "TEAM_2_WIN",
    ]);
  });
});
