import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Matching Refunds 1
 */
describe("Order Matching Market State", () => {
  it("matching: market in correct state", async () => {
    const stake = 10;
    const price = 2.0;
    const outcome = 1;
    const startBalanceA = 100.0;
    const startBalanceB = 50.0;

    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);

    await Promise.all([
      market.airdrop(purchaserA, startBalanceA),
      market.airdrop(purchaserB, startBalanceB),
    ]);

    // CREATE --------------------------------------------------------------------

    const [AforPk, BAgainstPk] = await Promise.all([
      market.forOrder(outcome, stake, price, purchaserA),
      market.againstOrder(outcome, stake, price, purchaserB),
    ]);

    // MATCH --------------------------------------------------------------------

    await market.match(AforPk, BAgainstPk);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(AforPk),
        monaco.getOrder(BAgainstPk),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { len: 0, liquidity: 0, matched: 10 },
        { len: 0, liquidity: 0, matched: 10 },
        20,
        90,
        40,
      ],
    );
  });

  it("matching: market is not open", async () => {
    const stake = 10;
    const price = 2.0;
    const outcome = 1;
    const startBalanceA = 100.0;
    const startBalanceB = 50.0;

    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);

    await Promise.all([
      market.airdrop(purchaserA, startBalanceA),
      market.airdrop(purchaserB, startBalanceB),
    ]);

    // CREATE --------------------------------------------------------------------

    const [AforPk, BAgainstPk] = await Promise.all([
      market.forOrder(outcome, stake, price, purchaserA),
      market.againstOrder(outcome, stake, price, purchaserB),
    ]);

    await market.settle(0);

    // MATCH --------------------------------------------------------------------
    try {
      await market.match(AforPk, BAgainstPk);
      assert(false, "an exception should have been thrown");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "MarketNotOpen");
    }
  });
});
