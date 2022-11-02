import * as anchor from "@project-serum/anchor";
import { AnchorProvider, Program } from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import {
  createAssociatedTokenAccountWithBalance,
  createAuthorisedOperatorsPda,
  createOrder,
  createMarket,
  createNewMint,
  createWalletWithBalance,
  matchOrder,
  OperatorType,
} from "../util/test_util";
import assert from "assert";
import { MonacoProtocol } from "../../target/types/monaco_protocol";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { findMarketPositionPda } from "../../npm-client/src";
import { Keypair, PublicKey } from "@solana/web3.js";

describe("Settlement Crank", () => {
  // Provider
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const getTokenBalance = async (tokenPk: PublicKey) =>
    (await provider.connection.getTokenAccountBalance(tokenPk)).value.uiAmount;

  // Programs
  const protocolProgram = anchor.workspace
    .MonacoProtocol as Program<MonacoProtocol>;

  it("unauthorised access", async () => {
    // Unauthorised operator
    const operatorAccountUnauthorised = anchor.web3.Keypair.generate();
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet1Token,
      wallet2,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet2.publicKey,
    );

    // Settle for order
    await protocolProgram.methods
      .settleOrder()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        order: forOrderPda,
        market: market.marketPda,
        purchaserTokenAccount: wallet1Token,
        purchaser: wallet1.publicKey,
        marketPosition: marketPositionFor.data.pda,
        marketEscrow: market.escrowPda,
        crankOperator: operatorAccountUnauthorised.publicKey,
        authorisedOperators: authorisedOperators,
      })
      .signers([operatorAccountUnauthorised])
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (err: anchor.AnchorError) {
          assert.equal(err.error.errorCode.code, "UnauthorisedOperator");
        },
      );

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { matched: {} });

    // Settle against order
    await protocolProgram.methods
      .settleOrder()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        order: againstOrderPda,
        market: market.marketPda,
        purchaserTokenAccount: wallet2Token,
        purchaser: wallet2.publicKey,
        marketPosition: marketPositionAgainst.data.pda,
        marketEscrow: market.escrowPda,
        crankOperator: operatorAccountUnauthorised.publicKey,
        authorisedOperators: authorisedOperators,
      })
      .signers([operatorAccountUnauthorised])
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (err: anchor.AnchorError) {
          assert.equal(err.error.errorCode.code, "UnauthorisedOperator");
        },
      );

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { matched: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet1Token,
      wallet2,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet2.publicKey,
    );

    // Settle for order
    await protocolProgram.methods
      .settleOrder()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        order: forOrderPda,
        market: market.marketPda,
        purchaserTokenAccount: wallet1Token,
        purchaser: wallet1.publicKey,
        marketPosition: marketPositionFor.data.pda,
        marketEscrow: market.escrowPda,
        crankOperator: operatorAccount,
        authorisedOperators: authorisedOperators,
      })
      .rpc();

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { settledWin: {} });

    // Settle against order
    await protocolProgram.methods
      .settleOrder()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        order: againstOrderPda,
        market: market.marketPda,
        purchaserTokenAccount: wallet2Token,
        purchaser: wallet2.publicKey,
        marketPosition: marketPositionAgainst.data.pda,
        marketEscrow: market.escrowPda,
        crankOperator: operatorAccount,
        authorisedOperators: authorisedOperators,
      })
      .rpc();

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { settledLose: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [0.0, 10.0 + againstStake, 10.0 - againstStake],
    );
  });

  it("full match: different market", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet1Token,
      wallet2,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet2.publicKey,
    );

    const marketOther = await createMarket(
      protocolProgram,
      provider,
      [price],
      null,
      null,
      ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
      6,
      3,
      true,
      market.mintPk,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: forOrderPda,
          purchaserTokenAccount: wallet1Token,
          purchaser: wallet1.publicKey,
          marketPosition: marketPositionFor.data.pda,
          market: marketOther.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "SettlementMarketMismatch");
    }

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { matched: {} });

    // Settle against order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: againstOrderPda,
          purchaserTokenAccount: wallet2Token,
          purchaser: wallet2.publicKey,
          marketPosition: marketPositionAgainst.data.pda,
          market: marketOther.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "SettlementMarketMismatch");
    }

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { matched: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: different market/escrow", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet1Token,
      wallet2,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,

      market.marketPda,
      wallet2.publicKey,
    );

    const marketOther = await createMarket(protocolProgram, provider, [price]);

    // Settle for order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: forOrderPda,
          purchaserTokenAccount: wallet1Token,
          purchaser: wallet1.publicKey,
          marketPosition: marketPositionFor.data.pda,
          market: market.marketPda,
          marketEscrow: marketOther.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintSeeds");
    }

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { matched: {} });

    // Settle against order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: againstOrderPda,
          purchaserTokenAccount: wallet2Token,
          purchaser: wallet2.publicKey,
          marketPosition: marketPositionAgainst.data.pda,
          market: market.marketPda,
          marketEscrow: marketOther.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintSeeds");
    }

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { matched: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: different market/escrow/mint", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet1Token,
      wallet2,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,

      market.marketPda,
      wallet2.publicKey,
    );

    const marketOther = await createMarket(protocolProgram, provider, [price]);

    // Settle for order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: forOrderPda,
          purchaserTokenAccount: wallet1Token,
          purchaser: wallet1.publicKey,
          marketPosition: marketPositionFor.data.pda,
          market: marketOther.marketPda,
          marketEscrow: marketOther.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintAssociated");
    }

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { matched: {} });

    // Settle against order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: againstOrderPda,
          purchaserTokenAccount: wallet2Token,
          purchaser: wallet2.publicKey,
          marketPosition: marketPositionAgainst.data.pda,
          market: marketOther.marketPda,
          marketEscrow: marketOther.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintAssociated");
    }

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { matched: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser impostor for the same mint", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet2,
      wallet1Token,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const purchaserImpostor = await createWalletWithBalance(
      provider,
      100000000,
    );
    const purchaserImpostorToken =
      await createAssociatedTokenAccountWithBalance(
        market.mintPk,
        purchaserImpostor.publicKey,
        0,
      );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,

      market.marketPda,
      wallet2.publicKey,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: forOrderPda,
          purchaser: purchaserImpostor.publicKey,
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: marketPositionFor.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "SettlementPurchaserMismatch");
    }

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { matched: {} });

    // Settle against order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: againstOrderPda,
          purchaser: purchaserImpostor.publicKey,
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: marketPositionAgainst.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "SettlementPurchaserMismatch");
    }

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { matched: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser impostor for a different mint", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet2,
      wallet1Token,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const mintOther = await createNewMint(
      provider,
      provider.wallet as NodeWallet,
      6,
    );
    const purchaserImpostor = await createWalletWithBalance(
      provider,
      100000000,
    );
    const purchaserImpostorToken =
      await createAssociatedTokenAccountWithBalance(
        mintOther,
        purchaserImpostor.publicKey,
        0,
      );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,

      market.marketPda,
      wallet2.publicKey,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: forOrderPda,
          purchaser: purchaserImpostor.publicKey,
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: marketPositionFor.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "SettlementPurchaserMismatch");
    }

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { matched: {} });

    // Settle against order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: againstOrderPda,
          purchaser: purchaserImpostor.publicKey,
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: marketPositionAgainst.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "SettlementPurchaserMismatch");
    }

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { matched: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser impostor for a different mint which is passed in as well", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet2,
      wallet1Token,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const mintOther = await createNewMint(
      provider,
      provider.wallet as NodeWallet,
      6,
    );
    const purchaserImpostor = await createWalletWithBalance(
      provider,
      100000000,
    );
    const purchaserImpostorToken =
      await createAssociatedTokenAccountWithBalance(
        mintOther,
        purchaserImpostor.publicKey,
        0,
      );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,

      market.marketPda,
      wallet2.publicKey,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: forOrderPda,
          purchaser: purchaserImpostor.publicKey,
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: marketPositionFor.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "SettlementPurchaserMismatch");
    }

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { matched: {} });

    // Settle against order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: againstOrderPda,
          purchaser: purchaserImpostor.publicKey,
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: marketPositionAgainst.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "SettlementPurchaserMismatch");
    }

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { matched: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser uses different token account for the same mint", async () => {
    // token program does not allow more than one account per mint for a given wallet
  });

  it("full match: purchaser uses different token account for a different mint", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet1Token,
      wallet2,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const mintOther = await createNewMint(
      provider,
      provider.wallet as NodeWallet,
      6,
    );
    const wallet1InvalidToken = await createAssociatedTokenAccountWithBalance(
      mintOther,
      wallet1.publicKey,
      0,
    );
    const wallet2InvalidToken = await createAssociatedTokenAccountWithBalance(
      mintOther,
      wallet2.publicKey,
      0,
    );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,

      market.marketPda,
      wallet2.publicKey,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: forOrderPda,
          purchaser: wallet1.publicKey,
          purchaserTokenAccount: wallet1InvalidToken,
          marketPosition: marketPositionFor.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintAssociated");
    }

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { matched: {} });

    // Settle against order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: againstOrderPda,
          purchaser: wallet2.publicKey,
          purchaserTokenAccount: wallet2InvalidToken,
          marketPosition: marketPositionAgainst.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintAssociated");
    }

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { matched: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser uses different token account for a different mint which is passed in as well", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet1Token,
      wallet2,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const mintOther = await createNewMint(
      provider,
      provider.wallet as NodeWallet,
      6,
    );
    const wallet1InvalidToken = await createAssociatedTokenAccountWithBalance(
      mintOther,
      wallet1.publicKey,
      0,
    );
    const wallet2InvalidToken = await createAssociatedTokenAccountWithBalance(
      mintOther,
      wallet2.publicKey,
      0,
    );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,

      market.marketPda,
      wallet2.publicKey,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: forOrderPda,
          purchaser: wallet1.publicKey,
          purchaserTokenAccount: wallet1InvalidToken,
          marketPosition: marketPositionFor.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintAssociated");
    }

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { matched: {} });

    // Settle against order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: againstOrderPda,
          purchaser: wallet2.publicKey,
          purchaserTokenAccount: wallet2InvalidToken,
          marketPosition: marketPositionAgainst.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintAssociated");
    }

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { matched: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser with impostor token account for the same mint", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet1Token,
      wallet2,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const purchaserImpostor = await createWalletWithBalance(
      provider,
      100000000,
    );
    const purchaserImpostorToken =
      await createAssociatedTokenAccountWithBalance(
        market.mintPk,
        purchaserImpostor.publicKey,
        0,
      );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,

      market.marketPda,
      wallet2.publicKey,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: forOrderPda,
          purchaser: wallet1.publicKey,
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: marketPositionFor.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintTokenOwner");
    }

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { matched: {} });

    // Settle against order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: againstOrderPda,
          purchaser: wallet2.publicKey,
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: marketPositionAgainst.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintTokenOwner");
    }

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { matched: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser with impostor token account for a different mint", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet1Token,
      wallet2,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const mintOther = await createNewMint(
      provider,
      provider.wallet as NodeWallet,
      6,
    );
    const purchaserImpostor = await createWalletWithBalance(
      provider,
      100000000,
    );
    const purchaserImpostorToken =
      await createAssociatedTokenAccountWithBalance(
        mintOther,
        purchaserImpostor.publicKey,
        0,
      );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,

      market.marketPda,
      wallet2.publicKey,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: forOrderPda,
          purchaser: wallet1.publicKey,
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: marketPositionFor.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintTokenOwner");
    }

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { matched: {} });

    // Settle against order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: againstOrderPda,
          purchaser: wallet2.publicKey,
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: marketPositionAgainst.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintTokenOwner");
    }

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { matched: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser with impostor token account for a different mint which is passed in as well", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const {
      market,
      forOrderPda,
      againstOrderPda,
      wallet1,
      wallet1Token,
      wallet2,
      wallet2Token,
    } = await setupMarketAndFullyMatchedOrdersAndSettleMarket(
      provider,
      outcome,
      price,
      forStake,
    );

    const mintOther = await createNewMint(
      provider,
      provider.wallet as NodeWallet,
      6,
    );
    const purchaserImpostor = await createWalletWithBalance(
      provider,
      100000000,
    );
    const purchaserImpostorToken =
      await createAssociatedTokenAccountWithBalance(
        mintOther,
        purchaserImpostor.publicKey,
        0,
      );

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,

      market.marketPda,
      wallet2.publicKey,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: forOrderPda,
          purchaser: wallet1.publicKey,
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: marketPositionFor.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintTokenOwner");
    }

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { matched: {} });

    // Settle against order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: againstOrderPda,
          purchaser: wallet2.publicKey,
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: marketPositionAgainst.data.pda,
          market: market.marketPda,
          marketEscrow: market.escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          crankOperator: operatorAccount,
          authorisedOperators: authorisedOperators,
        })
        .rpc();

      assert.fail("settleOrder should fail");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "ConstraintTokenOwner");
    }

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { matched: {} });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("partial match", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const price = 1.8;
    const market = await createMarket(protocolProgram, provider, [price]);

    // Create wallets
    const wallet1 = await createWalletWithBalance(provider, 100000000);
    const wallet1Token = await createAssociatedTokenAccountWithBalance(
      market.mintPk,
      wallet1.publicKey,
      100.0,
    );
    const wallet2 = await createWalletWithBalance(provider, 100000000);
    const wallet2Token = await createAssociatedTokenAccountWithBalance(
      market.mintPk,
      wallet2.publicKey,
      100.0,
    );

    // Create a couple of opposing orders
    const outcome = 1; // DRAW
    const forStake = 50.0;
    const againstStake = 52.0;
    const againstLiability = againstStake * (price - 1);

    const forPayout = forStake * price;
    const againstRefund = againstStake - forPayout + forStake;

    const forOrderPK = await createOrder(
      market.marketPda,
      wallet1,
      outcome,
      true,
      price,
      forStake,
      wallet1Token,
    );

    const againstOrderPK = await createOrder(
      market.marketPda,
      wallet2,
      outcome,
      false,
      price,
      againstStake,
      wallet2Token,
    );

    // Check balances after purchases
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstLiability, 100.0 - forStake, 100.0 - againstLiability],
    );

    //
    // Match
    //
    await matchOrder(
      forOrderPK,
      againstOrderPK,
      market.marketPda,
      market.outcomePdas[outcome],
      market.matchingPools[outcome][price],
      (provider.wallet as NodeWallet).payer,
      authorisedOperators,
    );

    // check payouts after match
    const forOrderMatched = await protocolProgram.account.order.fetch(
      forOrderPK,
    );
    assert.deepEqual(forOrderMatched.orderStatus, { matched: {} });
    assert.equal(forOrderMatched.stakeUnmatched.toNumber(), 0);
    assert.equal(forOrderMatched.voidedStake.toNumber(), 0);
    assert.equal(forOrderMatched.payout.toNumber(), 90000000);
    const againstOrderMatched = await protocolProgram.account.order.fetch(
      againstOrderPK,
    );
    assert.deepEqual(againstOrderMatched.orderStatus, { matched: {} });
    assert.equal(againstOrderMatched.stakeUnmatched.toNumber(), 2000000);
    assert.equal(againstOrderMatched.voidedStake.toNumber(), 0);
    assert.equal(againstOrderMatched.payout.toNumber(), 90000000);

    // Check balances after match
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [forStake + againstLiability, 100.0 - forStake, 100.0 - againstLiability],
    );

    //
    // Settle as a DRAW
    //

    // Settle market
    await protocolProgram.methods
      .settleMarket(outcome)
      .accounts({
        market: market.marketPda,
        authorisedOperators: market.authorisedMarketOperators,
        marketOperator: market.marketOperator.publicKey,
      })
      .signers([market.marketOperator])
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const marketPositionAgainst = await findMarketPositionPda(
      protocolProgram as Program,

      market.marketPda,
      wallet2.publicKey,
    );

    // Settle for order
    await protocolProgram.methods

      .settleOrder()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        order: forOrderPK,
        market: market.marketPda,
        purchaserTokenAccount: wallet1Token,
        purchaser: wallet1.publicKey,
        marketPosition: marketPositionFor.data.pda,
        marketEscrow: market.escrowPda,
        crankOperator: operatorAccount,
        authorisedOperators: authorisedOperators,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const forOrderSettled = await protocolProgram.account.order.fetch(
      forOrderPK,
    );
    assert.deepEqual(forOrderSettled.orderStatus, { settledWin: {} });
    assert.equal(forOrderSettled.stakeUnmatched.toNumber(), 0);
    assert.equal(forOrderSettled.voidedStake.toNumber(), 0);

    // Check balances after 1st settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [1.6, 100.0 - forStake + forPayout, 100.0 - againstLiability],
    );

    // Settle against order
    await protocolProgram.methods
      .settleOrder()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        order: againstOrderPK,
        market: market.marketPda,
        purchaserTokenAccount: wallet2Token,
        purchaser: wallet2.publicKey,
        marketPosition: marketPositionAgainst.data.pda,
        marketEscrow: market.escrowPda,
        crankOperator: operatorAccount,
        authorisedOperators: authorisedOperators,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const againstOrderSettled = await protocolProgram.account.order.fetch(
      againstOrderPK,
    );
    assert.deepEqual(againstOrderSettled.orderStatus, { settledLose: {} });
    assert.equal(againstOrderSettled.stakeUnmatched.toNumber(), 0);
    assert.equal(againstOrderSettled.voidedStake.toNumber(), 2000000);

    // Check balances after 2nd settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [0.0, 100.0 - forStake + forPayout, 100.0 - againstStake + againstRefund],
    );
  });

  it("open order account closed and refunded", async () => {
    // Default operator
    const operatorAccount = provider.wallet.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Create market
    const price = 1.7;
    const market = await createMarket(protocolProgram, provider, [price]);

    // Create wallet
    const wallet1 = await createWalletWithBalance(provider, 100000000);
    const wallet1Token = await createAssociatedTokenAccountWithBalance(
      market.mintPk,
      wallet1.publicKey,
      10.0,
    );

    const outcome = 1;
    const stake = 5;

    const forOrderPK = await createOrder(
      market.marketPda,
      wallet1,
      outcome,
      true,
      price,
      stake,
      wallet1Token,
    );

    // Check tokens transferred from purchaser to market after purchase
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
      ]),
      [stake, 10.0 - stake],
    );

    // Settle market
    await protocolProgram.methods
      .settleMarket(1)
      .accounts({
        market: market.marketPda,
        authorisedOperators: market.authorisedMarketOperators,
        marketOperator: market.marketOperator.publicKey,
      })
      .signers([market.marketOperator])
      .rpc();

    const marketPositionFor = await findMarketPositionPda(
      protocolProgram as Program,

      market.marketPda,
      wallet1.publicKey,
    );

    // Settle for order
    await protocolProgram.methods
      .settleOrder()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        order: forOrderPK,
        market: market.marketPda,
        purchaserTokenAccount: wallet1Token,
        purchaser: wallet1.publicKey,
        marketPosition: marketPositionFor.data.pda,
        marketEscrow: market.escrowPda,
        crankOperator: operatorAccount,
        authorisedOperators: authorisedOperators,
      })
      .rpc();

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
      ]),
      [0.0, 10.0],
    );

    // account should be closed
    try {
      await protocolProgram.account.order.fetch(forOrderPK);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(e, "Error: Account does not exist " + forOrderPK);
    }
  });

  it("matching refunds offset settlement payouts correctly", async () => {
    const program = anchor.workspace.MonacoProtocol as Program<MonacoProtocol>;

    // Create market
    const prices = [2.0, 20.0];
    const market = await createMarket(program, provider, prices);

    // Create wallets
    const wallet1 = await createWalletWithBalance(provider, 100000000);
    const wallet1Token = await createAssociatedTokenAccountWithBalance(
      market.mintPk,
      wallet1.publicKey,
      50.0,
    );
    const marketPosition1 = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet1.publicKey,
    );
    const wallet2 = await createWalletWithBalance(provider, 100000000);
    const wallet2Token = await createAssociatedTokenAccountWithBalance(
      market.mintPk,
      wallet2.publicKey,
      50.0,
    );
    const marketPosition2 = await findMarketPositionPda(
      protocolProgram as Program,
      market.marketPda,
      wallet2.publicKey,
    );

    // Order 0 Data
    const outcomeIndex = 0;
    let orderPrice = prices[0];
    let forStake = 10.0;

    const { forOrderPda, againstOrderPda } = await setupFullyMatchedOrders(
      provider,
      outcomeIndex,
      orderPrice,
      forStake,
      market,
      wallet2,
      wallet2Token,
      wallet1,
      wallet1Token,
    );

    // Order 1 Data
    orderPrice = prices[1];
    forStake = 1.0;

    const {
      forOrderPda: subsequentForOrderPda,
      againstOrderPda: subsequentAgainstOrderPda,
    } = await setupFullyMatchedOrders(
      provider,
      outcomeIndex,
      orderPrice,
      forStake,
      market,
      wallet1,
      wallet1Token,
      wallet2,
      wallet2Token,
    );

    // All stakes will have been returned and there should be 9 left to pay out at settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [29, 40, 31],
    );

    // Settle market
    await program.methods
      .settleMarket(outcomeIndex)
      .accounts({
        market: market.marketPda,
        authorisedOperators: market.authorisedMarketOperators,
        marketOperator: market.marketOperator.publicKey,
      })
      .signers([market.marketOperator])
      .rpc();

    // Settle orders
    const operatorAccount = (provider.wallet as NodeWallet).payer.publicKey;
    const authorisedOperators = await createAuthorisedOperatorsPda(
      OperatorType.CRANK,
    );

    // Settle wallet 1's orders
    await protocolProgram.methods
      .settleOrder()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        order: againstOrderPda,
        market: market.marketPda,
        purchaserTokenAccount: wallet1Token,
        purchaser: wallet1.publicKey,
        marketPosition: marketPosition1.data.pda,
        marketEscrow: market.escrowPda,
        crankOperator: operatorAccount,
        authorisedOperators: authorisedOperators,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
    await protocolProgram.methods
      .settleOrder()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        order: subsequentForOrderPda,
        market: market.marketPda,
        purchaserTokenAccount: wallet1Token,
        purchaser: wallet1.publicKey,
        marketPosition: marketPosition1.data.pda,
        marketEscrow: market.escrowPda,
        crankOperator: operatorAccount,
        authorisedOperators: authorisedOperators,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    // Settle wallet 2's orders
    await protocolProgram.methods
      .settleOrder()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        order: forOrderPda,
        market: market.marketPda,
        purchaserTokenAccount: wallet2Token,
        purchaser: wallet2.publicKey,
        marketPosition: marketPosition2.data.pda,
        marketEscrow: market.escrowPda,
        crankOperator: operatorAccount,
        authorisedOperators: authorisedOperators,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
    await protocolProgram.methods
      .settleOrder()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        order: subsequentAgainstOrderPda,
        market: market.marketPda,
        purchaserTokenAccount: wallet2Token,
        purchaser: wallet2.publicKey,
        marketPosition: marketPosition2.data.pda,
        marketEscrow: market.escrowPda,
        crankOperator: operatorAccount,
        authorisedOperators: authorisedOperators,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        getTokenBalance(market.escrowPda),
        getTokenBalance(wallet1Token),
        getTokenBalance(wallet2Token),
      ]),
      [0.0, 59.0, 41.0],
    );
  });
});

async function setupFullyMatchedOrders(
  provider: AnchorProvider,
  outcomeIndex: number,
  price: number,
  forStake: number,
  market: {
    mintPk: PublicKey;
    outcomePdas: Awaited<PublicKey>[];
    authorisedMarketOperators: PublicKey;
    escrowPda: PublicKey;
    outcomes: string[];
    marketPda: PublicKey;
    marketOperator: Keypair;
    matchingPools: { against: PublicKey; forOutcome: PublicKey }[][];
  },
  wallet1: Keypair,
  wallet1Token: PublicKey,
  wallet2: Keypair,
  wallet2Token: PublicKey,
) {
  const forOrderPda = await createOrder(
    market.marketPda,
    wallet1,
    outcomeIndex,
    true,
    price,
    forStake,
    wallet1Token,
  );

  const againstOrderPda = await createOrder(
    market.marketPda,
    wallet2,
    outcomeIndex,
    false,
    price,
    forStake,
    wallet2Token,
  );

  //
  // Match
  //
  const marketOperator = (provider.wallet as NodeWallet).payer;
  const authorisedOperators = await createAuthorisedOperatorsPda(
    OperatorType.CRANK,
  );
  await matchOrder(
    forOrderPda,
    againstOrderPda,
    market.marketPda,
    market.outcomePdas[outcomeIndex],
    market.matchingPools[outcomeIndex][price],
    marketOperator,
    authorisedOperators,
  );

  return { forOrderPda, againstOrderPda };
}

async function setupMarketAndFullyMatchedOrdersAndSettleMarket(
  provider: AnchorProvider,
  outcomeIndex: number,
  price: number,
  forStake: number,
) {
  const program = anchor.workspace.MonacoProtocol as Program<MonacoProtocol>;

  const market = await createMarket(program, provider, [price]);

  // Create wallets
  const [wallet1, wallet2] = await Promise.all([
    createWalletWithBalance(provider),
    createWalletWithBalance(provider),
  ]);
  const [wallet1Token, wallet2Token] = await Promise.all([
    createAssociatedTokenAccountWithBalance(
      market.mintPk,
      wallet1.publicKey,
      10.0,
    ),
    createAssociatedTokenAccountWithBalance(
      market.mintPk,
      wallet2.publicKey,
      10.0,
    ),
  ]);

  const { forOrderPda, againstOrderPda } = await setupFullyMatchedOrders(
    provider,
    outcomeIndex,
    price,
    forStake,
    market,
    wallet1,
    wallet1Token,
    wallet2,
    wallet2Token,
  );

  // Settle market
  await program.methods
    .settleMarket(outcomeIndex)
    .accounts({
      market: market.marketPda,
      authorisedOperators: market.authorisedMarketOperators,
      marketOperator: market.marketOperator.publicKey,
    })
    .signers([market.marketOperator])
    .rpc();

  return {
    market,
    forOrderPda,
    againstOrderPda,
    wallet1,
    wallet1Token,
    wallet2,
    wallet2Token,
  };
}
