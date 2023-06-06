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

const moveMarketToInplayDelay = 1500;

// Order parameters
const outcomeIndex = 1;
const price = 6.0;
const stake = 2000;

describe("Security: Cancel Inplay Order Post Event Start", () => {
  it("success: unmatched order", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    // Update Market's evenet start time
    await market.updateMarketEventStartTimeToNow();
    await new Promise((e) => setTimeout(e, moveMarketToInplayDelay));
    await market.moveMarketToInplay();

    await market.cancelPreplayOrderPostEventStart(orderPk);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 2000, status: { cancelled: {} } },
        { matched: [0, 0, 0], maxExposure: [0, 0, 0] },
        0,
        10000,
      ],
    );
  });

  it("success: partially matched order", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    const matchingOrderPk = await market.againstOrder(
      outcomeIndex,
      stake / 2,
      price,
      purchaser,
    );
    await market.match(orderPk, matchingOrderPk);

    // Update Market's evenet start time
    await market.updateMarketEventStartTimeToNow();
    await new Promise((e) => setTimeout(e, moveMarketToInplayDelay));
    await market.moveMarketToInplay();

    await market.cancelPreplayOrderPostEventStart(orderPk);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 1000, status: { matched: {} } },
        { matched: [0, 0, 0], maxExposure: [0, 0, 0] },
        0,
        10000,
      ],
    );
  });

  it("success: matched order", async () => {
    // Set up Market and related accounts
    const { market, purchaser, orderPk } = await setupUnmatchedOrder(
      monaco,
      outcomeIndex,
      price,
      stake,
    );

    const matchingOrderPk = await market.againstOrder(
      outcomeIndex,
      stake,
      price,
      purchaser,
    );
    await market.match(orderPk, matchingOrderPk);

    // Update Market's evenet start time
    await market.updateMarketEventStartTimeToNow();
    await new Promise((e) => setTimeout(e, moveMarketToInplayDelay));
    await market.moveMarketToInplay();

    await market.cancelPreplayOrderPostEventStart(orderPk);

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 0, stakeVoided: 0, status: { matched: {} } },
        { matched: [0, 0, 0], maxExposure: [0, 0, 0] },
        0,
        10000,
      ],
    );
  });

  // -----------------------------------------------------------------------------------------------------

  it("failure: market settled", async () => {
    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarketWithInplay([price]),
    ]);
    await market.airdrop(purchaser, 10_000);

    const orderPk = await market.forOrder(
      outcomeIndex,
      stake,
      price,
      purchaser,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2000, 0, 2000] },
        2000,
        8000,
      ],
    );

    // Update Market's evenet start time
    await market.updateMarketEventStartTimeToNow();
    await new Promise((e) => setTimeout(e, moveMarketToInplayDelay));
    await market.moveMarketToInplay();
    await market.settle(outcomeIndex);

    try {
      await market.cancelPreplayOrderPostEventStart(orderPk);
      assert.fail("expected CancelationMarketStatusInvalid");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelationMarketStatusInvalid");
    }
  });

  it("failure: market not inplay yet", async () => {
    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]), // not inplay
    ]);
    await market.airdrop(purchaser, 10_000);

    const orderPk = await market.forOrder(
      outcomeIndex,
      stake,
      price,
      purchaser,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2000, 0, 2000] },
        2000,
        8000,
      ],
    );

    // Update Market's evenet start time
    await market.updateMarketEventStartTimeToNow();
    await new Promise((e) => setTimeout(e, moveMarketToInplayDelay));

    try {
      await market.cancelPreplayOrderPostEventStart(orderPk);
      assert.fail("expected CancelationMarketNotInplay");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelationMarketNotInplay");
    }
  });

  it("failure: order created post event start", async () => {
    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarketWithInplay([price]),
    ]);
    await market.airdrop(purchaser, 10_000);

    // Update Market's evenet start time
    await market.updateMarketEventStartTimeToNow();
    await new Promise((e) => setTimeout(e, moveMarketToInplayDelay));
    await market.moveMarketToInplay();

    // Create Order after event start time
    const orderPk = await market.forOrder(
      outcomeIndex,
      stake,
      price,
      purchaser,
    );

    assert.deepEqual(
      await Promise.all([
        monaco.getOrder(orderPk),
        market.getMarketPosition(purchaser),
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2000, 0, 2000] },
        2000,
        8000,
      ],
    );

    try {
      await market.cancelPreplayOrderPostEventStart(orderPk);
      assert.fail("expected CancelationOrderCreatedAfterMarketEventStarted");
    } catch (e) {
      assert.equal(
        e.error.errorCode.code,
        "CancelationOrderCreatedAfterMarketEventStarted",
      );
    }
  });

  // -----------------------------------------------------------------------------------------------------

  it("failure: impostor purchaser with token account for the same mint", async () => {
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
        .cancelPreplayOrderPostEventStart()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaserImpostor.publicKey, // impostor
          purchaserToken: purchaserImpostorTokenPk, // impostor
          market: market.pk,
          marketEscrow: market.escrowPk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
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
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2000, 0, 2000] },
        2000,
        8000,
      ],
    );
  });

  it("failure: impostor purchaser with token account for a different mint", async () => {
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
        .cancelPreplayOrderPostEventStart()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaserImpostor.publicKey, // impostor
          purchaserToken: purchaserImpostorTokenPk, // impostor
          market: market.pk,
          marketEscrow: market.escrowPk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
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
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2000, 0, 2000] },
        2000,
        8000,
      ],
    );
  });

  it("failure: purchaser with impostor token account for the same mint", async () => {
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
        .cancelPreplayOrderPostEventStart()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaser.publicKey,
          purchaserToken: purchaserImpostorTokenPk, // impostor
          market: market.pk,
          marketEscrow: market.escrowPk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
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
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2000, 0, 2000] },
        2000,
        8000,
      ],
    );
  });

  it("failure: purchaser with impostor token account for a different mint", async () => {
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
        .cancelPreplayOrderPostEventStart()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaser.publicKey,
          purchaserToken: purchaserImpostorTokenPk, // impostor
          market: market.pk,
          marketEscrow: market.escrowPk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
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
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2000, 0, 2000] },
        2000,
        8000,
      ],
    );
  });

  it("failure: purchaser uses different token account for the same mint", async () => {
    // token program does not allow more than one account per mint for a given wallet
  });

  it("failure: purchaser uses different token account for a different mint", async () => {
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
        .cancelPreplayOrderPostEventStart()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaser.publicKey,
          purchaserToken: purchaserInvalidTokenPk, // invalid
          market: market.pk,
          marketEscrow: market.escrowPk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
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
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2000, 0, 2000] },
        2000,
        8000,
      ],
    );
  });

  it("failure: invalid market", async () => {
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
        .cancelPreplayOrderPostEventStart()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaser.publicKey,
          purchaserToken: await market.cachePurchaserTokenPk(
            purchaser.publicKey,
          ),
          market: marketOther.marketPda, // invalid
          marketEscrow: market.escrowPk,
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
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
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2000, 0, 2000] },
        2000,
        8000,
      ],
    );
  });

  it("failure: invalid market escrow", async () => {
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
        .cancelPreplayOrderPostEventStart()
        .accounts({
          order: orderPk,
          marketPosition: await market.cacheMarketPositionPk(
            purchaser.publicKey,
          ),
          purchaser: purchaser.publicKey,
          purchaserToken: await market.cachePurchaserTokenPk(
            purchaser.publicKey,
          ),
          market: market.pk,
          marketEscrow: marketOther.escrowPda, // invalid
          marketMatchingPool:
            market.matchingPools[outcomeIndex][price].forOutcome,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
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
        market.getEscrowBalance(),
        market.getTokenBalance(purchaser),
      ]),
      [
        { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
        { matched: [0, 0, 0], maxExposure: [2000, 0, 2000] },
        2000,
        8000,
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
    protocol.create3WayMarketWithInplay([price]),
  ]);
  await market.airdrop(purchaser, 10_000);

  const orderPk = await market.forOrder(outcomeIndex, stake, price, purchaser);

  assert.deepEqual(
    await Promise.all([
      protocol.getOrder(orderPk),
      market.getMarketPosition(purchaser),
      market.getEscrowBalance(),
      market.getTokenBalance(purchaser),
    ]),
    [
      { stakeUnmatched: 2000, stakeVoided: 0, status: { open: {} } },
      { matched: [0, 0, 0], maxExposure: [2000, 0, 2000] },
      2000,
      8000,
    ],
  );

  return { market, purchaser, orderPk };
}
