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

    const AforPk = await market.forOrder(outcome, stake, price, purchaserA);
    const BAgainstPk = await market.againstOrder(
      outcome,
      stake,
      price,
      purchaserB,
    );

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

    const AforPk = await market.forOrder(outcome, stake, price, purchaserA);
    const BAgainstPk = await market.againstOrder(
      outcome,
      stake,
      price,
      purchaserB,
    );

    await market.settle(0);

    // MATCH --------------------------------------------------------------------
    try {
      await market.match(AforPk, BAgainstPk);
      assert(false, "an exception should have been thrown");
    } catch (err) {
      assert.ok(err.logs.toString().includes("MarketNotOpen"));
    }
  });

  it("matching: orders created before market lock should match after lock", async () => {
    const price = 2.0;
    const now = Math.floor(new Date().getTime() / 1000);
    const lockTime = now + 10;

    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price], false, 0, lockTime, lockTime),
    ]);

    await Promise.all([
      market.airdrop(purchaserA, 100.0),
      market.airdrop(purchaserB, 50.0),
    ]);

    const AforPk = await market.forOrder(1, 10, price, purchaserA);
    const BAgainstPk = await market.againstOrder(1, 10, price, purchaserB);

    // wait for market lock
    await new Promise((e) => setTimeout(e, 10000));
    await market.match(AforPk, BAgainstPk);

    assert.deepEqual(
      await Promise.all([monaco.getOrder(AforPk), monaco.getOrder(BAgainstPk)]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
      ],
    );
  });
});
