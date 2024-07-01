import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Payments: Settlement Set 05
 */
describe("Order Payments: Settlement Set 05", () => {
  it("Scenario 1: for all outcomes 10.00 @ 2.00", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;
    const price = 2.0;

    // Create market, purchaser
    const [userA, userB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(userA, 200.0);
    await market.airdrop(userB, 200.0);

    // Create orders
    const orderAA = await market.forOrder(outcomeA, 10.0, price, userA);
    const orderAB = await market.forOrder(outcomeB, 10.0, price, userA);
    const orderAC = await market.forOrder(outcomeC, 10.0, price, userA);
    const orderBA = await market.againstOrder(outcomeA, 10.0, price, userB);
    const orderBB = await market.againstOrder(outcomeB, 10.0, price, userB);
    const orderBC = await market.againstOrder(outcomeC, 10.0, price, userB);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getEscrowBalance(),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [20, 20, 20] },
        { matched: [10, 10, 10], unmatched: [0, 0, 0] },
        20,
        180,
        200,
      ],
    );

    await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getEscrowBalance(),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
      ]),
      [
        { matched: [-10, -10, -10], unmatched: [0, 0, 0] },
        { matched: [10, 10, 10], unmatched: [0, 0, 0] },
        10,
        190,
        200,
      ],
    );

    // Settlement
    await market.settle(outcomeA);
    await market.settleMarketPositionForPurchaser(userA.publicKey);
    await market.settleMarketPositionForPurchaser(userB.publicKey);
    await market.settleOrder(orderAA);
    await market.settleOrder(orderAB);
    await market.settleOrder(orderAC);
    await market.settleOrder(orderBA);
    await market.settleOrder(orderBB);
    await market.settleOrder(orderBC);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getEscrowBalance(),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
      ]),
      [
        { matched: [-10, -10, -10], unmatched: [0, 0, 0] },
        { matched: [10, 10, 10], unmatched: [0, 0, 0] },
        0,
        190,
        209,
      ],
    );
  });

  it("Scenario 2: for all outcomes 10.00 @ 3.00", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;
    const price = 3.0;

    // Create market, purchaser
    const [userA, userB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(userA, 200.0);
    await market.airdrop(userB, 200.0);

    // Create orders
    const orderAA = await market.forOrder(outcomeA, 10.0, price, userA);
    const orderAB = await market.forOrder(outcomeB, 10.0, price, userA);
    const orderAC = await market.forOrder(outcomeC, 10.0, price, userA);
    const orderBA = await market.againstOrder(outcomeA, 10.0, price, userB);
    const orderBB = await market.againstOrder(outcomeB, 10.0, price, userB);
    const orderBC = await market.againstOrder(outcomeC, 10.0, price, userB);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getEscrowBalance(),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [20, 20, 20] },
        { matched: [0, 0, 0], unmatched: [0, 0, 0] },
        20,
        180,
        200,
      ],
    );

    await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getEscrowBalance(),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [0, 0, 0] },
        { matched: [0, 0, 0], unmatched: [0, 0, 0] },
        0,
        200,
        200,
      ],
    );

    // Settlement
    await market.settle(outcomeA);
    await market.settleMarketPositionForPurchaser(userA.publicKey);
    await market.settleMarketPositionForPurchaser(userB.publicKey);
    await market.settleOrder(orderAA);
    await market.settleOrder(orderAB);
    await market.settleOrder(orderAC);
    await market.settleOrder(orderBA);
    await market.settleOrder(orderBB);
    await market.settleOrder(orderBC);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getEscrowBalance(),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [0, 0, 0] },
        { matched: [0, 0, 0], unmatched: [0, 0, 0] },
        0,
        200,
        200,
      ],
    );
  });

  it("Scenario 3: for all outcomes 10.00 @ 4.00", async () => {
    // Given
    const outcomeA = 0;
    const outcomeB = 1;
    const outcomeC = 2;
    const price = 4.0;

    // Create market, purchaser
    const [userA, userB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(userA, 200.0);
    await market.airdrop(userB, 200.0);

    // Create orders
    const orderAA = await market.forOrder(outcomeA, 10.0, price, userA);
    const orderAB = await market.forOrder(outcomeB, 10.0, price, userA);
    const orderAC = await market.forOrder(outcomeC, 10.0, price, userA);
    const orderBA = await market.againstOrder(outcomeA, 10.0, price, userB);
    const orderBB = await market.againstOrder(outcomeB, 10.0, price, userB);
    const orderBC = await market.againstOrder(outcomeC, 10.0, price, userB);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getEscrowBalance(),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
      ]),
      [
        { matched: [0, 0, 0], unmatched: [20, 20, 20] },
        { matched: [-10, -10, -10], unmatched: [0, 0, 0] },
        30,
        180,
        190,
      ],
    );

    await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getEscrowBalance(),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
      ]),
      [
        { matched: [10, 10, 10], unmatched: [0, 0, 0] },
        { matched: [-10, -10, -10], unmatched: [0, 0, 0] },
        10,
        200,
        190,
      ],
    );

    // Settlement
    await market.settle(outcomeA);
    await market.settleMarketPositionForPurchaser(userA.publicKey);
    await market.settleMarketPositionForPurchaser(userB.publicKey);
    await market.settleOrder(orderAA);
    await market.settleOrder(orderAB);
    await market.settleOrder(orderAC);
    await market.settleOrder(orderBA);
    await market.settleOrder(orderBB);
    await market.settleOrder(orderBC);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(userA),
        market.getMarketPosition(userB),
        market.getEscrowBalance(),
        market.getTokenBalance(userA),
        market.getTokenBalance(userB),
      ]),
      [
        { matched: [10, 10, 10], unmatched: [0, 0, 0] },
        { matched: [-10, -10, -10], unmatched: [0, 0, 0] },
        0,
        209,
        190,
      ],
    );
  });
});
