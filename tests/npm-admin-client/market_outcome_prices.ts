import {
  Program,
  AnchorProvider,
  setProvider,
  workspace,
} from "@project-serum/anchor";
import assert from "assert";
import {
  addPricesToOutcome,
  batchAddPricesToOutcomePool,
  batchAddPricesToAllOutcomePools,
} from "../../npm-admin-client/src";
import { monaco } from "../util/wrappers";

describe("Add prices to outcome", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);
  const newPrices = [2, 5];
  const outcomeIndex = 0;

  it("Adds prices to given outcome", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const market = await monaco.create3WayMarket([1.001]);
    const outcomePda = market.outcomePks[0];
    const addPricesResponse = await addPricesToOutcome(
      protocolProgram,
      market.pk,
      outcomeIndex,
      newPrices,
    );

    const updatedMarketOutcome = await monaco.fetchMarketOutcome(outcomePda);

    assert(addPricesResponse.success);
    assert(addPricesResponse.data.tnxId);
    assert.deepEqual(addPricesResponse.errors, []);
    newPrices.map((price) => {
      assert(updatedMarketOutcome.priceLadder.includes(price));
    });
  });
});

describe("Batch add prices to outcome", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);
  const newPrices = [2, 5];
  const batchSize = 1;
  const outcomeIndex = 0;

  it("Batch add prices to given outcome", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const market = await monaco.create3WayMarket([1.001]);
    const outcomePda = market.outcomePks[0];
    const addPricesResponse = await batchAddPricesToOutcomePool(
      protocolProgram,
      market.pk,
      outcomeIndex,
      newPrices,
      batchSize,
    );

    const updatedMarketOutcome = await monaco.fetchMarketOutcome(outcomePda);

    assert(addPricesResponse.success);
    assert.equal(
      addPricesResponse.data.batches.length,
      newPrices.length / batchSize,
    );
    assert.deepEqual(addPricesResponse.errors, []);
    addPricesResponse.data.batches.map((tnx, i) => {
      assert(tnx.tnxId);
      assert.equal(tnx.priceLadder, newPrices[i]);
    });
    newPrices.map((price) => {
      assert(updatedMarketOutcome.priceLadder.includes(price));
    });
  });
});

describe("Batch add prices to outcomes", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);
  const newPrices = [2, 5];
  const batchSize = 1;

  it("Batch add prices to given outcomes", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const market = await monaco.create3WayMarket([1.001]);

    const addPricesResponse = await batchAddPricesToAllOutcomePools(
      protocolProgram,
      market.pk,
      newPrices,
      batchSize,
    );

    assert(addPricesResponse.success);
    assert.equal(addPricesResponse.data.results.length, 3);
    assert.deepEqual(addPricesResponse.errors, []);
    addPricesResponse.data.results.map((outcome) => {
      outcome.batches.map((tnx, i) => {
        assert(tnx.tnxId);
        assert.equal(tnx.priceLadder, newPrices[i]);
      });
    });

    for (const outcomePk of market.outcomePks) {
      const outcome = await monaco.fetchMarketOutcome(outcomePk);
      newPrices.map((price) => {
        assert(outcome.priceLadder.includes(price));
      });
    }
  });
});
