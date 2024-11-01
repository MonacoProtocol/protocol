import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import assert from "assert";
import {
  createWalletWithBalance,
  createAssociatedTokenAccountWithBalance,
  createMarket,
  createNewMint,
} from "../util/test_util";
import { Monaco, monaco } from "../util/wrappers";

// Order parameters
const outcomeIndex = 1;
const price = 6.0;
const stake = 2000;

describe("Security: Cancel Order", () => {
  it("cancel fully unmatched order: success", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    await market.cancel(orderPk, purchaser);

    assert.deepEqual(
      await Promise.all([
        market.getForMatchingPool(outcomeIndex, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [{ len: 0, liquidity: 0, matched: 0 }, 0, 10000],
    );

    // check order was deleted
    try {
      await monaco.program.account.order.fetch(orderPk);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        "Account does not exist or has no data " + orderPk,
      );
    }
  });

  it("can cancel inplay order after inplay delay", async () => {
    const inplayDelay = 0;

    const now = Math.floor(new Date().getTime() / 1000);
    const eventStartTimestamp = now - 1000;
    const marketLockTimestamp = now + 1000;

    // Set up Market and related accounts
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(
        [price],
        true,
        inplayDelay,
        eventStartTimestamp,
        marketLockTimestamp,
      ),
    ]);
    await market.airdrop(purchaser, 10_000);

    const orderPk = await market.forOrder(0, stake, price, purchaser);

    await market.cancel(orderPk, purchaser);

    // check order was deleted
    try {
      await monaco.program.account.order.fetch(orderPk);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        "Account does not exist or has no data " + orderPk,
      );
    }
  });

  it("cancel fully unmatched order: impostor purchaser with token account for the same mint", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    const purchaserImpostor = await createWalletWithBalance(monaco.provider);
    const purchaserImpostorTokenPk = await market.airdrop(purchaserImpostor, 0);

    try {
      await monaco.program.methods
        .cancelOrder()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaserImpostor.publicKey, // impostor
          purchaserTokenAccount: purchaserImpostorTokenPk, // impostor
          payer: purchaser.publicKey,
          market: market.pk,
          marketEscrow: market.escrowPk,
          marketLiquidities: market.liquiditiesPk,
          marketOutcome: market.outcomePks[outcomeIndex],
          marketMatchingQueue: market.matchingQueuePk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([purchaserImpostor]) // impostor
        .rpc();
      assert.fail("expected CancelationPurchaserMismatch");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelationPurchaserMismatch");
    }

    // check the order wasn't cancelled
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeIndex, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], unmatched: [2000, 0, 2000] },
        { len: 1, liquidity: 2000, matched: 0 },
        2000,
        8000,
      ],
    );
  });

  it("cancel fully unmatched order: impostor purchaser with token account for a different mint", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    const mintOther = await createNewMint(
      monaco.provider,
      monaco.provider.wallet as NodeWallet,
      6,
    );
    const purchaserImpostor = await createWalletWithBalance(monaco.provider);
    const purchaserImpostorTokenPk =
      await createAssociatedTokenAccountWithBalance(
        mintOther,
        purchaserImpostor.publicKey,
        0,
      );

    try {
      await monaco.program.methods
        .cancelOrder()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaserImpostor.publicKey, // impostor
          purchaserTokenAccount: purchaserImpostorTokenPk, // impostor
          payer: purchaser.publicKey,
          market: market.pk,
          marketEscrow: market.escrowPk,
          marketLiquidities: market.liquiditiesPk,
          marketOutcome: market.outcomePks[outcomeIndex],
          marketMatchingQueue: market.matchingQueuePk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([purchaserImpostor]) // impostor
        .rpc();
      assert.fail("expected CancelationPurchaserMismatch");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelationPurchaserMismatch");
    }

    // check the order wasn't cancelled
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeIndex, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], unmatched: [2000, 0, 2000] },
        { len: 1, liquidity: 2000, matched: 0 },
        2000,
        8000,
      ],
    );
  });

  it("cancel fully unmatched order: purchaser with impostor token account for the same mint", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    const purchaserImpostor = await createWalletWithBalance(monaco.provider);
    const purchaserImpostorTokenPk =
      await createAssociatedTokenAccountWithBalance(
        market.mintPk,
        purchaserImpostor.publicKey,
        0,
      );

    try {
      await monaco.program.methods
        .cancelOrder()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaser.publicKey,
          purchaserTokenAccount: purchaserImpostorTokenPk, // impostor
          payer: purchaser.publicKey,
          market: market.pk,
          marketEscrow: market.escrowPk,
          marketLiquidities: market.liquiditiesPk,
          marketOutcome: market.outcomePks[outcomeIndex],
          marketMatchingQueue: market.matchingQueuePk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([purchaser])
        .rpc();
      assert.fail("expected ConstraintTokenOwner");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintTokenOwner");
    }

    // check the order wasn't cancelled
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeIndex, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], unmatched: [2000, 0, 2000] },
        { len: 1, liquidity: 2000, matched: 0 },
        2000,
        8000,
      ],
    );
  });

  it("cancel fully unmatched order: purchaser with impostor token account for a different mint", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    const mintOther = await createNewMint(
      monaco.provider,
      monaco.provider.wallet as NodeWallet,
      6,
    );
    const purchaserImpostor = await createWalletWithBalance(monaco.provider);
    const purchaserImpostorTokenPk =
      await createAssociatedTokenAccountWithBalance(
        mintOther,
        purchaserImpostor.publicKey,
        0,
      );

    try {
      await monaco.program.methods
        .cancelOrder()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaser.publicKey,
          purchaserTokenAccount: purchaserImpostorTokenPk, // impostor
          payer: purchaser.publicKey,
          market: market.pk,
          marketEscrow: market.escrowPk,
          marketLiquidities: market.liquiditiesPk,
          marketOutcome: market.outcomePks[outcomeIndex],
          marketMatchingQueue: market.matchingQueuePk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([purchaser])
        .rpc();
      assert.fail("expected ConstraintTokenOwner");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintTokenOwner");
    }

    // check the order wasn't cancelled
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeIndex, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], unmatched: [2000, 0, 2000] },
        { len: 1, liquidity: 2000, matched: 0 },
        2000,
        8000,
      ],
    );
  });

  it("cancel fully unmatched order: purchaser uses different token account for the same mint", async () => {
    // token program does not allow more than one account per mint for a given wallet
  });

  it("cancel fully unmatched order: purchaser uses different token account for a different mint", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    const mintOther = await createNewMint(
      monaco.provider,
      monaco.provider.wallet as NodeWallet,
      6,
    );
    const purchaserInvalidTokenPk =
      await createAssociatedTokenAccountWithBalance(
        mintOther,
        purchaser.publicKey,
        0,
      );

    try {
      await monaco.program.methods
        .cancelOrder()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaser.publicKey,
          purchaserTokenAccount: purchaserInvalidTokenPk, // invalid
          payer: purchaser.publicKey,
          market: market.pk,
          marketEscrow: market.escrowPk,
          marketLiquidities: market.liquiditiesPk,
          marketOutcome: market.outcomePks[outcomeIndex],
          marketMatchingQueue: market.matchingQueuePk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([purchaser])
        .rpc();
      assert.fail("expected ConstraintAssociated");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintAssociated");
    }

    // check the order wasn't cancelled
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeIndex, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], unmatched: [2000, 0, 2000] },
        { len: 1, liquidity: 2000, matched: 0 },
        2000,
        8000,
      ],
    );
  });

  it("cancel fully unmatched order: invalid market status", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    try {
      await market.settle(0);
      await market.cancel(orderPk, purchaser);
      assert.fail("expected CancelationMarketStatusInvalid");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelationMarketStatusInvalid");
    }

    // check the order wasn't cancelled
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeIndex, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], unmatched: [2000, 0, 2000] },
        { len: 1, liquidity: 2000, matched: 0 },
        2000,
        8000,
      ],
    );
  });

  it("cancel fully unmatched order: invalid market", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    const marketOther = await createMarket(
      monaco.program,
      monaco.provider,
      [price],
      null,
      null,
      ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
      6,
      3,
      true,
      market.mintPk,
    );

    try {
      await monaco.program.methods
        .cancelOrder()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaser.publicKey,
          purchaserTokenAccount: await market.cachePurchaserTokenPk(
            purchaser.publicKey,
          ),
          payer: monaco.operatorPk,
          market: marketOther.marketPda, // invalid
          marketEscrow: market.escrowPk,
          marketLiquidities: market.liquiditiesPk,
          marketOutcome: market.outcomePks[outcomeIndex],
          marketMatchingQueue: market.matchingQueuePk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([purchaser])
        .rpc();
      assert.fail("expected CancelationMarketMismatch");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelationMarketMismatch");
    }

    // check the order wasn't cancelled
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeIndex, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], unmatched: [2000, 0, 2000] },
        { len: 1, liquidity: 2000, matched: 0 },
        2000,
        8000,
      ],
    );
  });

  it("cancel fully unmatched order: invalid market escrow", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    const marketOther = await createMarket(
      monaco.program,
      monaco.provider,
      [price],
      null,
      null,
      ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
      6,
      3,
      true,
      market.mintPk,
    );

    try {
      await monaco.program.methods
        .cancelOrder()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaser.publicKey,
          purchaserTokenAccount: await market.cachePurchaserTokenPk(
            purchaser.publicKey,
          ),
          payer: monaco.operatorPk,
          market: market.pk,
          marketEscrow: marketOther.escrowPda, // invalid
          marketLiquidities: market.liquiditiesPk,
          marketOutcome: market.outcomePks[outcomeIndex],
          marketMatchingQueue: market.matchingQueuePk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([purchaser])
        .rpc();
      assert.fail("expected ConstraintSeeds");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintSeeds");
    }

    // check the order wasn't cancelled
    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getForMatchingPool(outcomeIndex, price),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], unmatched: [2000, 0, 2000] },
        { len: 1, liquidity: 2000, matched: 0 },
        2000,
        8000,
      ],
    );
  });

  it("cancel fully matched order fails", async () => {
    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    // Create a couple of opposing orders
    const forOrderPk = await market.forOrder(0, 10.0, price, purchaser);
    const againstOrderPk = await market.againstOrder(0, 10.0, price, purchaser);

    await market.processMatchingQueue(); // TODO move this lower after cancel method updated

    try {
      await market.cancel(forOrderPk, purchaser);
      assert.fail("expected CancelOrderNotCancellable");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelOrderNotCancellable");
    }
    try {
      await market.cancel(againstOrderPk, purchaser);
      assert.fail("expected CancelOrderNotCancellable");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelOrderNotCancellable");
    }
  });

  it("cancel unmatched order (inplay): fails as liquidity removed", async () => {
    // Set up Market and related accounts
    // Create market, purchaser
    const [market, purchaser1, purchaser2] = await Promise.all([
      monaco.create3WayMarketWithInplay([2.0, 3.0]),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
    ]);
    await market.airdrop(purchaser1, 1_000);
    await market.airdrop(purchaser2, 1_000);

    const makerPk = await market.forOrder(0, 10, 3.0, purchaser1);
    await market.updateMarketEventStartTimeToNow();

    assert.deepEqual(await market.getMarketLiquidities(), {
      liquiditiesAgainst: [],
      liquiditiesFor: [{ liquidity: 10, outcome: 0, price: 3, sources: [] }],
    });

    try {
      await market.cancel(makerPk, purchaser1);
      assert.fail("expected CancelationLowLiquidity");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelationLowLiquidity");
    }

    assert.deepEqual(await market.getMarketLiquidities(), {
      liquiditiesAgainst: [],
      liquiditiesFor: [{ liquidity: 10, outcome: 0, price: 3, sources: [] }],
    });

    await market.moveMarketToInplay();

    assert.deepEqual(await market.getMarketLiquidities(), {
      liquiditiesAgainst: [],
      liquiditiesFor: [],
    });
  });

  it("cancel matched order (inplay): fails as liquidity removed", async () => {
    // Set up Market and related accounts
    // Create market, purchaser
    const [market, purchaser1, purchaser2] = await Promise.all([
      monaco.create3WayMarketWithInplay([2.0, 3.0]),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
    ]);
    await market.airdrop(purchaser1, 10_000);
    await market.airdrop(purchaser2, 10_000);

    const makerPk = await market.forOrder(0, 10, 3.0, purchaser1);
    await market.againstOrder(0, 5, 3.0, purchaser2);
    await market.updateMarketEventStartTimeToNow();

    assert.deepEqual(await market.getMarketLiquidities(), {
      liquiditiesAgainst: [],
      liquiditiesFor: [{ liquidity: 5, outcome: 0, price: 3, sources: [] }],
    });

    try {
      await market.cancel(makerPk, purchaser1);
      assert.fail("expected InplayTransitionMarketMatchingQueueIsNotEmpty");
    } catch (e) {
      assert.equal(
        e.error.errorCode.code,
        "InplayTransitionMarketMatchingQueueIsNotEmpty",
      );
    }

    assert.deepEqual(
      await Promise.all([
        market.getMarketLiquidities(),
        market.getMarketMatchingQueueHead(),
      ]),
      [
        {
          liquiditiesAgainst: [],
          liquiditiesFor: [{ liquidity: 5, outcome: 0, price: 3, sources: [] }],
        },
        { forOutcome: true, outcomeIndex: 0, pk: null, price: 3, stake: 5 },
      ],
    );

    // will erase liquidity but not matching pools
    await market.moveMarketToInplay();

    assert.deepEqual(
      await Promise.all([
        market.getMarketLiquidities(),
        market.getMarketMatchingQueueHead(),
      ]),
      [
        {
          liquiditiesAgainst: [],
          liquiditiesFor: [],
        },
        { forOutcome: true, outcomeIndex: 0, pk: null, price: 3, stake: 5 },
      ],
    );

    // matching pools being still full lets us do this
    await market.processMatchingQueue();

    assert.deepEqual(
      await Promise.all([
        market.getMarketLiquidities(),
        market.getMarketMatchingQueueHead(),
      ]),
      [
        {
          liquiditiesAgainst: [],
          liquiditiesFor: [],
        },
        null,
      ],
    );
  });
});

async function setupUnmatchedOrder(
  protocol: Monaco,
  outcomeIndex: number,
  price: number,
  stake: number,
) {
  // Create market, purchaser
  const [purchaser, market] = await Promise.all([
    createWalletWithBalance(protocol.provider),
    protocol.create3WayMarket([price]),
  ]);
  await market.airdrop(purchaser, 10_000);

  const orderPk = await market.forOrder(outcomeIndex, stake, price, purchaser);

  assert.deepEqual(
    await Promise.all([
      protocol.getOrder(orderPk),
      market.getMarketPosition(purchaser),
      market.getForMatchingPool(outcomeIndex, price),
      market.getEscrowBalance(),
      market.getTokenBalance(purchaser),
    ]),
    [
      { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
      { matched: [0, 0, 0], unmatched: [2000, 0, 2000] },
      { len: 1, liquidity: 2000, matched: 0 },
      2000,
      8000,
    ],
  );

  return { market, purchaser, orderPk };
}
