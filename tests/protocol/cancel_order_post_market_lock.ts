import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { Monaco, monaco } from "../util/wrappers";

// Order parameters
const outcomeIndex = 1;
const price = 6.0;
const stake = 2000;

describe("Security: Cancel Order Post Market Lock", () => {
  it("success: unmatched order", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    // Update Market's lock time to now
    await market.updateMarketLockTimeToNow();
    await market.cancelOrderPostMarketLock(orderPk);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 2000, status: { cancelled: {} } },
        { matched: [0, 0, 0], unmatched: [0, 0, 0] },
        0,
        10000,
      ],
    );
  });

  it("failure: matched order", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    const matchingOrderPk = await market.againstOrder(
      outcomeIndex,
      stake,
      price,
      purchaser,
    );
    await market.match(orderPk, matchingOrderPk);

    // Update Market's lock time to now
    await market.updateMarketLockTimeToNow();

    try {
      await market.cancelOrderPostMarketLock(orderPk);
      assert.fail("expected CancelOrderNotCancellable");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelOrderNotCancellable");
    }
  });
});

async function setupUnmatchedOrder(
  protocol: Monaco,
  outcomeIndex: number,
  price: number,
  stake: number,
) {
  // Create market, purchaser
  const now = Math.floor(Date.now() / 1000);
  const [purchaser, market] = await Promise.all([
    createWalletWithBalance(protocol.provider),
    protocol.createMarketWithOptions({
      outcomes: ["a", "b", "c"],
      priceLadder: [price],
      eventStartTimestamp: now + 1000,
      marketLockTimestamp: now + 1000,
      marketLockOrderBehaviour: { cancelUnmatched: {} },
    }),
  ]);
  await market.open();
  await market.airdrop(purchaser, 10_000);

  const orderPk = await market.forOrder(outcomeIndex, stake, price, purchaser);

  assert.deepEqual(
    await Promise.all([
      protocol.getOrder(orderPk),
      market.getMarketPosition(purchaser),
      market.getEscrowBalance(),
      market.getTokenBalance(purchaser),
    ]),
    [
      { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
      { matched: [0, 0, 0], unmatched: [2000, 0, 2000] },
      2000,
      8000,
    ],
  );

  return { market, purchaser, orderPk };
}
