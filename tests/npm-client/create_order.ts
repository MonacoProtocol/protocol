import { externalPrograms, monaco } from "../util/wrappers";
import assert from "assert";
import { SystemProgram } from "@solana/web3.js";
import { createOrderUiStake } from "../../npm-client";

describe("NPM client - create order", () => {
  it("Create order with a custom product", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    await market.airdropProvider(10000);
    const productPk = await externalPrograms.createProduct("SOME_EXCHANGE", 99);

    const orderPk = await createOrderUiStake(
      monaco.getRawProgram(),
      market.pk,
      0,
      true,
      2.0,
      10,
      productPk,
    );

    // check that product is set to our custom product
    const orderAccount = await monaco.program.account.order.fetch(
      orderPk.data.orderPk,
    );
    assert.equal(orderAccount.product.toBase58(), productPk.toBase58());
  });

  it("Create order with default product", async () => {
    const market = await monaco.create3WayMarket([2.0]);
    await market.airdropProvider(10000);

    const orderPk = await createOrderUiStake(
      monaco.getRawProgram(),
      market.pk,
      0,
      true,
      2.0,
      10,
    );

    // check that product is set to default value - "11111111111111111111111111111111" (SystemProgram id for convenience)
    const orderAccount = await monaco.program.account.order.fetch(
      orderPk.data.orderPk,
    );
    assert.equal(orderAccount.product.toBase58(), SystemProgram.programId);
  });
});
