import { AnchorError, Program } from "@coral-xyz/anchor";
import { createMarketWithOutcomesAndPriceLadder } from "../../npm-admin-client/src";
import { monaco } from "../util/wrappers";
import assert from "assert";
import { getMarketOutcomeTitlesByMarket } from "../../npm-client";

describe("Admin Client Recreate Market", () => {
  it("Recreates a market successfully", async () => {
    const program = monaco.program as Program;

    const existingMarketWrapper = await monaco.create3WayMarket([2, 3, 4]);
    await existingMarketWrapper.voidMarket();
    const existingMarket = await monaco.fetchMarket(existingMarketWrapper.pk);
    const existingMarketType = await monaco.program.account.marketType.fetch(
      existingMarket.marketType,
    );

    const response = await createMarketWithOutcomesAndPriceLadder(
      program,
      existingMarket.title,
      existingMarketType.name,
      existingMarket.marketTypeDiscriminator,
      existingMarket.marketTypeValue,
      existingMarket.mintAccount,
      existingMarket.marketLockTimestamp,
      existingMarket.eventAccount,
      ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
      [2, 3, 4],
      {
        existingMarketPk: existingMarketWrapper.pk,
        inplayEnabled: existingMarket.inplayEnabled,
        inplayOrderDelay: existingMarket.inplayOrderDelay,
      },
    );

    assert.deepEqual(response.errors, []);
    assert(response.success);
    assert(response.data.market);
    assert(response.data.priceLadderResults);
    assert(response.data.tnxId);
    assert.deepEqual(
      response.data.market.mintAccount,
      existingMarket.mintAccount,
    );
    assert.deepEqual(response.data.market.title, existingMarket.title);
    assert.equal(response.data.market.version, existingMarket.version + 1);

    const outcomeTitles = await getMarketOutcomeTitlesByMarket(
      program,
      response.data.marketPk,
    );

    assert.equal(response.data.priceLadderResults.length, 3);
    assert.deepEqual(outcomeTitles.data.marketOutcomeTitles, [
      "TEAM_1_WIN",
      "DRAW",
      "TEAM_2_WIN",
    ]);
  });

  it("Surfaces instruction errors appropriately", async () => {
    const program = monaco.program as Program;

    const existingMarketWrapper = await monaco.create3WayMarket([2, 3, 4]);
    //await existingMarketWrapper.voidMarket(); // Don't void the market - this should result in an error
    const existingMarket = await monaco.fetchMarket(existingMarketWrapper.pk);
    const existingMarketType = await monaco.program.account.marketType.fetch(
      existingMarket.marketType,
    );

    const response = await createMarketWithOutcomesAndPriceLadder(
      program,
      existingMarket.title,
      existingMarketType.name,
      existingMarket.marketTypeDiscriminator,
      existingMarket.marketTypeValue,
      existingMarket.mintAccount,
      existingMarket.marketLockTimestamp,
      existingMarket.eventAccount,
      ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
      [2, 3, 4],
      {
        existingMarketPk: existingMarketWrapper.pk,
        inplayEnabled: existingMarket.inplayEnabled,
        inplayOrderDelay: existingMarket.inplayOrderDelay,
      },
    );
    expect((response.errors[0] as AnchorError).error.errorCode.code).toMatch(
      "MarketInvalidStatus",
    );
  });
});
