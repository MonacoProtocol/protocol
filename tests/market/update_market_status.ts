import assert from "assert";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { findMarketOrderRequestQueuePda } from "../../npm-client/";

describe("Market: update status", () => {
  it("Settle market", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([4.2]);

    await monaco.program.methods
      .settleMarket(1)
      .accounts({
        market: market.pk,
        marketMatchingQueue: market.matchingQueuePk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
        orderRequestQueue: (
          await findMarketOrderRequestQueuePda(monaco.program, market.pk)
        ).data.pda,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const marketAccount = await monaco.fetchMarket(market.pk);
    assert.equal(marketAccount.marketWinningOutcomeIndex, 1);
    assert.deepEqual(marketAccount.marketStatus, { readyForSettlement: {} });
  });

  it("Fail if market outcome index is outside range for market", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([4.2]);
    const winningIndex = market.outcomePks.length; // Invalid index

    try {
      await monaco.program.methods
        .settleMarket(winningIndex)
        .accounts({
          market: market.pk,
          marketMatchingQueue: market.matchingQueuePk,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
          marketOperator: monaco.operatorPk,
          orderRequestQueue: (
            await findMarketOrderRequestQueuePda(monaco.program, market.pk)
          ).data.pda,
        })
        .rpc();
      assert.fail("Error expected");
    } catch (e) {
      assert.equal(
        e.error.errorCode.code,
        "SettlementInvalidMarketOutcomeIndex",
      );
    }
    const marketAccount = await monaco.fetchMarket(market.pk);
    assert.equal(marketAccount.marketWinningOutcomeIndex, null);
    assert.deepEqual(marketAccount.marketStatus, { open: {} });
  });

  it("Complete market settlement", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([4.2]);

    await monaco.program.methods
      .settleMarket(1)
      .accounts({
        market: market.pk,
        marketMatchingQueue: market.matchingQueuePk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
        orderRequestQueue: (
          await findMarketOrderRequestQueuePda(monaco.program, market.pk)
        ).data.pda,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    await monaco.program.methods
      .completeMarketSettlement()
      .accounts({
        market: market.pk,
        commissionPaymentsQueue: market.paymentsQueuePk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketStatus, { settled: {} });
  });

  it("Transfer market escrow surplus fails if market not settled", async () => {
    // create a new market and purchaser
    const [market, purchaser] = await Promise.all([
      monaco.create3WayMarket([4.2]),
      createWalletWithBalance(monaco.provider),
    ]);
    await market.airdrop(purchaser, 100.0);

    // This order is never matched or cancelled or settled
    await market.forOrder(0, 1, 4.2, purchaser);

    await monaco.program.methods
      .settleMarket(1)
      .accounts({
        market: market.pk,
        marketMatchingQueue: market.matchingQueuePk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
        orderRequestQueue: (
          await findMarketOrderRequestQueuePda(monaco.program, market.pk)
        ).data.pda,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketStatus, { readyForSettlement: {} });

    assert.equal(
      (await monaco.provider.connection.getTokenAccountBalance(market.escrowPk))
        .value.uiAmount,
      1,
    );

    await monaco.program.methods
      .transferMarketTokenSurplus()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketFunding: market.fundingPk,
        marketAuthorityToken: (
          await getOrCreateAssociatedTokenAccount(
            monaco.provider.connection,
            monaco.operatorWallet.payer,
            market.mintPk,
            monaco.operatorPk,
          )
        ).address,
        marketOperator: monaco.operatorPk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "MarketInvalidStatus");
      });

    assert.equal(
      (await monaco.provider.connection.getTokenAccountBalance(market.escrowPk))
        .value.uiAmount,
      1,
    );
  });

  it("Set market ready to close successfully", async () => {
    // create a new market and purchaser
    const [market, purchaser] = await Promise.all([
      monaco.create3WayMarket([4.2]),
      createWalletWithBalance(monaco.provider),
    ]);
    await market.airdrop(purchaser, 100.0);

    // This order is never matched or cancelled or settled
    const orderPk = await market.forOrder(0, 1, 4.2, purchaser);

    await monaco.program.methods
      .settleMarket(1)
      .accounts({
        market: market.pk,
        marketMatchingQueue: market.matchingQueuePk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
        orderRequestQueue: (
          await findMarketOrderRequestQueuePda(monaco.program, market.pk)
        ).data.pda,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    await market.settleOrder(orderPk);
    await market.settleMarketPositionForPurchaser(purchaser.publicKey);

    let marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketStatus, { readyForSettlement: {} });

    await monaco.program.methods
      .completeMarketSettlement()
      .accounts({
        market: market.pk,
        commissionPaymentsQueue: market.paymentsQueuePk,
      })
      .rpc();

    marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketStatus, { settled: {} });

    assert.equal(
      (await monaco.provider.connection.getTokenAccountBalance(market.escrowPk))
        .value.uiAmount,
      0,
    );

    await monaco.program.methods
      .setMarketReadyToClose()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketFunding: market.fundingPk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketStatus, { readyToClose: {} });
  });

  it("Set market ready to close fails if escrow is non-zero", async () => {
    // create a new market and purchaser
    const [market, purchaser] = await Promise.all([
      monaco.create3WayMarket([4.2]),
      createWalletWithBalance(monaco.provider),
    ]);
    await market.airdrop(purchaser, 100.0);

    await market.airdropTokenAccount(market.escrowPk, 1);

    await monaco.program.methods
      .settleMarket(1)
      .accounts({
        market: market.pk,
        marketMatchingQueue: market.matchingQueuePk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
        orderRequestQueue: (
          await findMarketOrderRequestQueuePda(monaco.program, market.pk)
        ).data.pda,
      })
      .rpc();

    await monaco.program.methods
      .completeMarketSettlement()
      .accounts({
        market: market.pk,
        commissionPaymentsQueue: market.paymentsQueuePk,
      })
      .rpc();

    assert.equal(
      (await monaco.provider.connection.getTokenAccountBalance(market.escrowPk))
        .value.uiAmount,
      1,
    );

    await monaco.program.methods
      .setMarketReadyToClose()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        marketFunding: market.fundingPk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
      })
      .rpc()
      .then(() => assert.fail("Error expected"))
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "SettlementMarketEscrowNonZero");
      });
  });

  it("Publish and unpublish", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([4.2]);

    const marketAccount1 = await monaco.fetchMarket(market.pk);
    assert.equal(marketAccount1.published, false);

    await monaco.program.methods
      .publishMarket()
      .accounts({
        market: market.pk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const marketAccount2 = await monaco.fetchMarket(market.pk);
    assert.equal(marketAccount2.published, true);

    await monaco.program.methods
      .unpublishMarket()
      .accounts({
        market: market.pk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const marketAccount3 = await monaco.fetchMarket(market.pk);
    assert.equal(marketAccount3.published, false);
  });

  it("Suspend and unsuspend", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([4.2]);

    const marketAccount1 = await monaco.fetchMarket(market.pk);
    assert.equal(marketAccount1.suspended, false);

    await monaco.program.methods
      .suspendMarket()
      .accounts({
        market: market.pk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const marketAccount2 = await monaco.fetchMarket(market.pk);
    assert.equal(marketAccount2.suspended, true);

    await monaco.program.methods
      .unsuspendMarket()
      .accounts({
        market: market.pk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const marketAccount3 = await monaco.fetchMarket(market.pk);
    assert.equal(marketAccount3.suspended, false);
  });
});
