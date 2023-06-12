import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Testing security of the endpoint
 */
describe("Security: Settle Order", () => {
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
    const pC_againstA_pk = await market.againstOrder(
      outcomeA,
      11,
      price,
      purchaserC,
    );

    await market.match(pA_forA_pk, pC_againstA_pk);
    await market.match(pB_forA_pk, pC_againstA_pk);

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
