import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import assert from "assert";
import { getMarketPosition, createMarketPosition } from "../../npm-client/src";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

describe("Market Position", () => {
  it("fetching from chain", async () => {
    // Create market, purchaser
    const [wallet1, wallet2, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([3.0]),
    ]);
    await market.airdrop(wallet1, 10_000.0);
    await market.airdrop(wallet2, 10_000.0);

    // create ORDERS
    const orders = [
      {
        marketOutcomeIndex: 0,
        marketOutcomePrice: 3.0,
        stake: 10.0,
        for: true,
        expectedPosition: new Map([
          ["TEAM_1_WIN", new BN(20_000_000)],
          ["DRAW", new BN(-10_000_000)],
          ["TEAM_2_WIN", new BN(-10_000_000)],
        ]),
      },
      {
        marketOutcomeIndex: 0,
        marketOutcomePrice: 3.0,
        stake: 2.5,
        for: false,
        expectedPosition: new Map([
          ["TEAM_1_WIN", new BN(15_000_000)],
          ["DRAW", new BN(-7_500_000)],
          ["TEAM_2_WIN", new BN(-7_500_000)],
        ]),
      },
      {
        marketOutcomeIndex: 1,
        marketOutcomePrice: 3.0,
        stake: 2.0,
        for: true,
        expectedPosition: new Map([
          ["TEAM_1_WIN", new BN(13_000_000)],
          ["DRAW", new BN(-3_500_000)],
          ["TEAM_2_WIN", new BN(-9_500_000)],
        ]),
      },
      {
        marketOutcomeIndex: 1,
        marketOutcomePrice: 3.0,
        stake: 0.5,
        for: false,
        expectedPosition: new Map([
          ["TEAM_1_WIN", new BN(13_500_000)],
          ["DRAW", new BN(-4_500_000)],
          ["TEAM_2_WIN", new BN(-9_000_000)],
        ]),
      },
      {
        marketOutcomeIndex: 2,
        marketOutcomePrice: 3.0,
        stake: 4.0,
        for: true,
        expectedPosition: new Map([
          ["TEAM_1_WIN", new BN(9_500_000)],
          ["DRAW", new BN(-8_500_000)],
          ["TEAM_2_WIN", new BN(-1_000_000)],
        ]),
      },
      {
        marketOutcomeIndex: 2,
        marketOutcomePrice: 3.0,
        stake: 1.0,
        for: false,
        expectedPosition: new Map([
          ["TEAM_1_WIN", new BN(10_500_000)],
          ["DRAW", new BN(-7_500_000)],
          ["TEAM_2_WIN", new BN(-3_000_000)],
        ]),
      },
    ];

    for (const order of orders) {
      if (order.stake == 0) {
        continue;
      }

      await market.forOrder(
        order.marketOutcomeIndex,
        order.stake,
        order.marketOutcomePrice,
        order.for ? wallet1 : wallet2,
      );

      await market.againstOrder(
        order.marketOutcomeIndex,
        order.stake,
        order.marketOutcomePrice,
        order.for ? wallet2 : wallet1,
      );

      await market.processMatchingQueue();

      const marketPosition = await getMarketPosition(
        monaco.program as anchor.Program<anchor.Idl>,
        market.pk,
        wallet1.publicKey,
      );

      assert.deepEqual(
        marketPosition.data.outcomePositions,
        order.expectedPosition,
      );
    }
  });

  it("create market position", async () => {
    const [wallet1, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([3.0]),
    ]);
    await market.airdrop(wallet1, 10_000.0);

    await createMarketPosition(monaco.program, market.pk, wallet1.publicKey);

    const marketPosition = (
      await getMarketPosition(
        monaco.program as anchor.Program<anchor.Idl>,
        market.pk,
        wallet1.publicKey,
      )
    ).data;

    // Check that payer is the default provider, and purchaser is the wallet we just created
    assert.deepEqual(marketPosition.payer, monaco.provider.wallet.publicKey);
    assert.deepEqual(marketPosition.purchaser, wallet1.publicKey);
  });
});
