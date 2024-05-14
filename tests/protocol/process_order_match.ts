import assert from "assert";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import { SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { findTradePda } from "../../npm-client";
import { AnchorError } from "@coral-xyz/anchor";

describe("Matching Crank", () => {
  it("Success", async () => {
    // GIVEN

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([3.0]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);

    const againstPk = await market.againstOrder(1, 10, 3.0, purchaserA);
    const forPk = await market.forOrder(1, 10, 3.0, purchaserB);

    await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([monaco.getOrder(againstPk), monaco.getOrder(forPk)]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
      ],
    );
  });

  /**
   * Trying to test passing a maker order that has no more unmatched stake.
   * However, such situation would mean order would be off the matching queue.
   */
  it("Fail: maker order processed twice", async () => {
    // GIVEN

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([3.0]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);

    const makerOrderPk = await market.againstOrder(1, 10, 3.0, purchaserA);
    await market.againstOrder(1, 10, 3.0, purchaserA);
    const takerOrderPk = await market.forOrder(1, 20, 3.0, purchaserB);

    const result = await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(makerOrderPk),
        monaco.getOrder(takerOrderPk),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
      ],
    );

    // THEN
    await monaco.program.methods
      .processOrderMatch()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketMatchingPool: result.matchingPool,
        marketMatchingQueue: market.matchingQueuePk,
        makerOrder: makerOrderPk,
        marketPosition: await market.cacheMarketPositionPk(
          purchaserA.publicKey,
        ),
        purchaserToken: await market.cachePurchaserTokenPk(
          purchaserA.publicKey,
        ),
        makerOrderTrade: result.makerOrderTrade,
        takerOrderTrade: result.takerOrderTrade,
        crankOperator: monaco.operatorPk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (e: Error) {
          assert.equal(
            e,
            "Error: failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0",
          );
        },
      );
  });

  it("Failure: wrong maker order (outcome)", async () => {
    // GIVEN

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([3.0]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);

    await market.againstOrder(1, 10, 3.0, purchaserA); // true maker order
    const makerOrderPk = await market.againstOrder(2, 10, 3.0, purchaserA); // fake maker order
    const takerOrderPk = await market.forOrder(1, 20, 3.0, purchaserB);

    const marketMatchingPoolPk = market.matchingPools[1][3.0].against;
    const [makerOrderTrade, takerOrderTrade] = (
      await Promise.all([
        findTradePda(monaco.getRawProgram(), makerOrderPk, takerOrderPk, false),
        findTradePda(monaco.getRawProgram(), makerOrderPk, takerOrderPk, true),
      ])
    ).map((result) => result.data.tradePk);

    // THEN
    await monaco.program.methods
      .processOrderMatch()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketMatchingPool: marketMatchingPoolPk,
        marketMatchingQueue: market.matchingQueuePk,
        makerOrder: makerOrderPk, // incorrect
        marketPosition: await market.cacheMarketPositionPk(
          purchaserA.publicKey,
        ),
        purchaserToken: await market.cachePurchaserTokenPk(
          purchaserA.publicKey,
        ),
        makerOrderTrade: makerOrderTrade,
        takerOrderTrade: takerOrderTrade,
        crankOperator: monaco.operatorPk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (e: AnchorError) {
          assert.equal(e.error.errorCode.code, "MatchingPoolHeadMismatch");
        },
      );
  });

  it("Failure: wrong maker order (price)", async () => {
    // GIVEN

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([2.9, 3.0, 3.2]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);

    await market.againstOrder(1, 10, 3.0, purchaserA); // true maker order
    const makerOrderPk = await market.againstOrder(1, 10, 2.9, purchaserA); // fake maker order
    const takerOrderPk = await market.forOrder(1, 20, 3.0, purchaserB);

    const marketMatchingPoolPk = market.matchingPools[1][3.0].against;
    const [makerOrderTrade, takerOrderTrade] = (
      await Promise.all([
        findTradePda(monaco.getRawProgram(), makerOrderPk, takerOrderPk, false),
        findTradePda(monaco.getRawProgram(), makerOrderPk, takerOrderPk, true),
      ])
    ).map((result) => result.data.tradePk);

    // THEN
    await monaco.program.methods
      .processOrderMatch()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketMatchingPool: marketMatchingPoolPk,
        marketMatchingQueue: market.matchingQueuePk,
        makerOrder: makerOrderPk, // incorrect
        marketPosition: await market.cacheMarketPositionPk(
          purchaserA.publicKey,
        ),
        purchaserToken: await market.cachePurchaserTokenPk(
          purchaserA.publicKey,
        ),
        makerOrderTrade: makerOrderTrade,
        takerOrderTrade: takerOrderTrade,
        crankOperator: monaco.operatorPk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (e: AnchorError) {
          assert.equal(e.error.errorCode.code, "MatchingPoolHeadMismatch");
        },
      );
  });

  it("Failure: wrong maker matching pool", async () => {
    // GIVEN

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([2.9, 3.0]),
    ]);
    await market.airdrop(purchaserA, 100.0);
    await market.airdrop(purchaserB, 100.0);

    await market.againstOrder(1, 10, 3.0, purchaserA); // true maker order
    const takerOrderPk = await market.forOrder(1, 10, 3.0, purchaserB);
    const fakeMakerOrder1Pk = await market.againstOrder(1, 10, 2.9, purchaserA); // fake maker order
    const fakeMakerOrder2Pk = await market.againstOrder(2, 10, 3.0, purchaserA); // fake maker order

    // matching pools for fake makers
    const fakeMakerMatchingPool1Pk = market.matchingPools[1][2.9].against;
    const fakeMakerMatchingPool2Pk = market.matchingPools[2][3.0].against;

    // THEN
    await monaco.program.methods
      .processOrderMatch()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketMatchingPool: fakeMakerMatchingPool1Pk, // fake 1
        marketMatchingQueue: market.matchingQueuePk,
        makerOrder: fakeMakerOrder1Pk, // fake 1
        marketPosition: await market.cacheMarketPositionPk(
          purchaserA.publicKey,
        ),
        purchaserToken: await market.cachePurchaserTokenPk(
          purchaserA.publicKey,
        ),
        makerOrderTrade: (
          await findTradePda(
            monaco.getRawProgram(),
            fakeMakerOrder1Pk,
            takerOrderPk,
            false,
          )
        ).data.tradePk,
        takerOrderTrade: (
          await findTradePda(
            monaco.getRawProgram(),
            fakeMakerOrder1Pk,
            takerOrderPk,
            true,
          )
        ).data.tradePk,
        crankOperator: monaco.operatorPk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (e: AnchorError) {
          assert.equal(
            e.error.errorCode.code,
            "MatchingMarketMatchingPoolMismatch",
          );
        },
      );

    // THEN
    await monaco.program.methods
      .processOrderMatch()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketMatchingPool: fakeMakerMatchingPool2Pk, // fake 2
        marketMatchingQueue: market.matchingQueuePk,
        makerOrder: fakeMakerOrder2Pk, // fake 1
        marketPosition: await market.cacheMarketPositionPk(
          purchaserA.publicKey,
        ),
        purchaserToken: await market.cachePurchaserTokenPk(
          purchaserA.publicKey,
        ),
        makerOrderTrade: (
          await findTradePda(
            monaco.getRawProgram(),
            fakeMakerOrder2Pk,
            takerOrderPk,
            false,
          )
        ).data.tradePk,
        takerOrderTrade: (
          await findTradePda(
            monaco.getRawProgram(),
            fakeMakerOrder2Pk,
            takerOrderPk,
            true,
          )
        ).data.tradePk,
        crankOperator: monaco.operatorPk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (e: AnchorError) {
          assert.equal(
            e.error.errorCode.code,
            "MatchingMarketMatchingPoolMismatch",
          );
        },
      );
  });

  /**
   * Testing what happens when limit is reach for partial matches generated on creation.
   */
  it("Success: but not all liquidity matched", async () => {
    // GIVEN

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([
        3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.0,
      ]),
    ]);
    await market.airdrop(purchaserA, 1000.0);
    await market.airdrop(purchaserB, 1000.0);

    const against01Pk = await market.againstOrder(1, 10, 3.0, purchaserA);
    const against02Pk = await market.againstOrder(1, 10, 3.1, purchaserA);
    const against03Pk = await market.againstOrder(1, 10, 3.2, purchaserA);
    const against04Pk = await market.againstOrder(1, 10, 3.3, purchaserA);
    const against05Pk = await market.againstOrder(1, 10, 3.4, purchaserA);
    const against06Pk = await market.againstOrder(1, 10, 3.5, purchaserA);
    const against07Pk = await market.againstOrder(1, 10, 3.6, purchaserA);
    const against08Pk = await market.againstOrder(1, 10, 3.7, purchaserA);
    const against09Pk = await market.againstOrder(1, 10, 3.8, purchaserA);
    const against10Pk = await market.againstOrder(1, 10, 3.9, purchaserA);
    const against11Pk = await market.againstOrder(1, 10, 4.0, purchaserA);
    const forPk = await market.forOrder(1, 110, 3.0, purchaserB);

    assert.equal(10, await market.getMarketMatchingQueueLength());

    await market.processMatchingQueue();
    await market.processMatchingQueue();
    await market.processMatchingQueue();
    await market.processMatchingQueue();
    await market.processMatchingQueue();
    await market.processMatchingQueue();
    await market.processMatchingQueue();
    await market.processMatchingQueue();
    await market.processMatchingQueue();
    await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(against01Pk),
        monaco.getOrder(against02Pk),
        monaco.getOrder(against03Pk),
        monaco.getOrder(against04Pk),
        monaco.getOrder(against05Pk),
        monaco.getOrder(against06Pk),
        monaco.getOrder(against07Pk),
        monaco.getOrder(against08Pk),
        monaco.getOrder(against09Pk),
        monaco.getOrder(against10Pk),
        monaco.getOrder(against11Pk),
        monaco.getOrder(forPk),
        market.getMarketMatchingQueueLength(),
      ]),
      [
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 10, stakeVoided: 0, status: { matched: {} } },
        0,
      ],
    );
  });
});
