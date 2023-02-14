import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AnchorError } from "@project-serum/anchor";
import assert from "assert";
import {
  createAuthorisedOperatorsPda,
  createWalletWithBalance,
  getAnchorProvider,
  OperatorType,
} from "../util/test_util";
import { Monaco, monaco } from "../util/wrappers";
import { findTradePda, uiStakeToInteger } from "../../npm-client/src";

describe("Matching Crank", () => {
  it("Unauthorised crank should error", async () => {
    // Unauthorised operator
    const operatorAccountUnauthorised = await createWalletWithBalance(
      getAnchorProvider(),
    );
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Given
    const outcome = 1;
    const price = 6.0;
    const stake = 2.0;

    const { market, purchaser, forOrderPk, againstOrderPk } =
      await setupMatchedOrders(monaco, outcome, price, stake);

    const marketMatchingPools = market.matchingPools[outcome][price];

    const purchaserToken = await market.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const marketPositionPda = await market.cacheMarketPositionPk(
      purchaser.publicKey,
    );

    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(monaco.getRawProgram(), againstOrderPk, forOrderPk, true),
        findTradePda(monaco.getRawProgram(), againstOrderPk, forOrderPk, false),
      ])
    ).map((result) => result.data.tradePk);

    //
    // CRANK
    //
    await monaco.program.methods
      .matchOrders()
      .accounts({
        orderFor: forOrderPk,
        orderAgainst: againstOrderPk,
        tradeFor: forTradePk,
        tradeAgainst: againstTradePk,
        marketPositionFor: marketPositionPda,
        marketPositionAgainst: marketPositionPda,
        purchaserTokenAccountFor: purchaserToken,
        purchaserTokenAccountAgainst: purchaserToken,
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketOutcome: market.outcomePks[outcome],
        marketMatchingPoolFor: marketMatchingPools.forOutcome,
        marketMatchingPoolAgainst: marketMatchingPools.against,
        crankOperator: operatorAccountUnauthorised.publicKey,
        authorisedOperators: authorisedOperators,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([operatorAccountUnauthorised])
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (err: AnchorError) {
          assert.equal(err.error.errorCode.code, "UnauthorisedOperator");
        },
      );

    // Check that the orders have not been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
      ]),
      [
        { stakeUnmatched: stake, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: stake, stakeVoided: 0, status: { open: {} } },
      ],
    );
  });

  it("all correct - same purchaser for and against", async () => {
    // Given
    const outcome = 1;
    const price = 6.0;
    const stake = 2.0;
    const { market, purchaser, forOrderPk, againstOrderPk } =
      await setupMatchedOrders(monaco, outcome, price, stake);

    await market.match(forOrderPk, againstOrderPk);

    // Check that the orders have been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),

        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [0, 0, 0], maxExposure: [2, 10, 2] },
        { len: 0, liquidity: 0, matched: 2 },
        { len: 0, liquidity: 0, matched: 2 },
        10,
      ],
    );

    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(monaco.getRawProgram(), againstOrderPk, forOrderPk, true),
        findTradePda(monaco.getRawProgram(), againstOrderPk, forOrderPk, false),
      ])
    ).map((result) => result.data.tradePk);

    const integerStake = (
      await uiStakeToInteger(monaco.getRawProgram(), stake, market.pk)
    ).data.stakeInteger.toNumber();

    const againstTrade = await monaco.fetchTrade(againstTradePk);
    const forTrade = await monaco.fetchTrade(forTradePk);

    assert.deepEqual(
      [
        againstTrade.purchaser,
        againstTrade.market,
        againstTrade.order,
        againstTrade.oppositeTrade,
        againstTrade.marketOutcomeIndex,
        againstTrade.forOutcome,
        againstTrade.stake.toNumber(),
        againstTrade.price,
      ],
      [
        purchaser.publicKey,
        market.pk,
        againstOrderPk,
        forTradePk,
        1,
        false,
        integerStake,
        price,
      ],
    );
    assert.deepEqual(
      [
        forTrade.purchaser,
        forTrade.market,
        forTrade.order,
        forTrade.oppositeTrade,
        forTrade.marketOutcomeIndex,
        forTrade.forOutcome,
        forTrade.stake.toNumber(),
        forTrade.price,
      ],
      [
        purchaser.publicKey,
        market.pk,
        forOrderPk,
        againstTradePk,
        1,
        true,
        integerStake,
        price,
      ],
    );
  });

  it("all correct - separate purchasers for and against", async () => {
    // Given
    const outcome = 1;
    const price = 6.0;
    const stake = 2.0;

    // Create market, purchaser
    const [purchaserA, purchaserB, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([6.0]),
    ]);
    await market.airdrop(purchaserA, 100_000);
    await market.airdrop(purchaserB, 100_000);

    // Create a couple of opposing orders

    const forOrderPk = await market.forOrder(outcome, stake, price, purchaserA);
    const againstOrderPk = await market.againstOrder(
      outcome,
      stake,
      price,
      purchaserB,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),

        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
      ]),
      [
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2, 0, 2] },
        { matched: [0, 0, 0], maxExposure: [0, 10, 0] },
        { len: 1, liquidity: 2, matched: 0 },
        { len: 1, liquidity: 2, matched: 0 },
        12,
      ],
    );

    await market.match(forOrderPk, againstOrderPk);

    // Check that the orders have been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),

        market.getMarketPosition(purchaserA),
        market.getMarketPosition(purchaserB),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [-2, 10, -2], maxExposure: [2, 0, 2] },
        { matched: [2, -10, 2], maxExposure: [0, 10, 0] },
        { len: 0, liquidity: 0, matched: 2 },
        { len: 0, liquidity: 0, matched: 2 },
        12,
      ],
    );

    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(monaco.getRawProgram(), againstOrderPk, forOrderPk, true),
        findTradePda(monaco.getRawProgram(), againstOrderPk, forOrderPk, false),
      ])
    ).map((result) => result.data.tradePk);

    const integerStake = (
      await uiStakeToInteger(monaco.getRawProgram(), stake, market.pk)
    ).data.stakeInteger.toNumber();

    const againstTrade = await monaco.fetchTrade(againstTradePk);
    const forTrade = await monaco.fetchTrade(forTradePk);

    assert.deepEqual(
      [
        againstTrade.purchaser,
        againstTrade.market,
        againstTrade.order,
        againstTrade.oppositeTrade,
        againstTrade.marketOutcomeIndex,
        againstTrade.forOutcome,
        againstTrade.stake.toNumber(),
        againstTrade.price,
        againstTrade.payer,
      ],
      [
        purchaserB.publicKey,
        market.pk,
        againstOrderPk,
        forTradePk,
        1,
        false,
        integerStake,
        price,
        monaco.getRawProgram().provider.publicKey,
      ],
    );
    assert.deepEqual(
      [
        forTrade.purchaser,
        forTrade.market,
        forTrade.order,
        forTrade.oppositeTrade,
        forTrade.marketOutcomeIndex,
        forTrade.forOutcome,
        forTrade.stake.toNumber(),
        forTrade.price,
        forTrade.payer,
      ],
      [
        purchaserA.publicKey,
        market.pk,
        forOrderPk,
        againstTradePk,
        1,
        true,
        integerStake,
        price,
        monaco.getRawProgram().provider.publicKey,
      ],
    );
  });

  it("same order - against passed twice", async () => {
    // Given
    const outcome = 1;
    const price = 6.0;
    const stake = 2.0;

    const { market, purchaser, forOrderPk, againstOrderPk } =
      await setupMatchedOrders(monaco, outcome, price, stake);

    const marketMatchingPools = market.matchingPools[outcome][price];

    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );
    const purchaserToken = await market.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const marketPositionPda = await market.cacheMarketPositionPk(
      purchaser.publicKey,
    );
    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(
          monaco.getRawProgram(),
          againstOrderPk,
          againstOrderPk,
          true,
        ),
        findTradePda(
          monaco.getRawProgram(),
          againstOrderPk,
          againstOrderPk,
          false,
        ),
      ])
    ).map((result) => result.data.tradePk);

    //
    // CRANK
    //
    await monaco.program.methods
      .matchOrders()
      .accounts({
        orderFor: againstOrderPk,
        orderAgainst: againstOrderPk,
        tradeFor: forTradePk,
        tradeAgainst: againstTradePk,
        marketPositionFor: marketPositionPda,
        marketPositionAgainst: marketPositionPda,
        purchaserTokenAccountFor: purchaserToken,
        purchaserTokenAccountAgainst: purchaserToken,
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketOutcome: market.outcomePks[outcome],
        marketMatchingPoolFor: marketMatchingPools.forOutcome,
        marketMatchingPoolAgainst: marketMatchingPools.against,
        crankOperator: monaco.operatorPk,
        authorisedOperators: authorisedOperators,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (err: AnchorError) {
          assert.equal(
            err.error.errorCode.code,
            "MatchingOrdersForAndAgainstAreIdentical",
          );
        },
      );

    // Check that the orders have not been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),

        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
      ]),
      [
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2, 10, 2] },
        { len: 1, liquidity: 2, matched: 0 },
        { len: 1, liquidity: 2, matched: 0 },
        10,
      ],
    );

    // Check that the trades have not been created
    await monaco.program.account.trade.fetch(forTradePk).then(
      (_) => assert.fail("An error should have been thrown"),
      (err) => expect(err.message).toContain("Account does not exist"),
    );
    await monaco.program.account.trade.fetch(againstTradePk).then(
      (_) => assert.fail("An error should have been thrown"),
      (err) => expect(err.message).toContain("Account does not exist"),
    );
  });

  it("same order - for passed twice", async () => {
    // Given
    const outcome = 1;
    const price = 6.0;
    const stake = 2.0;

    const { market, purchaser, forOrderPk, againstOrderPk } =
      await setupMatchedOrders(monaco, outcome, price, stake);

    const marketMatchingPools = market.matchingPools[outcome][price];

    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );
    const purchaserToken = await market.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const marketPositionPda = await market.cacheMarketPositionPk(
      purchaser.publicKey,
    );
    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(monaco.getRawProgram(), forOrderPk, forOrderPk, true),
        findTradePda(monaco.getRawProgram(), forOrderPk, forOrderPk, false),
      ])
    ).map((result) => result.data.tradePk);

    //
    // CRANK
    //
    await monaco.program.methods
      .matchOrders()
      .accounts({
        orderFor: forOrderPk,
        orderAgainst: forOrderPk,
        tradeFor: forTradePk,
        tradeAgainst: againstTradePk,
        marketPositionFor: marketPositionPda,
        marketPositionAgainst: marketPositionPda,
        purchaserTokenAccountFor: purchaserToken,
        purchaserTokenAccountAgainst: purchaserToken,
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketOutcome: market.outcomePks[outcome],
        marketMatchingPoolFor: marketMatchingPools.forOutcome,
        marketMatchingPoolAgainst: marketMatchingPools.against,
        crankOperator: monaco.operatorPk,
        authorisedOperators: authorisedOperators,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (err: AnchorError) {
          assert.equal(
            err.error.errorCode.code,
            "MatchingOrdersForAndAgainstAreIdentical",
          );
        },
      );

    // Check that the orders have not been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),

        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
      ]),
      [
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2, 10, 2] },
        { len: 1, liquidity: 2, matched: 0 },
        { len: 1, liquidity: 2, matched: 0 },
        10,
      ],
    );
  });

  it("two for orders", async () => {
    // Given
    const outcome = 1;
    const price = 6.0;
    const stake = 2.0;

    // Create market, purchaser

    const { market, purchaser, forOrderPk, againstOrderPk } =
      await setupMatchedOrders(monaco, outcome, price, stake);

    const marketMatchingPools = market.matchingPools[outcome][price];
    const forOrder2Pk = await market.forOrder(outcome, stake, price, purchaser);

    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );
    const purchaserToken = await market.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const marketPositionPda = await market.cacheMarketPositionPk(
      purchaser.publicKey,
    );
    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(monaco.getRawProgram(), forOrder2Pk, forOrderPk, true),
        findTradePda(monaco.getRawProgram(), forOrder2Pk, forOrderPk, false),
      ])
    ).map((result) => result.data.tradePk);

    //
    // CRANK
    //
    await monaco.program.methods
      .matchOrders()
      .accounts({
        orderFor: forOrderPk,
        orderAgainst: forOrder2Pk,
        tradeFor: forTradePk,
        tradeAgainst: againstTradePk,
        marketPositionFor: marketPositionPda,
        marketPositionAgainst: marketPositionPda,
        purchaserTokenAccountFor: purchaserToken,
        purchaserTokenAccountAgainst: purchaserToken,
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketOutcome: market.outcomePks[outcome],
        marketMatchingPoolFor: marketMatchingPools.forOutcome,
        marketMatchingPoolAgainst: marketMatchingPools.against,
        crankOperator: monaco.operatorPk,

        authorisedOperators: authorisedOperators,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (err: AnchorError) {
          assert.equal(
            err.error.errorCode.code,
            "MatchingExpectedAnAgainstOrder",
          );
        },
      );

    // Check that the orders have not been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),

        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
      ]),
      [
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [4, 10, 4] },
        { len: 2, liquidity: 4, matched: 0 },
        { len: 1, liquidity: 2, matched: 0 },
        10,
      ],
    );
  });

  it("two against orders", async () => {
    // Given
    const outcome = 1;
    const price = 6.0;
    const stake = 2.0;

    // Create market, purchaser

    const { market, purchaser, forOrderPk, againstOrderPk } =
      await setupMatchedOrders(monaco, outcome, price, stake);

    const marketMatchingPools = market.matchingPools[outcome][price];
    const againstOrder2Pk = await market.againstOrder(
      outcome,
      stake,
      price,
      purchaser,
    );

    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );
    const purchaserToken = await market.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const marketPositionPda = await market.cacheMarketPositionPk(
      purchaser.publicKey,
    );
    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(
          monaco.getRawProgram(),
          againstOrderPk,
          againstOrder2Pk,
          true,
        ),
        findTradePda(
          monaco.getRawProgram(),
          againstOrderPk,
          againstOrder2Pk,
          false,
        ),
      ])
    ).map((result) => result.data.tradePk);

    //
    // CRANK
    //
    await monaco.program.methods
      .matchOrders()
      .accounts({
        orderFor: againstOrder2Pk,
        orderAgainst: againstOrderPk,
        tradeFor: forTradePk,
        tradeAgainst: againstTradePk,
        marketPositionFor: marketPositionPda,
        marketPositionAgainst: marketPositionPda,
        purchaserTokenAccountFor: purchaserToken,
        purchaserTokenAccountAgainst: purchaserToken,
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketOutcome: market.outcomePks[outcome],
        marketMatchingPoolFor: marketMatchingPools.forOutcome,
        marketMatchingPoolAgainst: marketMatchingPools.against,
        crankOperator: monaco.operatorPk,
        authorisedOperators: authorisedOperators,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (err: AnchorError) {
          assert.equal(err.error.errorCode.code, "MatchingExpectedAForOrder");
        },
      );

    // Check that the orders have not been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
      ]),
      [
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2, 20, 2] },
        { len: 1, liquidity: 2, matched: 0 },
        { len: 2, liquidity: 4, matched: 0 },
        20,
      ],
    );
  });

  it("for market position for a different purchaser", async () => {
    // Given
    const outcome = 1;
    const price = 6.0;
    const stake = 2.0;

    // Create market, purchaser

    const { market, purchaser, forOrderPk, againstOrderPk } =
      await setupMatchedOrders(monaco, outcome, price, stake);

    const marketMatchingPools = market.matchingPools[outcome][price];

    const purchaserDifferent = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaserDifferent, 100_000);
    const forOrder2Pk = await market.forOrder(
      outcome,
      stake,
      price,
      purchaserDifferent,
    );

    //
    // CRANK
    //
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );
    const purchaserToken = await market.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const marketPositionPda = await market.cacheMarketPositionPk(
      purchaser.publicKey,
    );
    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(monaco.getRawProgram(), forOrder2Pk, forOrderPk, true),
        findTradePda(monaco.getRawProgram(), forOrder2Pk, forOrderPk, false),
      ])
    ).map((result) => result.data.tradePk);

    //
    // CRANK
    //
    await monaco.program.methods
      .matchOrders()
      .accounts({
        orderFor: forOrderPk,
        orderAgainst: forOrder2Pk,
        tradeFor: forTradePk,
        tradeAgainst: againstTradePk,
        marketPositionFor: marketPositionPda,
        marketPositionAgainst: marketPositionPda,
        purchaserTokenAccountFor: purchaserToken,
        purchaserTokenAccountAgainst: purchaserToken,
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketOutcome: market.outcomePks[outcome],
        marketMatchingPoolFor: marketMatchingPools.forOutcome,
        marketMatchingPoolAgainst: marketMatchingPools.against,
        crankOperator: monaco.operatorPk,
        authorisedOperators: authorisedOperators,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (err: AnchorError) {
          assert.equal(
            err.error.errorCode.code,
            "MatchingExpectedAnAgainstOrder",
          );
        },
      );

    // Check that the orders have not been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),

        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
      ]),
      [
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2, 10, 2] },
        { len: 2, liquidity: 4, matched: 0 },
        { len: 1, liquidity: 2, matched: 0 },
        12,
      ],
    );
  });

  it("against market position for a different purchaser", async () => {
    // Given
    const outcome = 1;
    const price = 6.0;
    const stake = 2.0;

    // Create market, purchaser
    const { market, purchaser, forOrderPk, againstOrderPk } =
      await setupMatchedOrders(monaco, outcome, price, stake);

    const marketMatchingPools = market.matchingPools[outcome][price];

    const purchaserDifferent = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaserDifferent, 100_000);
    const againstOrder2Pk = await market.againstOrder(
      outcome,
      stake,
      price,
      purchaserDifferent,
    );

    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );
    const purchaserToken = await market.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const marketPositionPda = await market.cacheMarketPositionPk(
      purchaser.publicKey,
    );
    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(
          monaco.getRawProgram(),
          againstOrderPk,
          againstOrder2Pk,
          true,
        ),
        findTradePda(
          monaco.getRawProgram(),
          againstOrderPk,
          againstOrder2Pk,
          false,
        ),
      ])
    ).map((result) => result.data.tradePk);

    //
    // CRANK
    //
    await monaco.program.methods
      .matchOrders()
      .accounts({
        orderFor: againstOrder2Pk,
        orderAgainst: againstOrderPk,
        tradeFor: forTradePk,
        tradeAgainst: againstTradePk,
        marketPositionFor: marketPositionPda,
        marketPositionAgainst: marketPositionPda,
        purchaserTokenAccountFor: purchaserToken,
        purchaserTokenAccountAgainst: purchaserToken,
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketOutcome: market.outcomePks[outcome],
        marketMatchingPoolFor: marketMatchingPools.forOutcome,
        marketMatchingPoolAgainst: marketMatchingPools.against,
        crankOperator: monaco.operatorPk,
        authorisedOperators: authorisedOperators,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (err: AnchorError) {
          assert.equal(err.error.errorCode.code, "MatchingExpectedAForOrder");
        },
      );

    // Check that the orders have not been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
      ]),
      [
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2, 10, 2] },
        { len: 1, liquidity: 2, matched: 0 },
        { len: 2, liquidity: 4, matched: 0 },
        20,
      ],
    );
  });

  it("market mismatch", async () => {
    // Given
    const outcome = 1;
    const price = 6.0;
    const stake = 2.0;

    // Create market, purchaser
    const { market, purchaser, forOrderPk, againstOrderPk } =
      await setupMatchedOrders(monaco, outcome, price, stake);

    const marketMatchingPools = market.matchingPools[outcome][price];
    const market1 = await monaco.create3WayMarket([price]);

    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );
    const purchaserToken = await market.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const marketPositionPda = await market.cacheMarketPositionPk(
      purchaser.publicKey,
    );
    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(monaco.getRawProgram(), againstOrderPk, forOrderPk, true),
        findTradePda(monaco.getRawProgram(), againstOrderPk, forOrderPk, false),
      ])
    ).map((result) => result.data.tradePk);

    //
    // CRANK
    //
    await monaco.program.methods
      .matchOrders()
      .accounts({
        orderFor: forOrderPk,
        orderAgainst: againstOrderPk,
        tradeFor: forTradePk,
        tradeAgainst: againstTradePk,
        marketPositionFor: marketPositionPda,
        marketPositionAgainst: marketPositionPda,
        purchaserTokenAccountFor: purchaserToken,
        purchaserTokenAccountAgainst: purchaserToken,
        market: market1.pk,
        marketEscrow: market1.escrowPk,
        marketOutcome: market.outcomePks[outcome],
        marketMatchingPoolFor: marketMatchingPools.forOutcome,
        marketMatchingPoolAgainst: marketMatchingPools.against,
        crankOperator: monaco.operatorPk,
        authorisedOperators: authorisedOperators,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (err: AnchorError) {
          assert.equal(err.error.errorCode.code, "MatchingMarketMismatch");
        },
      );

    // Check that the orders have not been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
      ]),
      [
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2, 10, 2] },
        { len: 1, liquidity: 2, matched: 0 },
        { len: 1, liquidity: 2, matched: 0 },
        10,
      ],
    );
  });

  it("market outcome mismatch", async () => {
    // Given
    const outcome = 1;
    const price = 6.0;
    const stake = 2.0;

    // Create market, purchaser

    const { market, purchaser, forOrderPk, againstOrderPk } =
      await setupMatchedOrders(monaco, outcome, price, stake);

    const marketMatchingPools = market.matchingPools[outcome][price];
    const market1 = await monaco.create3WayMarket([price]);

    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );
    const purchaserToken = await market.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const marketPositionPda = await market.cacheMarketPositionPk(
      purchaser.publicKey,
    );
    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(monaco.getRawProgram(), againstOrderPk, forOrderPk, true),
        findTradePda(monaco.getRawProgram(), againstOrderPk, forOrderPk, false),
      ])
    ).map((result) => result.data.tradePk);

    //
    // CRANK
    //
    await monaco.program.methods
      .matchOrders()
      .accounts({
        orderFor: forOrderPk,
        orderAgainst: againstOrderPk,
        tradeFor: forTradePk,
        tradeAgainst: againstTradePk,
        marketPositionFor: marketPositionPda,
        marketPositionAgainst: marketPositionPda,
        purchaserTokenAccountFor: purchaserToken,
        purchaserTokenAccountAgainst: purchaserToken,
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketOutcome: market1.outcomePks[outcome],
        marketMatchingPoolFor: marketMatchingPools.forOutcome,
        marketMatchingPoolAgainst: marketMatchingPools.against,
        crankOperator: monaco.operatorPk,
        authorisedOperators: authorisedOperators,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (err: AnchorError) {
          assert.equal(err.error.errorCode.code, "ConstraintSeeds");
        },
      );

    // Check that the orders have not been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
      ]),
      [
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2, 10, 2] },
        { len: 1, liquidity: 2, matched: 0 },
        { len: 1, liquidity: 2, matched: 0 },
        10,
      ],
    );
  });

  it("market and market outcome mismatch", async () => {
    // Given
    const outcome = 1;
    const price = 6.0;
    const stake = 2.0;

    // Create market, purchaser

    const { market, purchaser, forOrderPk, againstOrderPk } =
      await setupMatchedOrders(monaco, outcome, price, stake);

    const marketMatchingPools = market.matchingPools[outcome][price];
    const market1 = await monaco.create3WayMarket([price]);

    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );
    const purchaserToken = await market.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const marketPositionPda = await market.cacheMarketPositionPk(
      purchaser.publicKey,
    );
    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(monaco.getRawProgram(), againstOrderPk, forOrderPk, true),
        findTradePda(monaco.getRawProgram(), againstOrderPk, forOrderPk, false),
      ])
    ).map((result) => result.data.tradePk);

    //
    // CRANK
    //
    await monaco.program.methods
      .matchOrders()
      .accounts({
        orderFor: forOrderPk,
        orderAgainst: againstOrderPk,
        tradeFor: forTradePk,
        tradeAgainst: againstTradePk,
        marketPositionFor: marketPositionPda,
        marketPositionAgainst: marketPositionPda,
        purchaserTokenAccountFor: purchaserToken,
        purchaserTokenAccountAgainst: purchaserToken,
        market: market1.pk,
        marketEscrow: market1.escrowPk,
        marketOutcome: market1.outcomePks[outcome],
        marketMatchingPoolFor: marketMatchingPools.forOutcome,
        marketMatchingPoolAgainst: marketMatchingPools.against,
        crankOperator: monaco.operatorPk,
        authorisedOperators: authorisedOperators,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (err: AnchorError) {
          assert.equal(err.error.errorCode.code, "MatchingMarketMismatch");
        },
      );

    // Check that the orders have not been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcome, price),
        market.getAgainstMatchingPool(outcome, price),
        market.getEscrowBalance(),
      ]),
      [
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 2, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2, 10, 2] },
        { len: 1, liquidity: 2, matched: 0 },
        { len: 1, liquidity: 2, matched: 0 },
        10,
      ],
    );
  });

  it("Consuming liquidity from various pools", async () => {
    // Create market, purchaser
    const [purchaser1, purchaser2, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([3.0, 3.1, 3.2]),
    ]);
    await market.airdrop(purchaser1, 1_000);
    await market.airdrop(purchaser2, 1_000);

    const marketOutcomeIndex = 1;

    // create for orders
    const for01OrderPK = await market.forOrder(
      marketOutcomeIndex,
      100.0,
      3.0,
      purchaser1,
    );
    const for02OrderPK = await market.forOrder(
      marketOutcomeIndex,
      40.0,
      3.1,
      purchaser1,
    );

    // create against orders
    const against01OrderPK = await market.againstOrder(
      marketOutcomeIndex,
      60.0,
      3.1,
      purchaser2,
    );
    const against02OrderPK = await market.againstOrder(
      marketOutcomeIndex,
      70.0,
      3.1,
      purchaser2,
    );
    const against03OrderPK = await market.againstOrder(
      marketOutcomeIndex,
      30.0,
      3.2,
      purchaser2,
    );

    // check balances after for creation
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(for01OrderPK),
        monaco.getOrder(for02OrderPK),
        monaco.getOrder(against01OrderPK),
        monaco.getOrder(against02OrderPK),
        monaco.getOrder(against03OrderPK),
        market.getMarketPosition(purchaser1),
        market.getMarketPosition(purchaser2),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser1),
        market.getTokenBalance(purchaser2),
      ]),
      [
        { stakeUnmatched: 100, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 40, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 60, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 70, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 30, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [140, 0, 140] },
        { matched: [0, 0, 0], maxExposure: [0, 339, 0] },
        479,
        860,
        661,
      ],
    );

    // CRANK 1
    await market.match(for01OrderPK, against01OrderPK);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(for01OrderPK),
        monaco.getOrder(for02OrderPK),
        monaco.getOrder(against01OrderPK),
        monaco.getOrder(against02OrderPK),
        monaco.getOrder(against03OrderPK),
        market.getMarketPosition(purchaser1),
        market.getMarketPosition(purchaser2),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser1),
        market.getTokenBalance(purchaser2),
      ]),
      [
        { stakeUnmatched: 40, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 40, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 70, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 30, stakeVoided: 0, status: { open: {} } },
        { matched: [-60, 120, -60], maxExposure: [140, 0, 140] },
        { matched: [60, -120, 60], maxExposure: [0, 333, 0] },
        473,
        860,
        667,
      ],
    );

    // CRANK 2
    await market.match(for01OrderPK, against02OrderPK);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(for01OrderPK),
        monaco.getOrder(for02OrderPK),
        monaco.getOrder(against01OrderPK),
        monaco.getOrder(against02OrderPK),
        monaco.getOrder(against03OrderPK),
        market.getMarketPosition(purchaser1),
        market.getMarketPosition(purchaser2),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser1),
        market.getTokenBalance(purchaser2),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 40, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 30, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 30, stakeVoided: 0, status: { open: {} } },
        { matched: [-100, 200, -100], maxExposure: [140, 0, 140] },
        { matched: [100, -200, 100], maxExposure: [0, 329, 0] },
        469,
        860,
        671,
      ],
    );

    // CRANK 3
    await market.match(for02OrderPK, against02OrderPK);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(for01OrderPK),
        monaco.getOrder(for02OrderPK),
        monaco.getOrder(against01OrderPK),
        monaco.getOrder(against02OrderPK),
        monaco.getOrder(against03OrderPK),
        market.getMarketPosition(purchaser1),
        market.getMarketPosition(purchaser2),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser1),
        market.getTokenBalance(purchaser2),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 10, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 30, stakeVoided: 0, status: { open: {} } },
        { matched: [-130, 263, -130], maxExposure: [140, 0, 140] },
        { matched: [130, -263, 130], maxExposure: [0, 329, 0] },
        469,
        860,
        671,
      ],
    );

    // CRANK 4
    await market.match(for02OrderPK, against03OrderPK);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(for01OrderPK),
        monaco.getOrder(for02OrderPK),
        monaco.getOrder(against01OrderPK),
        monaco.getOrder(against02OrderPK),
        monaco.getOrder(against03OrderPK),
        market.getMarketPosition(purchaser1),
        market.getMarketPosition(purchaser2),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser1),
        market.getTokenBalance(purchaser2),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 20, stakeVoided: 0, status: { matched: {} } },
        { matched: [-140, 284, -140], maxExposure: [140, 0, 140] },
        { matched: [140, -284, 140], maxExposure: [0, 328, 0] },
        468,
        860,
        672,
      ],
    );
  });

  it("stake fully matched, remaining against liability refunded", async () => {
    // Given
    const outcome = 1;

    const forerPrice = 1.6;
    const againsterPrice = 1.7;
    const stake = 100.0;

    // Create market, purchaser
    const [forPurchaser, againstPurchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([1.6, 1.7]),
    ]);
    await market.airdrop(forPurchaser, 100);
    await market.airdrop(againstPurchaser, 100);

    const forOrderPk = await market.forOrder(
      outcome,
      stake,
      forerPrice,
      forPurchaser,
    );
    const againstOrderPk = await market.againstOrder(
      outcome,
      stake,
      againsterPrice,
      againstPurchaser,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(forPurchaser),
        market.getMarketPosition(againstPurchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(forPurchaser),
        market.getTokenBalance(againstPurchaser),
      ]),
      [
        { stakeUnmatched: 100, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 100, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [100, 0, 100] },
        { matched: [0, 0, 0], maxExposure: [0, 70, 0] },
        170,
        0,
        30,
      ],
    );

    await market.match(forOrderPk, againstOrderPk);

    // Check that the orders have been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrderPk),
        market.getMarketPosition(forPurchaser),
        market.getMarketPosition(againstPurchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(forPurchaser),
        market.getTokenBalance(againstPurchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [-100, 60, -100], maxExposure: [100, 0, 100] },
        { matched: [100, -60, 100], maxExposure: [0, 60, 0] },
        160,
        0,
        40,
      ],
    );
  });

  it("usecase B10@4_W1 L5@4_W2 L10@4_W2", async () => {
    // Given
    const outcome = 1;
    const price = 4.0;

    // Create market, purchaser
    const [forPurchaser, againstPurchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(forPurchaser, 100);
    await market.airdrop(againstPurchaser, 100);

    const forOrderPk = await market.forOrder(
      outcome,
      10.0,
      price,
      forPurchaser,
    );
    const againstOrder1Pk = await market.againstOrder(
      outcome,
      5.0,
      price,
      againstPurchaser,
    );
    const againstOrder2Pk = await market.againstOrder(
      outcome,
      10.0,
      price,
      againstPurchaser,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrder1Pk),
        monaco.getOrder(againstOrder2Pk),
        market.getMarketPosition(forPurchaser),
        market.getMarketPosition(againstPurchaser),

        market.getEscrowBalance(),
        market.getTokenBalance(forPurchaser),
        market.getTokenBalance(againstPurchaser),
      ]),
      [
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 5, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [10, 0, 10] },
        { matched: [0, 0, 0], maxExposure: [0, 45, 0] },
        55,
        90,
        55,
      ],
    );

    await market.match(forOrderPk, againstOrder1Pk);
    await market.match(forOrderPk, againstOrder2Pk);

    // Check that the orders have been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrder1Pk),
        monaco.getOrder(againstOrder2Pk),
        market.getMarketPosition(forPurchaser),
        market.getMarketPosition(againstPurchaser),

        market.getEscrowBalance(),
        market.getTokenBalance(forPurchaser),
        market.getTokenBalance(againstPurchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 5, stakeVoided: 0, status: { matched: {} } },
        { matched: [-10, 30, -10], maxExposure: [10, 0, 10] },
        { matched: [10, -30, 10], maxExposure: [0, 45, 0] },
        55,
        90,
        55,
      ],
    );
  });

  it("usecase B10@4_W1 L5@4_W2 L10@4_W1", async () => {
    // Given
    const outcome = 1;
    const price = 4.0;

    // Create market, purchaser
    const [forPurchaser, againstPurchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(forPurchaser, 100);
    await market.airdrop(againstPurchaser, 100);

    const forOrderPk = await market.forOrder(
      outcome,
      10.0,
      price,
      forPurchaser,
    );
    const againstOrder1Pk = await market.againstOrder(
      outcome,
      5.0,
      price,
      againstPurchaser,
    );
    const againstOrder2Pk = await market.againstOrder(
      outcome,
      10.0,
      price,
      forPurchaser,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrder1Pk),
        monaco.getOrder(againstOrder2Pk),
        market.getMarketPosition(forPurchaser),
        market.getMarketPosition(againstPurchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(forPurchaser),
        market.getTokenBalance(againstPurchaser),
      ]),
      [
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 5, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [10, 30, 10] },
        { matched: [0, 0, 0], maxExposure: [0, 15, 0] },
        45,
        70,
        85,
      ],
    );

    await market.match(forOrderPk, againstOrder1Pk);
    await market.match(forOrderPk, againstOrder2Pk);

    // Check that the orders have been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrder1Pk),
        monaco.getOrder(againstOrder2Pk),
        market.getMarketPosition(forPurchaser),
        market.getMarketPosition(againstPurchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(forPurchaser),
        market.getTokenBalance(againstPurchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 5, stakeVoided: 0, status: { matched: {} } },
        { matched: [-5, 15, -5], maxExposure: [10, 30, 10] },
        { matched: [5, -15, 5], maxExposure: [0, 15, 0] },
        45,
        70,
        85,
      ],
    );
  });

  it("usecase B10@4_W1 L5@4_W1 L10@4_W1", async () => {
    // Given
    const outcome = 1;
    const price = 4.0;

    // Create market, purchaser
    const [forPurchaser, againstPurchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(forPurchaser, 100);
    await market.airdrop(againstPurchaser, 100);

    const forOrderPk = await market.forOrder(
      outcome,
      10.0,
      price,
      forPurchaser,
    );
    const againstOrder1Pk = await market.againstOrder(
      outcome,
      5.0,
      price,
      forPurchaser,
    );
    const againstOrder2Pk = await market.againstOrder(
      outcome,
      10.0,
      price,
      forPurchaser,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrder1Pk),
        monaco.getOrder(againstOrder2Pk),
        market.getMarketPosition(forPurchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(forPurchaser),
        market.getTokenBalance(againstPurchaser),
      ]),
      [
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 5, stakeVoided: 0, status: { open: {} } },
        { stakeUnmatched: 10, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [10, 45, 10] },
        45,
        55,
        100,
      ],
    );

    await market.match(forOrderPk, againstOrder1Pk);
    await market.match(forOrderPk, againstOrder2Pk);

    // Check that the orders have been matched.
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(forOrderPk),
        monaco.getOrder(againstOrder1Pk),
        monaco.getOrder(againstOrder2Pk),
        market.getMarketPosition(forPurchaser),

        market.getEscrowBalance(),
        market.getTokenBalance(forPurchaser),
        market.getTokenBalance(againstPurchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { stakeUnmatched: 5, stakeVoided: 0, status: { matched: {} } },
        { matched: [0, 0, 0], maxExposure: [10, 45, 10] },
        45,
        55,
        100,
      ],
    );
  });
});

async function setupMatchedOrders(
  protocol: Monaco,
  outcomeIndex: number,
  price: number,
  stake: number,
) {
  // Create market, purchaser
  const [purchaser, market] = await Promise.all([
    createWalletWithBalance(protocol.provider),
    protocol.create3WayMarket([6.0]),
  ]);
  await market.airdrop(purchaser, 100_000);

  const forOrderPk = await market.forOrder(
    outcomeIndex,
    stake,
    price,
    purchaser,
  );
  const againstOrderPk = await market.againstOrder(
    outcomeIndex,
    stake,
    price,
    purchaser,
  );

  assert.deepEqual(
    await Promise.all([
      monaco.getOrder(forOrderPk),
      monaco.getOrder(againstOrderPk),
      market.getMarketPosition(purchaser),
      market.getForMatchingPool(outcomeIndex, price),
      market.getAgainstMatchingPool(outcomeIndex, price),
      market.getEscrowBalance(),
    ]),
    [
      { stakeUnmatched: stake, stakeVoided: 0, status: { open: {} } },
      { stakeUnmatched: stake, stakeVoided: 0, status: { open: {} } },
      {
        matched: [0, 0, 0],
        maxExposure: [stake, stake * (price - 1), stake],
      },
      { len: 1, liquidity: stake, matched: 0 },
      { len: 1, liquidity: stake, matched: 0 },
      stake * (price - 1),
    ],
  );

  return { market, purchaser, forOrderPk, againstOrderPk };
}
