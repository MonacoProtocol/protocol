import {
  Program,
  AnchorProvider,
  setProvider,
  workspace,
} from "@project-serum/anchor";
import assert from "assert";
import { validateMarketOutcomes } from "../../npm-admin-client/src";
import { monaco } from "../util/wrappers";

describe("Check Created Markets", () => {
  const outcomes = ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"];
  const priceLadder = [1.001];
  const provider = AnchorProvider.local();
  setProvider(provider);

  it("Validates Market Outcomes", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const market = await monaco.create3WayMarket(priceLadder);
    const checkMarketResponse = await validateMarketOutcomes(
      protocolProgram,
      market.pk,
      outcomes,
      priceLadder,
    );

    assert(checkMarketResponse.success);
    assert(checkMarketResponse.data.outcomesValid);
    assert(checkMarketResponse.data.priceLaddersValid);
    assert(checkMarketResponse.data.marketValid);
    assert.deepEqual(checkMarketResponse.data.missingOutcomes, []);
    assert.deepEqual(checkMarketResponse.errors, []);

    // Test for expecting an additional outcome and an additional price on the price ladders
    const bonusOutcome = [...outcomes, "BONUS"];
    const bonusPrice = [...priceLadder, 2];
    const checkMarketResponseMissingOutcomeAndPrice =
      await validateMarketOutcomes(
        protocolProgram,
        market.pk,
        bonusOutcome,
        bonusPrice,
      );

    assert(checkMarketResponseMissingOutcomeAndPrice.success);
    assert.equal(
      checkMarketResponseMissingOutcomeAndPrice.data.outcomesValid,
      false,
    );
    assert.equal(
      checkMarketResponseMissingOutcomeAndPrice.data.priceLaddersValid,
      false,
    );
    assert.equal(
      checkMarketResponseMissingOutcomeAndPrice.data.marketValid,
      false,
    );
    assert.deepEqual(
      checkMarketResponseMissingOutcomeAndPrice.data.missingOutcomes,
      ["BONUS"],
    );

    checkMarketResponseMissingOutcomeAndPrice.data.priceLadderValidation.map(
      (priceLadderValidation) => {
        assert.deepEqual(priceLadderValidation.missingPrices, [2]);
      },
    );

    // Test for getting back more outcomes and prices than expected
    const minusOutcome = [...outcomes];
    const removedOutcome = minusOutcome.pop();
    const checkMarketResponseAdditionalOutcomeAndPrice =
      await validateMarketOutcomes(
        protocolProgram,
        market.pk,
        minusOutcome,
        [],
      );

    assert(checkMarketResponseAdditionalOutcomeAndPrice.success);
    assert.equal(
      checkMarketResponseAdditionalOutcomeAndPrice.data.outcomesValid,
      false,
    );
    assert.equal(
      checkMarketResponseAdditionalOutcomeAndPrice.data.priceLaddersValid,
      false,
    );
    assert.equal(
      checkMarketResponseAdditionalOutcomeAndPrice.data.marketValid,
      false,
    );
    assert.deepEqual(
      checkMarketResponseAdditionalOutcomeAndPrice.data.additionalOutcomes,
      [removedOutcome],
    );

    checkMarketResponseAdditionalOutcomeAndPrice.data.priceLadderValidation.map(
      (priceLadderValidation) => {
        assert.deepEqual(priceLadderValidation.additionalPrices, [1.001]);
      },
    );
  });
});
