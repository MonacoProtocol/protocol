import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

describe("Security: Settle Market", () => {
  it("failed: matching queue not empty", async () => {
    // Given
    const outcome = 0;
    const price = 3.0;
    const stake = 10.0;

    // Create market, purchasers
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await Promise.all([
      market.airdrop(purchaserA, 100.0),
      market.airdrop(purchaserB, 100.0),
    ]);

    // Create matching orders
    await market.forOrder(outcome, stake, price, purchaserA);
    await market.againstOrder(outcome, stake, price, purchaserB);

    // Check the queue is not empty
    assert.deepEqual(
      await Promise.all([
        market.getMarketMatchingQueueHead().then((head) => {
          return {
            forOutcome: head.forOutcome,
            outcomeIndex: head.outcomeIndex,
            price: head.price,
            stake: head.stake,
          };
        }),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        {
          forOutcome: true,
          outcomeIndex: 0,
          price: 3,
          stake: 10,
        },
        30,
        90,
        80,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    try {
      await market.settle(outcome);
      assert.fail("expected SettlementMarketMatchingQueueNotEmpty");
    } catch (e) {
      assert.equal(
        e.error.errorCode.code,
        "SettlementMarketMatchingQueueNotEmpty",
      );
    }
  });
});
