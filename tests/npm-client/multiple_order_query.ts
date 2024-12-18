import assert from "assert";
import {
  confirmTransaction,
  createOrderUiStake as createOrderNpm,
  getOrders,
  getOrdersByMarketForProviderWallet,
} from "../../npm-client";
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
    const orderResponse3 = await createOrderNpm(
      monaco.getRawProgram(),
      market.pk,
      outcomeIndex,
      true,
      price3,
      stake,
    );

    await Promise.all([
      confirmTransaction(monaco.getRawProgram(), orderResponse1.data.tnxID),
      confirmTransaction(monaco.getRawProgram(), orderResponse2.data.tnxID),
      confirmTransaction(monaco.getRawProgram(), orderResponse3.data.tnxID),
    ]);

    const createdOrderPks = await market.processOrderRequests();

    const responseByMarket = await getOrdersByMarketForProviderWallet(
      monaco.getRawProgram(),
      market.pk,
    );
    //verify all 3 were saved
    assert(responseByMarket.success);
    assert(responseByMarket.data);
    assert.equal(responseByMarket.data.accounts.length, 3);
    assert.deepEqual(responseByMarket.errors, []);

    const orderPk1 = createdOrderPks[0];
    const orderPk2 = createdOrderPks[1];
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
