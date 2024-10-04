import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";
import { AnchorError } from "@coral-xyz/anchor";

describe("Order Matching: Cross Liquidity A", () => {
  it("2-way market", async () => {
    await execute(2);
  });

  it("3-way market", async () => {
    await execute(3);
  });

  it("4-way market", async () => {
    await execute(4);
  });

  it("5-way market", async () => {
    await execute(5);
  });

  it("6-way market", async () => {
    await execute(6).then(
      function (_) {
        assert.fail("MarketTooManyOutcomes expected");
      },
      function (e: AnchorError) {
        assert.equal(e.error.errorCode.code, "MarketTooManyOutcomes");
      },
    );
  });
});

async function execute(outcomesCount: number) {
  const outcomes = "ABCDEFGHIJKL".slice(0, outcomesCount).split("");
  const outcomesLastIndex = outcomes.length - 1;
  const makerOutcomes = outcomes.slice(0, outcomesLastIndex);

  // create market and top up purchasers
  const price = outcomes.length;
  const market = await monaco.createMarket(
    outcomes,
    new Array(outcomes.length).fill(price),
  );
  await market.open(true);

  // create purchaser for each outcome
  const purchasers = await Promise.all(
    outcomes.map((_) => createWalletWithBalance(monaco.provider)),
  );
  await Promise.all(
    purchasers.map((purchaser) => market.airdrop(purchaser, 10)),
  );

  // create (n-1) orders to generate cross liquidity
  const orders = [];
  for (let outcomeIndex = 0; outcomeIndex < outcomesCount - 1; outcomeIndex++) {
    const order = await market.forOrder(
      outcomeIndex,
      1,
      price,
      purchasers[outcomeIndex],
    );
    orders.push(order);
  }
  await market.processOrderRequests();

  // update cross liquidity
  const sourceLiquidities = makerOutcomes.map((_, outcomeIndex) => {
    return { outcome: outcomeIndex, price };
  });
  await market.updateMarketLiquiditiesWithCrossLiquidity(
    true,
    sourceLiquidities,
  );

  // validate expected liquidity
  assert.deepEqual(await monaco.getMarketLiquidities(market.liquiditiesPk), {
    liquiditiesAgainst: [
      {
        liquidity: 1,
        outcome: outcomesLastIndex,
        price,
        sources: makerOutcomes.map((_, outcomeIndex) => {
          return { outcome: outcomeIndex, price };
        }),
      },
    ],
    liquiditiesFor: makerOutcomes.map((_, outcomeIndex) => {
      return {
        liquidity: 1,
        outcome: outcomeIndex,
        price,
        sources: [],
      };
    }),
  });

  // match cross liquidity
  const orderLast = await market.forOrder(
    outcomesLastIndex,
    1,
    price,
    purchasers[outcomesLastIndex],
  );
  await market.processMatchingQueue();

  // validate expected liquidity
  assert.deepEqual(await monaco.getMarketLiquidities(market.liquiditiesPk), {
    liquiditiesAgainst: [],
    liquiditiesFor: [],
  });
  assert.deepEqual(await market.getEscrowBalance(), outcomes.length);

  // settle
  await market.settle(0);
  await Promise.all(
    purchasers.map((purchaser) =>
      market.settleMarketPositionForPurchaser(purchaser.publicKey, false),
    ),
  );
  await Promise.all(orders.map((order) => market.settleOrder(order)));
  await market.settleOrder(orderLast);

  // validate that only winners commission left in escrow
  assert.equal(await market.getEscrowBalance(), (outcomes.length - 1) / 10);
}
