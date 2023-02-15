import assert from "assert";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";

describe("Market: update status", () => {
  it("Settle market", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([4.2]);

    await monaco.program.methods
      .settleMarket(1)
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
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
          marketOperator: monaco.operatorPk,
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
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
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
        marketEscrow: market.escrowPk,
        authorisedOperators: await monaco.findCrankAuthorisedOperatorsPda(),
        crankOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketStatus, { settled: {} });
  });

  it("Complete market settlement fails when escrow is non-zero", async () => {
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
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    let marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketStatus, { readyForSettlement: {} });

    await monaco.program.methods
      .completeMarketSettlement()
      .accounts({
        market: market.pk,
        marketEscrow: market.escrowPk,
        authorisedOperators: await monaco.findCrankAuthorisedOperatorsPda(),
        crankOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "SettlementMarketEscrowNonZero");
      });

    marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketStatus, { readyForSettlement: {} });
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
