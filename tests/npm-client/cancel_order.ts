import { Program } from "@coral-xyz/anchor";
import assert from "assert";
import { createOrderUiStake as createOrderNpm } from "../../npm-client/src/create_order";
import {
  cancelOrder as cancelOrderNpm,
  calculateOrderCancellationRefund,
  cancelOrdersForMarket,
} from "../../npm-client/src/cancel_order";
import { monaco } from "../util/wrappers";
import {
  confirmTransaction,
  getMarketPosition,
  getOrder,
} from "../../npm-client/src";

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
    const orderPk = orderResponse.data.orderPk;
    await confirmTransaction(monaco.getRawProgram(), orderResponse.data.tnxID);

    await market.processNextOrderRequest();
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
    const [orderResponse1, orderResponse2] = await Promise.all([
      createOrderNpm(
        monaco.getRawProgram(),
        market.pk,
        outcomeIndex,
        true,
        price,
        stake,
      ),
      createOrderNpm(
        monaco.getRawProgram(),
        market.pk,
        outcomeIndex,
        true,
        price,
        stake,
      ),
    ]);

    const order1Pk = orderResponse1.data.orderPk;
    const order2Pk = orderResponse2.data.orderPk;

    await Promise.all([
      confirmTransaction(monaco.getRawProgram(), orderResponse1.data.tnxID),
      confirmTransaction(monaco.getRawProgram(), orderResponse2.data.tnxID),
    ]);

    await market.processOrderRequests();
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

  it("cancel: refund check", async () => {
    // Create market, purchaser
    const market = await monaco.create3WayMarket([price]);
    await market.airdropProvider(20_000);

    assert.equal(
      await market.getTokenBalance(monaco.provider.wallet.publicKey),
      20_000,
    );

    // use createOrderUiStake from npm client create order
    const order1Response = await createOrderNpm(
      monaco.getRawProgram(),
      market.pk,
      outcomeIndex,
      true,
      price,
      stake,
    );
    await confirmTransaction(monaco.getRawProgram(), order1Response.data.tnxID);
    assert.equal(
      await market.getTokenBalance(monaco.provider.wallet.publicKey),
      18_000, // risk was 2000
    );

    const order2Response = await createOrderNpm(
      monaco.getRawProgram(),
      market.pk,
      outcomeIndex,
      false,
      price,
      stake,
    );
    await confirmTransaction(monaco.getRawProgram(), order2Response.data.tnxID);
    assert.equal(
      await market.getTokenBalance(monaco.provider.wallet.publicKey),
      10_000, // risk was 10,000 but previous payment 2,000 is taken into account
    );

    await market.processOrderRequests();

    const [
      order1AccountResponse,
      order2AccountResponse,
      marketPositionResponse,
    ] = await Promise.all([
      getOrder(monaco.getRawProgram(), order1Response.data.orderPk),
      getOrder(monaco.getRawProgram(), order2Response.data.orderPk),
      getMarketPosition(
        monaco.getRawProgram(),
        market.pk,
        monaco.provider.wallet.publicKey,
      ),
    ]);
    assert.equal(
      calculateOrderCancellationRefund(
        order1AccountResponse.data.account,
        marketPositionResponse.data,
      ),
      0, // cancelation does not refund due to risk of 2nd order
    );
    assert.equal(
      calculateOrderCancellationRefund(
        order2AccountResponse.data.account,
        marketPositionResponse.data,
      ),
      8_000_000_000, // cancelation does refund some due to risk of 1nd order
    );

    const orderResponse3 = await cancelOrderNpm(
      monaco.program as Program,
      order1Response.data.orderPk,
    );
    await confirmTransaction(monaco.getRawProgram(), orderResponse3.data.tnxID);

    assert.equal(
      await market.getTokenBalance(monaco.provider.wallet.publicKey),
      10_000, // cancelation does not refund due to risk of 2nd order
    );
  });
});
