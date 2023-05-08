import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import * as assert from "assert";
import console from "console";

describe("Void market position accounts", () => {
  it("void market position: success", async () => {
    const price = 2.0;
    const [purchaserA, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([price]),
    ]);

    const stake = 10;
    const expectedBalanceBeforeEntry = 100;
    const expectedBalanceAfterEntry = expectedBalanceBeforeEntry - stake;
    const expectedBalanceAfterVoid = expectedBalanceBeforeEntry;

    await market.airdrop(purchaserA, 100.0);

    const tokenBalanceBefore = await market.getTokenBalance(
      purchaserA.publicKey,
    );
    console.log("tokenBalanceBefore", tokenBalanceBefore);

    assert.equal(tokenBalanceBefore, expectedBalanceBeforeEntry);

    await market.forOrder(0, stake, price, purchaserA);
    const tokenBalanceAfterEntry = await market.getTokenBalance(
      purchaserA.publicKey,
    );
    console.log("tokenBalanceAfterEntry", tokenBalanceAfterEntry);

    assert.equal(tokenBalanceAfterEntry, expectedBalanceAfterEntry);

    await market.void();
    await market.voidMarketPositionForPurchaser(purchaserA.publicKey);

    const tokenBalanceAfterVoid = await market.getTokenBalance(
      purchaserA.publicKey,
    );
    console.log("tokenBalanceAfterVoid", tokenBalanceAfterVoid);

    assert.equal(tokenBalanceAfterVoid, expectedBalanceAfterVoid);
  });
});
