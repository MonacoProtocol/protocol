import { externalPrograms, monaco } from "../util/wrappers";
import assert from "assert";
import {
  confirmTransaction,
  createOrderUiStake,
  Order,
} from "../../npm-client";

describe("NPM client - create order", () => {
  it("Create order with a custom product", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    await market.airdropProvider(10000);
    const productPk = await externalPrograms.createProduct("SOME_EXCHANGE", 99);

    const orderRequestTx = await createOrderUiStake(
      monaco.getRawProgram(),
      market.pk,
      0,
      true,
      2.0,
      10,
      undefined,
      productPk,
    );

    await confirmTransaction(monaco.getRawProgram(), orderRequestTx.data.tnxID);

    const orderPk = await market.processNextOrderRequest();

    // check that product is set to our custom product
    const orderAccount = (await monaco.program.account.order.fetch(
      orderPk,
    )) as Order;
    assert.equal(orderAccount.product.toBase58(), productPk.toBase58());
  });

  it("Create order with default product", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    await market.airdropProvider(10000);

    const orderRequestTx = await createOrderUiStake(
      monaco.getRawProgram(),
      market.pk,
      0,
      true,
      2.0,
      10,
    );
    await confirmTransaction(monaco.getRawProgram(), orderRequestTx.data.tnxID);

    const orderPk = await market.processNextOrderRequest();

    // check that product is set to null (how rust Option<Pubkey> of None is represented)
    const orderAccount = (await monaco.program.account.order.fetch(
      orderPk,
    )) as Order;
    assert.equal(orderAccount.product, null);
  });

  it("Create order with mint decimals (6)", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    await market.airdropProvider(10000);

    const orderRequestTx = await createOrderUiStake(
      monaco.getRawProgram(),
      market.pk,
      0,
      true,
      2.0,
      10,
      null,
      null,
      6,
    );
    await confirmTransaction(monaco.getRawProgram(), orderRequestTx.data.tnxID);

    const orderPk = await market.processNextOrderRequest();

    const orderAccount = (await monaco.program.account.order.fetch(
      orderPk,
    )) as Order;
    assert.equal(orderAccount.stake.toNumber(), 10000000);
  });
});
