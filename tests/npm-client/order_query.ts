import assert from "assert";
import {
  getOrdersByMarketForProviderWallet,
  getOrdersByStatusForProviderWallet,
  getOrdersByEventForProviderWallet,
  getCancellableOrdersByMarketForProviderWallet,
  OrderStatus,
} from "../../npm-client/src";
import { createOrderUiStake as createOrderNpm } from "../../npm-client/src/create_order";
import { monaco } from "../util/wrappers";

describe("Order Query", () => {
  const outcomeIndex = 1;
  const price = 6.0;
  const stake = 2000;

  it("Gets order", async () => {
    const market = await monaco.create3WayMarket([price]);
    await market.airdropProvider(10_000.0);

    const createOrderResponse = await createOrderNpm(
      monaco.getRawProgram(),
      market.pk,
      outcomeIndex,
      true,
      price,
      stake,
    );

    assert(createOrderResponse.success);

    const responseByMarket = await getOrdersByMarketForProviderWallet(
      monaco.getRawProgram(),
      market.pk,
    );

    assert(responseByMarket.success);
    assert(responseByMarket.data);
    assert.equal(responseByMarket.data.orderAccounts.length, 1);
    assert.deepEqual(responseByMarket.errors, []);

    const responseByEvent = await getOrdersByEventForProviderWallet(
      monaco.getRawProgram(),
      market.eventPk,
    );

    assert(responseByEvent.success);
    assert(responseByEvent.data);
    assert.equal(responseByEvent.data.orderAccounts.length, 1);
    assert.deepEqual(responseByMarket.errors, []);

    const responseByStatus = await getOrdersByStatusForProviderWallet(
      monaco.getRawProgram(),
      OrderStatus.Open,
    );

    assert(responseByStatus.success);
    assert(responseByStatus.data);
    assert(responseByStatus.data.orderAccounts.length > 0);
    assert.deepEqual(responseByStatus.errors, []);

    const responseCancellable =
      await getCancellableOrdersByMarketForProviderWallet(
        monaco.getRawProgram(),
        market.pk,
      );

    assert(responseCancellable.success);
    assert(responseCancellable.data);
    assert.equal(responseCancellable.data.orderAccounts.length, 1);
    assert.deepEqual(responseCancellable.errors, []);
  });
});
