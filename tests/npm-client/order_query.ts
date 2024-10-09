import { PublicKey } from "@solana/web3.js";
import assert from "assert";
import {
  confirmTransaction,
  createOrderUiStake as createOrderNpm,
  getOrdersByMarketForProviderWallet,
  getOrdersByStatusForProviderWallet,
  getOrdersByEventForProviderWallet,
  getCancellableOrdersByMarketForProviderWallet,
  OrderStatusFilter,
  Orders,
} from "../../npm-client";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";

describe("Order Query", () => {
  const outcomeA = 0;
  const outcomeB = 1;
  const price = 6.0;
  const stake = 2000;

  const pkBase58 = (publicKey: PublicKey) => publicKey.toBase58();

  it("Gets order", async () => {
    const market = await monaco.create3WayMarket([price]);
    await market.airdropProvider(10_000.0);

    const createOrderResponse = await createOrderNpm(
      monaco.getRawProgram(),
      market.pk,
      outcomeA,
      true,
      price,
      stake,
    );

    assert(createOrderResponse.success);
    await confirmTransaction(
      monaco.getRawProgram(),
      createOrderResponse.data.tnxID,
    );

    await market.processNextOrderRequest();

    const responseByMarket = await getOrdersByMarketForProviderWallet(
      monaco.getRawProgram(),
      market.pk,
    );

    assert(responseByMarket.success);
    assert(responseByMarket.data);
    assert.equal(responseByMarket.data.accounts.length, 1);
    assert.deepEqual(responseByMarket.errors, []);

    const responseByEvent = await getOrdersByEventForProviderWallet(
      monaco.getRawProgram(),
      market.eventPk,
    );

    assert(responseByEvent.success);
    assert(responseByEvent.data);
    assert.equal(responseByEvent.data.accounts.length, 1);
    assert.deepEqual(responseByMarket.errors, []);

    const responseByStatus = await getOrdersByStatusForProviderWallet(
      monaco.getRawProgram(),
      OrderStatusFilter.Open,
    );

    assert(responseByStatus.success);
    assert(responseByStatus.data);
    assert(responseByStatus.data.accounts.length > 0);
    assert.deepEqual(responseByStatus.errors, []);

    const responseCancellable =
      await getCancellableOrdersByMarketForProviderWallet(
        monaco.getRawProgram(),
        market.pk,
      );

    assert(responseCancellable.success);
    assert(responseCancellable.data);
    assert.equal(responseCancellable.data.accounts.length, 1);
    assert.deepEqual(responseCancellable.errors, []);
  });

  it("filterByMarket", async () => {
    const [purchaser, market1, market2] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
      monaco.create3WayMarket([price]),
    ]);
    await market1.airdrop(purchaser, 100.0);
    await market2.airdrop(purchaser, 100.0);

    const order1Pk = await market1.forOrder(outcomeA, 20.0, price, purchaser);
    const order2Pk = await market2.forOrder(outcomeA, 20.0, price, purchaser);

    // fetch orders for market "1"
    const response1 = await Orders.orderQuery(monaco.getRawProgram())
      .filterByMarket(market1.pk)
      .fetchPublicKeys();
    assert(response1.success);
    assert.deepEqual(response1.errors, []);
    assert.deepEqual(response1.data.publicKeys.map(pkBase58), [
      order1Pk.toBase58(),
    ]);

    // fetch orders for market "2"
    const response2 = await Orders.orderQuery(monaco.getRawProgram())
      .filterByMarket(market2.pk)
      .fetchPublicKeys();
    assert(response2.success);
    assert.deepEqual(response2.errors, []);
    assert.deepEqual(response2.data.publicKeys.map(pkBase58), [
      order2Pk.toBase58(),
    ]);
  });

  it("filterByMarketOutcomeIndex", async () => {
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    const order1Pk = await market.forOrder(outcomeA, 20.0, price, purchaser);
    const order2Pk = await market.forOrder(outcomeB, 20.0, price, purchaser);

    // fetch orders for outcome "A"
    const response1 = await Orders.orderQuery(monaco.getRawProgram())
      .filterByMarket(market.pk)
      .filterByMarketOutcomeIndex(outcomeA)
      .fetchPublicKeys();
    assert(response1.success);
    assert.deepEqual(response1.errors, []);
    assert.deepEqual(response1.data.publicKeys.map(pkBase58), [
      order1Pk.toBase58(),
    ]);

    // fetch orders for outcome "B"
    const response2 = await Orders.orderQuery(monaco.getRawProgram())
      .filterByMarket(market.pk)
      .filterByMarketOutcomeIndex(outcomeB)
      .fetchPublicKeys();
    assert(response2.success);
    assert.deepEqual(response2.errors, []);
    assert.deepEqual(response2.data.publicKeys.map(pkBase58), [
      order2Pk.toBase58(),
    ]);
  });

  it("filterByForOutcome", async () => {
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, 100.0);

    const order1Pk = await market.forOrder(outcomeA, 20.0, price, purchaser);
    const order2Pk = await market.againstOrder(
      outcomeA,
      20.0,
      price,
      purchaser,
    );

    // fetch orders for market "1" and for outcome "A"
    const response1 = await Orders.orderQuery(monaco.getRawProgram())
      .filterByMarket(market.pk)
      .filterByForOutcome(true)
      .fetchPublicKeys();
    assert(response1.success);
    assert.deepEqual(response1.errors, []);
    assert.deepEqual(response1.data.publicKeys.map(pkBase58), [
      order1Pk.toBase58(),
    ]);

    // fetch orders for market "1" and against outcome "A"
    const response2 = await Orders.orderQuery(monaco.getRawProgram())
      .filterByMarket(market.pk)
      .filterByForOutcome(false)
      .fetchPublicKeys();
    assert(response2.success);
    assert.deepEqual(response2.errors, []);
    assert.deepEqual(response2.data.publicKeys.map(pkBase58), [
      order2Pk.toBase58(),
    ]);
  });
});
