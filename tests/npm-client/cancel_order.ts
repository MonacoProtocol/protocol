import { Program } from "@coral-xyz/anchor";
import assert from "assert";
import { createOrderUiStake as createOrderNpm } from "../../npm-client/src/create_order";
import {
  cancelOrder as cancelOrderNpm,
  cancelOrdersForMarket,
} from "../../npm-client/src/cancel_order";
import { monaco } from "../util/wrappers";
import { confirmTransaction, getOrder } from "../../npm-client/src";

// Order parameters
const outcomeIndex = 1;
const price = 6.0;
const stake = 2000;

describe("NPM client", () => {
  it("cancel single order", async () => {
    // Create market, purchaser
    const market = await monaco.create3WayMarket([price]);
    await market.airdropProvider(10_000.0);

    // use createOrderUiStake from npm client create order
    const orderResponse = await createOrderNpm(
      monaco.getRawProgram(),
      market.pk,
      outcomeIndex,
      true,
      price,
      stake,
    );
    await confirmTransaction(monaco.getRawProgram(), orderResponse.data.tnxID);

    const orderPk = await market.processNextOrderRequest();

    const cancelOrder = await cancelOrderNpm(
      monaco.program as Program,
      orderPk,
    );
    assert(cancelOrder.success);

    await new Promise((e) => setTimeout(e, 1000));

    const orderCheck = await getOrder(monaco.program as Program, orderPk);
    assert(orderCheck.success === false);
    assert(
      orderCheck.errors[0] as unknown as string,
      "Account does not exist or has no data " + orderPk,
    );
  });

  it("cancel all orders for a market", async () => {
    // Create market, purchaser
    const market = await monaco.create3WayMarket([price]);
    await market.airdropProvider(10_000.0);

    // use createOrderUiStake from npm client create order

    const orderResponse1 = await createOrderNpm(
      monaco.getRawProgram(),
      market.pk,
      outcomeIndex,
      true,
      price,
      stake,
    );
    const orderResponse2 = await createOrderNpm(
      monaco.getRawProgram(),
      market.pk,
      outcomeIndex,
      true,
      price,
      stake,
    );

    await Promise.all([
      confirmTransaction(monaco.getRawProgram(), orderResponse1.data.tnxID),
      confirmTransaction(monaco.getRawProgram(), orderResponse2.data.tnxID),
    ]);

    const [order1Pk, order2Pk] = await market.processOrderRequests();

    const cancelOrders = await cancelOrdersForMarket(
      monaco.program as Program,
      market.pk,
    );
    assert(cancelOrders.success);

    await new Promise((e) => setTimeout(e, 1000));

    const [orderCheck1, orderCheck2] = await Promise.all([
      getOrder(monaco.program as Program, order1Pk),
      getOrder(monaco.program as Program, order2Pk),
    ]);

    assert(orderCheck1.success === false);
    assert(orderCheck2.success === false);
    assert(
      orderCheck1.errors[0] as unknown as string,
      "Account does not exist or has no data " + order1Pk,
    );
    assert(
      orderCheck2.errors[0] as unknown as string,
      "Account does not exist or has no data " + order2Pk,
    );
  });
});
