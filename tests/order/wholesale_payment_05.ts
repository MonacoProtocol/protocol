import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Wholesale Payment 05
 *
 * Testing that during settlement unmatched risk is refunded correctly.
 */
describe("Order Wholesale Payment 05", () => {
  const outcomeA = 0;
  const outcomeB = 1;
  const price = 3.0;

  it("Scenario 1: outcome-a wins", async () => {
    // Create market, purchaser
    const [userA, userB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(userA, 100.0);
    await market.airdrop(userB, 100.0);

    // CREATE --------------------------------------------------------------------

    const orderForA = await market.forOrder(outcomeA, 40, price, userA);
    const orderAgainstA = await market.againstOrder(outcomeA, 10, price, userB);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
        market.getEscrowBalance(),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [0, 40, 40] },
        { matched: [-20, 10, 10], unmatched: [0, 0, 0] },
        60,
        80,
        60,
      ],
    );

    // MATCH ---------------------------------------------------------------------

    await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
        market.getEscrowBalance(),
      ]),
      [
        { matched: [20, -10, -10], unmatched: [0, 30, 30] },
        { matched: [-20, 10, 10], unmatched: [0, 0, 0] },
        60,
        80,
        60,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeA);
    await market.settleMarketPositionForPurchaser(userA.publicKey);
    await market.settleMarketPositionForPurchaser(userB.publicKey);
    await market.settleOrder(orderForA);
    await market.settleOrder(orderAgainstA);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
        market.getEscrowBalance(),
      ]),
      [
        { matched: [20, -10, -10], unmatched: [0, 30, 30] },
        { matched: [-20, 10, 10], unmatched: [0, 0, 0] },
        118, // winnings (30) + unmatched risk (30)
        80,
        0,
      ],
    );
  });

  it("Scenario 2: outcome-b wins", async () => {
    // Create market, purchaser
    const [userA, userB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(userA, 100.0);
    await market.airdrop(userB, 100.0);

    // CREATE --------------------------------------------------------------------

    const orderForA = await market.forOrder(outcomeA, 40, price, userA);
    const orderAgainstA = await market.againstOrder(outcomeA, 10, price, userB);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
        market.getEscrowBalance(),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [0, 40, 40] },
        { matched: [-20, 10, 10], unmatched: [0, 0, 0] },
        60,
        80,
        60,
      ],
    );

    // MATCH ---------------------------------------------------------------------

    await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
        market.getEscrowBalance(),
      ]),
      [
        { matched: [20, -10, -10], unmatched: [0, 30, 30] },
        { matched: [-20, 10, 10], unmatched: [0, 0, 0] },
        60,
        80,
        60,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeB);
    await market.settleMarketPositionForPurchaser(userA.publicKey);
    await market.settleMarketPositionForPurchaser(userB.publicKey);
    await market.settleOrder(orderForA);
    await market.settleOrder(orderAgainstA);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
        market.getEscrowBalance(),
      ]),
      [
        { matched: [20, -10, -10], unmatched: [0, 30, 30] },
        { matched: [-20, 10, 10], unmatched: [0, 0, 0] },
        90, // unmatched risk (30)
        109, // winnings (30)
        0,
      ],
    );
  });

  it("Scenario 3: outcome-c wins", async () => {
    // same as "Scenario 2: outcome-b wins"
  });
});
