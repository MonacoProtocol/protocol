import assert from "assert";
import {
  findMarketMatchingQueuePda,
  getMarketMatchingQueue,
} from "../../npm-client";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";

describe("Market Matching Queue", () => {
  it("fetching from chain", async () => {
    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([3.0]),
    ]);
    await market.airdrop(purchaser, 10_000.0);

    // create ORDERS
    await market.forOrder(0, 15, 3.0, purchaser);
    await market.againstOrder(0, 10, 3.0, purchaser);

    const marketMatchingQueuePda = await findMarketMatchingQueuePda(
      monaco.program,
      market.pk,
    );

    const marketMatchingQueue1 = await getMarketMatchingQueue(
      monaco.program,
      marketMatchingQueuePda.data.pda,
    );
    assert.deepEqual(
      marketMatchingQueue1.data.account.market.toBase58(),
      market.pk.toBase58(),
    );
    assert.equal(marketMatchingQueue1.data.account.matches.empty, false);
    assert.equal(marketMatchingQueue1.data.account.matches.front, 0);
    assert.equal(marketMatchingQueue1.data.account.matches.len, 1);

    await market.processMatchingQueue();

    const marketMatchingQueue2 = await getMarketMatchingQueue(
      monaco.program,
      marketMatchingQueuePda.data.pda,
    );
    assert.deepEqual(
      marketMatchingQueue2.data.account.market.toBase58(),
      market.pk.toBase58(),
    );
    assert.equal(marketMatchingQueue2.data.account.matches.empty, true);
    assert.equal(marketMatchingQueue2.data.account.matches.front, 1);
    assert.equal(marketMatchingQueue2.data.account.matches.len, 0);
  });
});
