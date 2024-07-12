import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import assert from "assert";
import {
  createWalletWithBalance,
  executeTransactionMaxCompute,
} from "../util/test_util";
import { monaco } from "../util/wrappers";
import { findTradePda } from "../../npm-client/src";

describe("Matching Crank", () => {
  it("Unauthorised crank should error", async () => {
    // Given
    const outcome = 1;
    const stake = 10;
    const price = 6.0;

    // Create market, purchaser
    const [market, authorisedOperatorsPk, purchaserA, purchaserB] =
      await Promise.all([
        monaco.create3WayMarket([price]),
        monaco.findCrankAuthorisedOperatorsPda(),
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
      ]);
    await Promise.all([
      await market.airdrop(purchaserA, 100_000),
      await market.airdrop(purchaserB, 100_000),
    ]);

    const forOrder1Pk = await market.forOrderRequest(
      outcome,
      stake,
      price,
      purchaserA,
    );
    const againstOrder1Pk = await market.againstOrderRequest(
      outcome,
      stake,
      price,
      purchaserB,
    );
    const againstOrder2Pk = await market.againstOrderRequest(
      outcome,
      stake,
      price,
      purchaserB,
    );
    await market.processNextOrderRequest();
    await market.processNextOrderRequest();
    await market.processNextOrderRequest();

    // match not fully processed by v2

    const marketMatchingPools = market.matchingPools[outcome][price];

    const [forTradePk, againstTradePk] = await Promise.all([
      findTradePda(monaco.getRawProgram(), forOrder1Pk.data.orderPk),
      findTradePda(monaco.getRawProgram(), againstOrder2Pk.data.orderPk),
    ]);

    //
    // CRANK
    //
    const ix = await monaco.program.methods
      .matchOrders(
        Array.from(forTradePk.data.distinctSeed),
        Array.from(againstTradePk.data.distinctSeed),
      )
      .accounts({
        orderFor: forOrder1Pk.data.orderPk,
        orderAgainst: againstOrder2Pk.data.orderPk,
        tradeFor: forTradePk.data.tradePk,
        tradeAgainst: againstTradePk.data.tradePk,
        marketPositionFor: await market.cacheMarketPositionPk(
          purchaserA.publicKey,
        ),
        marketPositionAgainst: await market.cacheMarketPositionPk(
          purchaserB.publicKey,
        ),
        purchaserTokenAccountFor: await market.cachePurchaserTokenPk(
          purchaserA.publicKey,
        ),
        purchaserTokenAccountAgainst: await market.cachePurchaserTokenPk(
          purchaserB.publicKey,
        ),
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketLiquidities: market.liquiditiesPk,
        marketOutcome: market.outcomePks[outcome],
        marketMatchingPoolFor: marketMatchingPools.forOutcome,
        marketMatchingPoolAgainst: marketMatchingPools.against,
        crankOperator: monaco.operatorPk,
        authorisedOperators: authorisedOperatorsPk,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    await executeTransactionMaxCompute([ix]).then(
      function (_) {
        console.log();
      },
      function (err) {
        console.error(err.logs.toString());
      },
    );

    // Check that the orders have not been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrder1Pk.data.orderPk),
        monaco.getOrder(againstOrder1Pk.data.orderPk),
        monaco.getOrder(againstOrder2Pk.data.orderPk),
      ]),
      [
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
      ],
    );
  });
});
