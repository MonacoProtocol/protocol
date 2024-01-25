import assert from "assert";
import {
  getTradesForProviderWallet,
  getTradesForMarket,
  getTradesForOrder,
  confirmTransaction,
} from "../../npm-client/src";
import { createOrderUiStake as createOrderNpm } from "../../npm-client/src/create_order";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";

describe("Trades Query", () => {
  const outcomeIndex = 1;
  const price = 2.0;
  const stake = 10.0;
  const airdrop = 100.0;

  it("Gets trades", async () => {
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);
    await market.airdrop(purchaser, airdrop);
    await market.airdropProvider(airdrop);

    const forOrderTx = await createOrderNpm(
      monaco.getRawProgram(),
      market.pk,
      outcomeIndex,
      true,
      price,
      stake,
    );
    await confirmTransaction(monaco.getRawProgram(), forOrderTx.data.tnxID);
    const forOrderPk = await market.processNextOrderRequest();

    await market.againstOrder(outcomeIndex, 10.0, price, purchaser);

    await market.processMatchingQueue();
    await new Promise((e) => setTimeout(e, 1000));

    const responseForProvider = await getTradesForProviderWallet(
      monaco.getRawProgram(),
    );

    assert(responseForProvider.success);
    assert(responseForProvider.data);
    assert.deepEqual(responseForProvider.errors, []);
    assert(responseForProvider.data.tradeAccounts.length > 0);

    const responseForMarket = await getTradesForMarket(
      monaco.getRawProgram(),
      market.pk,
    );

    assert(responseForMarket.success);
    assert(responseForMarket.data);
    assert.deepEqual(responseForMarket.errors, []);
    assert.equal(responseForMarket.data.tradeAccounts.length, 2);

    const responseForOrder = await getTradesForOrder(
      monaco.getRawProgram(),
      forOrderPk,
    );

    assert(responseForOrder.success);
    assert(responseForOrder.data);
    assert.deepEqual(responseForOrder.errors, []);
    assert.equal(responseForOrder.data.tradeAccounts.length, 1);
  });
});
