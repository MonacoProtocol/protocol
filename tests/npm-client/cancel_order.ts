import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import assert from "assert";
import { createOrderUiStake as createOrderNpm } from "../../npm-client/src/create_order";
import {
  cancelOrder as cancelOrderNpm,
  cancelOrdersForMarket,
} from "../../npm-client/src/cancel_order";
import { monaco } from "../util/wrappers";

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
      monaco.program as Program<anchor.Idl>,
      market.pk,
      outcomeIndex,
      true,
      price,
      stake,
    );

    const orderPk = orderResponse.data.orderPk;

    await cancelOrderNpm(monaco.program as Program, orderPk);

    // check order was deleted
    try {
      await monaco.getOrder(orderPk);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        "Account does not exist or has no data " + orderPk,
      );
    }
  });

  it("cancel all orders for a market", async () => {
    // Create market, purchaser
    const market = await monaco.create3WayMarket([price]);
    await market.airdropProvider(10_000.0);

    // use createOrderUiStake from npm client create order
    const [orderResponse1, orderResponse2] = await Promise.all([
      createOrderNpm(
        monaco.program as Program<anchor.Idl>,
        market.pk,
        outcomeIndex,
        true,
        price,
        stake,
      ),
      createOrderNpm(
        monaco.program as Program<anchor.Idl>,
        market.pk,
        outcomeIndex,
        true,
        price,
        stake,
      ),
    ]);

    const order1Pk = orderResponse1.data.orderPk;
    const order2Pk = orderResponse2.data.orderPk;

    await cancelOrdersForMarket(monaco.program as Program, market.pk);

    // check order was deleted
    try {
      await monaco.getOrder(order1Pk);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        "Account does not exist or has no data " + order1Pk,
      );
    }
    // check order was deleted
    try {
      await monaco.getOrder(order2Pk);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        "Account does not exist or has no data " + order2Pk,
      );
    }
  });
});
