import { BN } from "@coral-xyz/anchor";
import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

async function mapOrder(
  orderPromise: Promise<{ stake: BN; stakeUnmatched: BN; voidedStake: BN }>,
) {
  const order = await orderPromise;
  return {
    stake: order.stake.toNumber(),
    stakeUnmatched: order.stakeUnmatched.toNumber(),
    voidedStake: order.voidedStake.toNumber(),
  };
}

/*
 * Testing security of the endpoint
 */
describe("Security: Settle Order", () => {
  it("partially canceled order", async () => {
    // Given
    const outcomeA = 0;
    const price = 3.0;

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);

    // CREATE --------------------------------------------------------------------

    const orderForA = await market.forOrder(outcomeA, 5, price, purchaserA);
    const orderAgainstA = await market.againstOrder(
      outcomeA,
      10,
      price,
      purchaserB,
    );

    await market.processMatchingQueue();
    await market.cancel(orderAgainstA, purchaserB);

    assert.deepEqual(
      await Promise.all([
        mapOrder(monaco.fetchOrder(orderForA)),
        mapOrder(monaco.fetchOrder(orderAgainstA)),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { stake: 5000000, stakeUnmatched: 0, voidedStake: 0 },
        { stake: 10000000, stakeUnmatched: 0, voidedStake: 5000000 },
        15,
        95,
        90,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeA);

    await market.settleOrder(orderForA);
    await market.settleOrder(orderAgainstA);
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);

    assert.deepEqual(
      await Promise.all([
        mapOrder(monaco.fetchOrder(orderForA)),
        mapOrder(monaco.fetchOrder(orderAgainstA)),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
      ]),
      [
        { stake: 5000000, stakeUnmatched: 0, voidedStake: 0 },
        { stake: 10000000, stakeUnmatched: 0, voidedStake: 5000000 },
        0,
        109,
        90,
      ],
    );
  });

  it("Settling Order twice does not payout twice", async () => {
    // Given
    const outcomeA = 0;
    const price = 3.0;

    // Create market, purchaser
    const [purchaserA, purchaserB, purchaserC, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);
    await market.airdrop(purchaserC, 100.0);

    // CREATE --------------------------------------------------------------------

    const pA_forA_pk = await market.forOrder(outcomeA, 1, price, purchaserA);
    const pB_forA_pk = await market.forOrder(outcomeA, 10, price, purchaserB);
    await market.againstOrder(outcomeA, 11, price, purchaserC);

    await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [2, -1, -1], unmatched: [0, 0, 0] },
        { matched: [20, -10, -10], unmatched: [0, 0, 0] },
        { matched: [-22, 11, 11], unmatched: [0, 0, 0] },
        33,
        99,
        90,
        78,
      ],
    );

    // SETTLE ---------------------------------------------------------------------

    await market.settle(outcomeA);

    await market.settleOrder(pA_forA_pk); // <- calling 1st time
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [2, -1, -1], unmatched: [0, 0, 0] },
        { matched: [20, -10, -10], unmatched: [0, 0, 0] },
        { matched: [-22, 11, 11], unmatched: [0, 0, 0] },
        30,
        101.8, // <- paid out: 102 - 99 = 3 ! (minus 10% commission on 2 profit)
        90,
        78,
      ],
    );

    await market.settleOrder(pA_forA_pk); // <- calling 2nd time
    await market.settleMarketPositionForPurchaser(purchaserA.publicKey);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [2, -1, -1], unmatched: [0, 0, 0] },
        { matched: [20, -10, -10], unmatched: [0, 0, 0] },
        { matched: [-22, 11, 11], unmatched: [0, 0, 0] },
        30,
        101.8, // <- no change !
        90,
        78,
      ],
    );

    await market.settleOrder(pB_forA_pk);
    await market.settleMarketPositionForPurchaser(purchaserB.publicKey);

    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getMarketPosition(purchaserC),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaserA),
        market.getTokenBalance(purchaserB),
        market.getTokenBalance(purchaserC),
      ]),
      [
        { matched: [2, -1, -1], unmatched: [0, 0, 0] },
        { matched: [20, -10, -10], unmatched: [0, 0, 0] },
        { matched: [-22, 11, 11], unmatched: [0, 0, 0] },
        0,
        101.8,
        118,
        78,
      ],
    );
  });
});
