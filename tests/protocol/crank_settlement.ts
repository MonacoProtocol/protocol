import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import {
  createAssociatedTokenAccountWithBalance,
  createMarket,
  createNewMint,
  createWalletWithBalance,
  getProtocolProductProgram,
  processCommissionPayments,
} from "../util/test_util";
import assert from "assert";
import { MonacoProtocol } from "../../target/types/monaco_protocol";
import { findProductPda } from "../util/pdas";
import { monaco, MonacoMarket } from "../util/wrappers";

describe("Settlement Crank", () => {
  // Programs
  const protocolProgram = anchor.workspace
    .MonacoProtocol as Program<MonacoProtocol>;

  it("full match", async () => {
    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const { market, forOrderPda, againstOrderPda, wallet1, wallet2 } =
      await setupMarketAndFullyMatchedOrdersAndSettleMarket(
        outcome,
        price,
        forStake,
      );

    // Settle for order
    await market.settleMarketPositionForPurchaser(wallet1.publicKey);
    await market.settleOrder(forOrderPda);

    const forOrder = await protocolProgram.account.order.fetch(forOrderPda);
    assert.deepEqual(forOrder.orderStatus, { settledWin: {} });

    // Settle against order
    await market.settleMarketPositionForPurchaser(wallet2.publicKey);
    await market.settleOrder(againstOrderPda);

    const againstOrder = await protocolProgram.account.order.fetch(
      againstOrderPda,
    );
    assert.deepEqual(againstOrder.orderStatus, { settledLose: {} });

    await processCommissionPayments(
      protocolProgram as Program,
      getProtocolProductProgram() as Program,
      market.pk,
    );

    // tokens transferred back from market to purchaser after settlement, protocol commission deducted from winnings
    assert.deepEqual(
      await Promise.all([
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [0.0, 10.0 + againstStake * 0.9, 10.0 - againstStake],
    );
  });

  it("full match: different market", async () => {
    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const { market, forOrderPda, againstOrderPda, wallet1, wallet2 } =
      await setupMarketAndFullyMatchedOrdersAndSettleMarket(
        outcome,
        price,
        forStake,
      );

    const marketOther = await createMarket(
      protocolProgram,
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

    // Settle for order
    try {
      await protocolProgram.methods
        .settleOrder()
        .accounts({
          order: forOrderPda,
          purchaser: wallet1.publicKey,
          market: marketOther.marketPda,
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
          purchaser: wallet2.publicKey,
          market: marketOther.marketPda,
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
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: different market/escrow", async () => {
    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const { market, forOrderPda, againstOrderPda, wallet1, wallet2 } =
      await setupMarketAndFullyMatchedOrdersAndSettleMarket(
        outcome,
        price,
        forStake,
      );

    const marketOther = await monaco.create3WayMarket([price]);

    const commissionAccounts = await getSettlementCommissionAccounts(
      market.mintPk,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: await market.cachePurchaserTokenPk(
            wallet1.publicKey,
          ),
          marketPosition: await market.cacheMarketPositionPk(wallet1.publicKey),
          market: market.pk,
          marketEscrow: marketOther.escrowPk, // <====== wrong escrow
          commissionPaymentQueue: marketOther.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: await market.cachePurchaserTokenPk(
            wallet2.publicKey,
          ),
          marketPosition: await market.cacheMarketPositionPk(wallet2.publicKey),
          market: market.pk,
          marketEscrow: marketOther.escrowPk,
          commissionPaymentQueue: marketOther.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: different market/escrow/mint", async () => {
    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const { market, forOrderPda, againstOrderPda, wallet1, wallet2 } =
      await setupMarketAndFullyMatchedOrdersAndSettleMarket(
        outcome,
        price,
        forStake,
      );

    const marketOther = await monaco.create3WayMarket([price]);

    const commissionAccounts = await getSettlementCommissionAccounts(
      market.mintPk,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: await market.cachePurchaserTokenPk(
            wallet1.publicKey,
          ),
          marketPosition: await market.cacheMarketPositionPk(wallet1.publicKey),
          market: marketOther.pk,
          marketEscrow: marketOther.escrowPk,
          commissionPaymentQueue: marketOther.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: await market.cachePurchaserTokenPk(
            wallet2.publicKey,
          ),
          marketPosition: await market.cacheMarketPositionPk(wallet2.publicKey),
          market: marketOther.pk,
          marketEscrow: marketOther.escrowPk,
          commissionPaymentQueue: marketOther.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser impostor for the same mint", async () => {
    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const { market, forOrderPda, againstOrderPda, wallet1, wallet2 } =
      await setupMarketAndFullyMatchedOrdersAndSettleMarket(
        outcome,
        price,
        forStake,
      );

    const purchaserImpostor = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaserImpostor, 0.0);

    const commissionAccounts = await getSettlementCommissionAccounts(
      market.mintPk,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: await market.cachePurchaserTokenPk(
            purchaserImpostor.publicKey,
          ),
          marketPosition: await market.cacheMarketPositionPk(wallet1.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: await market.cachePurchaserTokenPk(
            purchaserImpostor.publicKey,
          ),
          marketPosition: await market.cacheMarketPositionPk(wallet2.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser impostor for a different mint", async () => {
    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const { market, forOrderPda, againstOrderPda, wallet1, wallet2 } =
      await setupMarketAndFullyMatchedOrdersAndSettleMarket(
        outcome,
        price,
        forStake,
      );

    const mintOther = await createNewMint(
      monaco.provider,
      monaco.provider.wallet as NodeWallet,
      6,
    );
    const purchaserImpostor = await createWalletWithBalance(
      monaco.provider,
      100000000,
    );
    const purchaserImpostorToken =
      await createAssociatedTokenAccountWithBalance(
        mintOther,
        purchaserImpostor.publicKey,
        0,
      );

    const commissionAccounts = await getSettlementCommissionAccounts(
      market.mintPk,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: await market.cacheMarketPositionPk(wallet1.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: await market.cacheMarketPositionPk(wallet2.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser impostor for a different mint which is passed in as well", async () => {
    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const { market, forOrderPda, againstOrderPda, wallet1, wallet2 } =
      await setupMarketAndFullyMatchedOrdersAndSettleMarket(
        outcome,
        price,
        forStake,
      );

    const mintOther = await createNewMint(
      monaco.provider,
      monaco.provider.wallet as NodeWallet,
      6,
    );
    const purchaserImpostor = await createWalletWithBalance(
      monaco.provider,
      100000000,
    );
    const purchaserImpostorToken =
      await createAssociatedTokenAccountWithBalance(
        mintOther,
        purchaserImpostor.publicKey,
        0,
      );

    const commissionAccounts = await getSettlementCommissionAccounts(
      market.mintPk,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: await market.cacheMarketPositionPk(wallet1.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: await market.cacheMarketPositionPk(wallet2.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser uses different token account for the same mint", async () => {
    // token program does not allow more than one account per mint for a given wallet
  });

  it("full match: purchaser uses different token account for a different mint", async () => {
    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const { market, forOrderPda, againstOrderPda, wallet1, wallet2 } =
      await setupMarketAndFullyMatchedOrdersAndSettleMarket(
        outcome,
        price,
        forStake,
      );

    const mintOther = await createNewMint(
      monaco.provider,
      monaco.provider.wallet as NodeWallet,
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

    const commissionAccounts = await getSettlementCommissionAccounts(
      market.mintPk,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: wallet1InvalidToken,
          marketPosition: await market.cacheMarketPositionPk(wallet1.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: wallet2InvalidToken,
          marketPosition: await market.cacheMarketPositionPk(wallet2.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser uses different token account for a different mint which is passed in as well", async () => {
    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const { market, forOrderPda, againstOrderPda, wallet1, wallet2 } =
      await setupMarketAndFullyMatchedOrdersAndSettleMarket(
        outcome,
        price,
        forStake,
      );

    const mintOther = await createNewMint(
      monaco.provider,
      monaco.provider.wallet as NodeWallet,
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

    const commissionAccounts = await getSettlementCommissionAccounts(
      market.mintPk,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: wallet1InvalidToken,
          marketPosition: await market.cacheMarketPositionPk(wallet1.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: wallet2InvalidToken,
          marketPosition: await market.cacheMarketPositionPk(wallet2.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser with impostor token account for the same mint", async () => {
    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const { market, forOrderPda, againstOrderPda, wallet1, wallet2 } =
      await setupMarketAndFullyMatchedOrdersAndSettleMarket(
        outcome,
        price,
        forStake,
      );

    const purchaserImpostor = await createWalletWithBalance(monaco.provider);

    const purchaserImpostorToken =
      await createAssociatedTokenAccountWithBalance(
        market.mintPk,
        purchaserImpostor.publicKey,
        0,
      );

    const commissionAccounts = await getSettlementCommissionAccounts(
      market.mintPk,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: await market.cacheMarketPositionPk(wallet1.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: await market.cacheMarketPositionPk(wallet2.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser with impostor token account for a different mint", async () => {
    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const { market, forOrderPda, againstOrderPda, wallet1, wallet2 } =
      await setupMarketAndFullyMatchedOrdersAndSettleMarket(
        outcome,
        price,
        forStake,
      );

    const mintOther = await createNewMint(
      monaco.provider,
      monaco.provider.wallet as NodeWallet,
      6,
    );
    const purchaserImpostor = await createWalletWithBalance(
      monaco.provider,
      100000000,
    );
    const purchaserImpostorToken =
      await createAssociatedTokenAccountWithBalance(
        mintOther,
        purchaserImpostor.publicKey,
        0,
      );

    const commissionAccounts = await getSettlementCommissionAccounts(
      market.mintPk,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: await market.cacheMarketPositionPk(wallet1.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: await market.cacheMarketPositionPk(wallet2.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("full match: purchaser with impostor token account for a different mint which is passed in as well", async () => {
    // Create market
    const outcome = 1; // DRAW
    const price = 1.7;
    const forStake = 5.0;
    const againstStake = forStake * (price - 1.0);

    const { market, forOrderPda, againstOrderPda, wallet1, wallet2 } =
      await setupMarketAndFullyMatchedOrdersAndSettleMarket(
        outcome,
        price,
        forStake,
      );

    const mintOther = await createNewMint(
      monaco.provider,
      monaco.provider.wallet as NodeWallet,
      6,
    );
    const purchaserImpostor = await createWalletWithBalance(
      monaco.provider,
      100000000,
    );
    const purchaserImpostorToken =
      await createAssociatedTokenAccountWithBalance(
        mintOther,
        purchaserImpostor.publicKey,
        0,
      );

    const commissionAccounts = await getSettlementCommissionAccounts(
      market.mintPk,
    );

    // Settle for order
    try {
      await protocolProgram.methods
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: await market.cacheMarketPositionPk(wallet1.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        .settleMarketPosition()
        .accounts({
          purchaserTokenAccount: purchaserImpostorToken,
          marketPosition: await market.cacheMarketPositionPk(wallet2.publicKey),
          market: market.pk,
          marketEscrow: market.escrowPk,
          commissionPaymentQueue: market.paymentsQueuePk,
          tokenProgram: TOKEN_PROGRAM_ID,
          protocolConfig: commissionAccounts.protocolProductPk,
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
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstStake, 10.0 - forStake, 10.0 - againstStake],
    );
  });

  it("partial match", async () => {
    // Create market
    const price = 1.8;
    const [wallet1, wallet2, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(wallet1, 100.0);
    await market.airdrop(wallet2, 100.0);

    // Create a couple of opposing orders
    const outcome = 1; // DRAW
    const forStake = 50.0;
    const againstStake = 52.0;
    const againstLiability = againstStake * (price - 1);

    const forPayout = forStake * price;
    const againstRefund = againstStake - forPayout + forStake;

    const forOrderPK = await market.forOrder(outcome, forStake, price, wallet1);
    const againstOrderPK = await market.againstOrder(
      outcome,
      againstStake,
      price,
      wallet2,
    );

    // Check balances after purchases
    assert.deepEqual(
      await Promise.all([
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstLiability, 100.0 - forStake, 100.0 - againstLiability],
    );

    //
    // Match
    //
    await market.processMatchingQueue();

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
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [forStake + againstLiability, 100.0 - forStake, 100.0 - againstLiability],
    );

    //
    // Settle as a DRAW
    //
    await market.settle(outcome);

    // Settle for order
    await market.settleMarketPositionForPurchaser(wallet1.publicKey);
    await market.settleOrder(forOrderPK);

    await processCommissionPayments(
      protocolProgram as Program,
      getProtocolProductProgram() as Program,
      market.pk,
    );

    const forOrderSettled = await protocolProgram.account.order.fetch(
      forOrderPK,
    );
    assert.deepEqual(forOrderSettled.orderStatus, { settledWin: {} });
    assert.equal(forOrderSettled.stakeUnmatched.toNumber(), 0);
    assert.equal(forOrderSettled.voidedStake.toNumber(), 0);

    const marketPosition = await market.getMarketPosition(wallet1);
    const marketOutcomeSums = marketPosition.matched;
    const expectedProfit = (forPayout - forStake) * 0.9;

    // Check balances after 1st settlement
    assert.deepEqual(
      await Promise.all([
        marketOutcomeSums,
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [[-50, 40, -50], 1.6, 100.0 + expectedProfit, 100.0 - againstLiability],
    );

    // Settle against order
    await market.settleMarketPositionForPurchaser(wallet2.publicKey);
    await market.settleOrder(againstOrderPK);

    const againstOrderSettled = await protocolProgram.account.order.fetch(
      againstOrderPK,
    );
    assert.deepEqual(againstOrderSettled.orderStatus, { settledLose: {} });
    assert.equal(againstOrderSettled.stakeUnmatched.toNumber(), 0);
    assert.equal(againstOrderSettled.voidedStake.toNumber(), 2000000);

    // Check balances after 2nd settlement
    assert.deepEqual(
      await Promise.all([
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [0.0, 100.0 + expectedProfit, 100.0 - againstStake + againstRefund],
    );
  });

  it("open order account closed and refunded", async () => {
    // Create market
    const price = 1.7;

    const [wallet, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(wallet, 10.0);

    const outcome = 1;
    const stake = 5;

    const forOrderPK = await market.forOrder(outcome, stake, price, wallet);

    // Check tokens transferred from purchaser to market after purchase
    assert.deepEqual(
      await Promise.all([
        market.getEscrowBalance(),
        market.getTokenBalance(wallet),
      ]),
      [stake, 10.0 - stake],
    );

    // Settle market
    await market.settle(1);
    await market.settleMarketPositionForPurchaser(wallet.publicKey);
    await market.settleOrder(forOrderPK);

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        market.getEscrowBalance(),
        market.getTokenBalance(wallet),
      ]),
      [0.0, 10.0],
    );

    // account should be closed
    try {
      await protocolProgram.account.order.fetch(forOrderPK);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        "Account does not exist or has no data " + forOrderPK,
      );
    }
  });

  it("matching refunds offset settlement payouts correctly", async () => {
    // Create market
    const prices = [2.0, 20.0];
    const [wallet1, wallet2, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(prices),
    ]);
    await market.airdrop(wallet1, 50.0);
    await market.airdrop(wallet2, 50.0);

    // Order 0 Data
    const outcomeIndex = 0;
    let orderPrice = prices[0];
    let forStake = 10.0;

    const { forOrderPda, againstOrderPda } = await setupFullyMatchedOrders(
      outcomeIndex,
      orderPrice,
      forStake,
      market,
      wallet2,
      wallet1,
    );

    // Order 1 Data
    orderPrice = prices[1];
    forStake = 1.0;

    const {
      forOrderPda: subsequentForOrderPda,
      againstOrderPda: subsequentAgainstOrderPda,
    } = await setupFullyMatchedOrders(
      outcomeIndex,
      orderPrice,
      forStake,
      market,
      wallet1,
      wallet2,
    );

    // All stakes will have been returned and there should be 9 left to pay out at settlement
    assert.deepEqual(
      await Promise.all([
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [9, 50, 41],
    );

    // Settle market
    await market.settle(outcomeIndex);

    // Settle wallet 1's orders
    await market.settleMarketPositionForPurchaser(wallet1.publicKey);
    await market.settleOrder(againstOrderPda);
    await market.settleOrder(subsequentForOrderPda);

    // Settle wallet 2's orders
    await market.settleMarketPositionForPurchaser(wallet2.publicKey);
    await market.settleOrder(forOrderPda);
    await market.settleOrder(subsequentAgainstOrderPda);

    await processCommissionPayments(
      protocolProgram as Program,
      getProtocolProductProgram() as Program,
      market.pk,
    );

    // tokens transferred back from market to purchaser after settlement
    assert.deepEqual(
      await Promise.all([
        market.getMarketPosition(wallet1),
        market.getMarketPosition(wallet2),
        market.getEscrowBalance(),
        market.getTokenBalance(wallet1),
        market.getTokenBalance(wallet2),
      ]),
      [
        { matched: [9, 9, 9], unmatched: [0, 0, 0] },
        { matched: [-9, -9, -9], unmatched: [0, 0, 0] },
        0,
        58.1,
        41,
      ],
    );
  });
});

async function setupFullyMatchedOrders(
  outcomeIndex: number,
  price: number,
  forStake: number,
  market: MonacoMarket,
  wallet1: Keypair,
  wallet2: Keypair,
) {
  const forOrderPda = await market.forOrder(
    outcomeIndex,
    forStake,
    price,
    wallet1,
  );
  const againstOrderPda = await market.againstOrder(
    outcomeIndex,
    forStake,
    price,
    wallet2,
  );
  await market.processMatchingQueue();

  return { forOrderPda, againstOrderPda };
}

async function setupMarketAndFullyMatchedOrdersAndSettleMarket(
  outcomeIndex: number,
  price: number,
  forStake: number,
) {
  // Create wallets
  const [wallet1, wallet2, market] = await Promise.all([
    createWalletWithBalance(monaco.provider),
    createWalletWithBalance(monaco.provider),
    monaco.create3WayMarket([price]),
  ]);
  await market.airdrop(wallet1, 10.0);
  await market.airdrop(wallet2, 10.0);

  const { forOrderPda, againstOrderPda } = await setupFullyMatchedOrders(
    outcomeIndex,
    price,
    forStake,
    market,
    wallet1,
    wallet2,
  );

  // Settle market
  await market.settle(outcomeIndex);

  return {
    market,
    forOrderPda,
    againstOrderPda,
    wallet1,
    wallet2,
  };
}

async function getSettlementCommissionAccounts(mintPk: PublicKey) {
  const protocolProductProgram = getProtocolProductProgram();
  const wallet = monaco.provider.wallet as NodeWallet;

  const protocolProductPk = await findProductPda(
    "MONACO_PROTOCOL",
    protocolProductProgram as Program,
  );
  const protocolConfig = await protocolProductProgram.account.product.fetch(
    protocolProductPk,
  );
  const protocolCommissionTokenAccount =
    await getOrCreateAssociatedTokenAccount(
      monaco.provider.connection,
      wallet.payer,
      mintPk,
      protocolConfig.commissionEscrow,
    );
  const protocolCommissionTokenAccountPk =
    protocolCommissionTokenAccount.address;

  return {
    protocolProductPk,
    protocolCommissionTokenAccountPk,
  };
}
