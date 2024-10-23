import assert from "assert";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

/*
 * Order Cancellation Payment 12
 *
 * In this scenario we are testing ability to cancel maker order in presence of
 * superior liquidity even if it's added after match has been made but still not resolved
 * (between order is created and match is processed).
 *
 * In this scenario maker order is created and fully matched, but it is still not processed.
 * Cancellation at this point should fail since there is no available liquidity.
 * HHowever after more liquidity is added it should succeed.
 */
describe("Order Cancellation Payment 12", () => {
  it("cancel after more liquidity added before match resolves", async () => {
    // Given
    // Create market, purchaser
    const [purchaser1, purchaser2, purchaser3, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([3.0]),
    ]);
    await market.airdrop(purchaser1, 100.0);
    await market.airdrop(purchaser2, 100.0);
    await market.airdrop(purchaser3, 100.0);

    // Create orders
    const forOrder1Pk = await market.forOrder(1, 10.0, 3.0, purchaser1);
    await market.againstOrder(1, 10.0, 3.0, purchaser2);

    // Try to cancel the maker order
    try {
      await market.cancel(forOrder1Pk, purchaser1);
      assert.fail("expected CancelationLowLiquidity");
    } catch (e) {
      assert.equal(e.error.errorCode.code, "CancelationLowLiquidity");
    }
    assert.deepEqual(await monaco.getOrder(forOrder1Pk), {
      stakeUnmatched: 10,
      stakeVoided: 0,
      status: { open: {} },
    });

    // Create more maker liquidity
    const forOrder2Pk = await market.forOrder(1, 10.0, 3.0, purchaser3);
    assert.deepEqual(await monaco.getOrder(forOrder2Pk), {
      stakeUnmatched: 10,
      stakeVoided: 0,
      status: { open: {} },
    });

    // Try to cancel the maker order again
    await market.cancel(forOrder1Pk, purchaser1);
    try {
      await monaco.getOrder(forOrder1Pk);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        "Account does not exist or has no data " + forOrder1Pk,
      );
    }

    // Match orders
    await market.processMatchingQueue();

    assert.deepEqual(await monaco.getOrder(forOrder2Pk), {
      stakeUnmatched: 0,
      stakeVoided: 0,
      status: { matched: {} },
    });
  });
});
