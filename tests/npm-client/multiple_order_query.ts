import assert from "assert";
import {
  getOrders,
  getOrdersByMarketForProviderWallet,
} from "../../npm-client/src";
import { createOrderUiStake as createOrderNpm } from "../../npm-client/src/create_order";
import { monaco } from "../util/wrappers";

describe("Multi Order Query", () => {
  const outcomeIndex = 1;
  const price1 = 6.0;
  const price2 = 7.0;
  const price3 = 8.0;
  const stake = 2000;

  it("Gets orders", async () => {
    const market = await monaco.create3WayMarket([price1, price2, price3]);
    await market.airdropProvider(10_000.0);

    const orderResponse1 = await createOrderNpm(
      monaco.getRawProgram(),
      market.pk,
      outcomeIndex,
      true,
      price1,
      stake,
    );

    const orderResponse2 = await createOrderNpm(
      monaco.getRawProgram(),
      market.pk,
      outcomeIndex,
      true,
      price2,
      stake,
    );
    await createOrderNpm(
      monaco.getRawProgram(),
      market.pk,
      outcomeIndex,
      true,
      price3,
      stake,
    );

    const responseByMarket = await getOrdersByMarketForProviderWallet(
      monaco.getRawProgram(),
      market.pk,
    );
    //verify all 3 were saved
    assert(responseByMarket.success);
    assert(responseByMarket.data);
    assert.equal(responseByMarket.data.orderAccounts.length, 3);
    assert.deepEqual(responseByMarket.errors, []);

    const orderPk1 = orderResponse1.data.orderPk;
    const orderPk2 = orderResponse2.data.orderPk;
    const orderPks = [orderPk1, orderPk2];

    const responseByOrderPk = await getOrders(monaco.getRawProgram(), orderPks);

    assert(responseByOrderPk.success);
    assert(responseByOrderPk.data);
    assert.equal(responseByOrderPk.data.orderAccounts.length, 2);
    assert.deepEqual(responseByMarket.errors, []);
    //verify order1 key matches order 1
    assert.equal(responseByOrderPk.data.orderAccounts[0].publicKey, orderPk1);
    assert.equal(
      responseByOrderPk.data.orderAccounts[0].account.expectedPrice,
      price1,
    );
    //verify order2 key matches order 2
    assert.equal(responseByOrderPk.data.orderAccounts[1].publicKey, orderPk2);
    assert.equal(
      responseByOrderPk.data.orderAccounts[1].account.expectedPrice,
      price2,
    );
  });
});
