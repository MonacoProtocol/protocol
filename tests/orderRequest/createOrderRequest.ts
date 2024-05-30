import * as anchor from "@coral-xyz/anchor";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";
import assert from "assert";
import { AnchorError, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { findMarketPdas, findUserPdas } from "../util/pdas";
import {
  findMarketOrderRequestQueuePda,
  MarketOrderRequestQueue,
} from "../../npm-client";

describe("Order Request Creation", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  it("success - create order request", async function () {
    const prices = [3.0, 4.9];

    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(prices),
    ]);
    await market.airdrop(purchaser, 1000.0);

    await market.forOrderRequest(0, 10.0, prices[0], purchaser);
    await market.againstOrderRequest(1, 10.0, prices[1], purchaser);

    const orderRequestQueue =
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;

    assert.equal(orderRequestQueue.market.toBase58(), market.pk.toBase58());
    assert.equal(orderRequestQueue.orderRequests.len, 2);

    const forOrderRequest = orderRequestQueue.orderRequests.items[0];
    assert.equal(forOrderRequest.marketOutcomeIndex, 0);
    assert.ok(forOrderRequest.forOutcome);
    assert.equal(forOrderRequest.product, null);
    assert.equal(forOrderRequest.stake.toNumber() / 10 ** 6, 10);
    assert.equal(forOrderRequest.expectedPrice, prices[0]);
    assert.equal(
      forOrderRequest.purchaser.toBase58(),
      purchaser.publicKey.toBase58(),
    );
    assert.equal(forOrderRequest.delayExpirationTimestamp.toNumber(), 0);

    const againstOrderRequest = orderRequestQueue.orderRequests.items[1];
    assert.equal(againstOrderRequest.marketOutcomeIndex, 1);
    assert.ok(!againstOrderRequest.forOutcome);
    assert.equal(againstOrderRequest.product, null);
    assert.equal(againstOrderRequest.stake.toNumber() / 10 ** 6, 10);
    assert.equal(againstOrderRequest.expectedPrice, prices[1]);
    assert.equal(
      againstOrderRequest.purchaser.toBase58(),
      purchaser.publicKey.toBase58(),
    );
    assert.equal(againstOrderRequest.delayExpirationTimestamp.toNumber(), 0);
  });

  it("success - create order request for inplay market", async function () {
    const prices = [3.0, 4.9];
    const inplayDelay = 10;

    const now = Math.floor(new Date().getTime() / 1000);
    const eventStartTimestamp = now + 20;
    const marketLockTimestamp = now + 1000;

    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(
        prices,
        true,
        inplayDelay,
        eventStartTimestamp,
        marketLockTimestamp,
      ),
    ]);

    await market.airdrop(purchaser, 1000.0);
    await market.updateMarketEventStartTimeToNow();
    await market.moveMarketToInplay();
    await market.forOrderRequest(0, 10.0, prices[0], purchaser);
    await market.againstOrderRequest(1, 10.0, prices[1], purchaser);

    const orderRequestQueue =
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;
    assert.equal(orderRequestQueue.orderRequests.len, 2);

    // check that inplay de
    const forOrderRequest = orderRequestQueue.orderRequests.items[0];
    assert.ok(forOrderRequest.forOutcome);
    assert.ok(
      forOrderRequest.delayExpirationTimestamp.toNumber() >
        Math.floor(new Date().getTime() / 1000),
    );

    const againstOrderRequest = orderRequestQueue.orderRequests.items[1];
    assert.ok(!againstOrderRequest.forOutcome);
    assert.ok(
      againstOrderRequest.delayExpirationTimestamp.toNumber() >
        Math.floor(new Date().getTime() / 1000),
    );
  });

  it("failure - enqueue expired order request", async function () {
    const price = 3.0;
    const outcomeIndex = 0;
    const forOutcome = true;
    const stake = 10.0;

    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price, price + 1]),
    ]);
    await market.airdrop(purchaser, 1000.0);

    await market
      ._createOrderRequest(outcomeIndex, forOutcome, stake, price, purchaser, {
        expiresOn: 1,
      })
      .then(
        function (_) {
          assert.fail("expected CreationExpired");
        },
        function (ae: AnchorError) {
          assert.equal(ae.error.errorCode.code, "CreationExpired");
        },
      );
  });

  it("failure - enqueue duplicate order request", async function () {
    const price = 3.0;
    const outcomeIndex = 0;
    const forOutcome = true;
    const stake = 10.0;

    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price, price + 1]),
    ]);
    const marketPk = market.pk;
    await market.airdrop(purchaser, 1000.0);

    const orderPk = await market.forOrderRequest(
      outcomeIndex,
      stake,
      price,
      purchaser,
    );

    const orderRequestQueue =
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;

    assert.equal(orderRequestQueue.orderRequests.len, 1);

    const duplicateDistinctSeed =
      orderRequestQueue.orderRequests.items[0].distinctSeed;

    try {
      const { uiAmountToAmount, marketOutcomePk } = await findMarketPdas(
        marketPk,
        forOutcome,
        outcomeIndex,
        price,
        monaco.program,
      );
      const { marketPositionPk } = await findUserPdas(
        marketPk,
        purchaser.publicKey,
        monaco.program,
      );

      // attempt to create order using same purchaser & distinct seeds as an existing item on the queue
      await monaco.program.methods
        .createOrderRequest({
          marketOutcomeIndex: outcomeIndex,
          forOutcome: forOutcome,
          stake: new BN(uiAmountToAmount(stake + 1)),
          price: price + 1,
          distinctSeed: duplicateDistinctSeed,
          expiresOn: null,
        })
        .accounts({
          reservedOrder: orderPk.data.orderPk,
          orderRequestQueue: (
            await findMarketOrderRequestQueuePda(monaco.program, marketPk)
          ).data.pda,
          marketPosition: marketPositionPk.data.pda,
          purchaser: purchaser.publicKey,
          payer: purchaser.publicKey,
          purchaserToken: await market.cachePurchaserTokenPk(
            purchaser.publicKey,
          ),
          market: marketPk,
          marketOutcome: marketOutcomePk,
          priceLadder: null,
          marketEscrow: market.escrowPk,
          product: null,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers(purchaser instanceof Keypair ? [purchaser] : [])
        .rpc();

      assert.fail("expected OrderRequestCreationDuplicateRequest");
    } catch (e) {
      assert.equal(
        e.error.errorCode.code,
        "OrderRequestCreationDuplicateRequest",
      );
    }
  });

  it("failure - enqueue order request which would create duplicate order", async function () {
    const price = 3.0;
    const outcomeIndex = 0;
    const forOutcome = true;
    const stake = 10.0;

    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    const marketPk = market.pk;
    await market.airdrop(purchaser, 1000.0);

    const orderPk = await market.forOrderRequest(
      outcomeIndex,
      stake,
      price,
      purchaser,
    );

    const orderRequestQueue =
      (await monaco.program.account.marketOrderRequestQueue.fetch(
        market.orderRequestQueuePk,
      )) as MarketOrderRequestQueue;

    assert.equal(orderRequestQueue.orderRequests.len, 1);

    await market.processNextOrderRequest();

    const duplicateDistinctSeed =
      orderRequestQueue.orderRequests.items[0].distinctSeed;

    try {
      const { uiAmountToAmount, marketOutcomePk } = await findMarketPdas(
        marketPk,
        forOutcome,
        outcomeIndex,
        price,
        monaco.program,
      );
      const { marketPositionPk } = await findUserPdas(
        marketPk,
        purchaser.publicKey,
        monaco.program,
      );

      await monaco.program.methods
        .createOrderRequest({
          marketOutcomeIndex: outcomeIndex,
          forOutcome: forOutcome,
          stake: new BN(uiAmountToAmount(stake)),
          price: price,
          distinctSeed: duplicateDistinctSeed,
          expiresOn: null,
        })
        .accounts({
          reservedOrder: orderPk.data.orderPk,
          orderRequestQueue: (
            await findMarketOrderRequestQueuePda(monaco.program, marketPk)
          ).data.pda,
          marketPosition: marketPositionPk.data.pda,
          purchaser: purchaser.publicKey,
          payer: purchaser.publicKey,
          purchaserToken: await market.cachePurchaserTokenPk(
            purchaser.publicKey,
          ),
          market: marketPk,
          marketOutcome: marketOutcomePk,
          priceLadder: null,
          marketEscrow: market.escrowPk,
          product: null,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers(purchaser instanceof Keypair ? [purchaser] : [])
        .rpc();

      assert.fail("expected Address already in use");
    } catch (e) {
      expect(e.logs).toEqual(
        expect.arrayContaining([
          expect.stringMatching(new RegExp(/.*Address.*already in use/)),
        ]),
      );
    }
  });
});
