import assert from "assert";
import {
  findMarketOrderRequestQueuePda,
  GetAccount,
  getMarketOrderRequestQueue,
  getNonEmptyMarketOrderRequestQueues,
  MarketOrderRequestQueue,
} from "../../npm-client";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";

describe("Market Order Request Queue", () => {
  it("fetch by public-key", async () => {
    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([3.0]),
    ]);
    await market.airdrop(purchaser, 10_000.0);

    // create ORDERS
    await market.forOrderRequest(0, 15, 3.0, purchaser);
    await market.againstOrderRequest(0, 10, 3.0, purchaser);

    const queuePda = await findMarketOrderRequestQueuePda(
      monaco.program,
      market.pk,
    );

    const queue1 = await getMarketOrderRequestQueue(
      monaco.program,
      queuePda.data.pda,
    );
    assert.deepEqual(
      queue1.data.account.market.toBase58(),
      market.pk.toBase58(),
    );
    assert.equal(queue1.data.account.orderRequests.empty, false);
    assert.equal(queue1.data.account.orderRequests.front, 0);
    assert.equal(queue1.data.account.orderRequests.len, 2);

    await market.processOrderRequests();

    const queue2 = await getMarketOrderRequestQueue(
      monaco.program,
      queuePda.data.pda,
    );
    assert.deepEqual(
      queue2.data.account.market.toBase58(),
      market.pk.toBase58(),
    );
    assert.equal(queue2.data.account.orderRequests.empty, true);
    assert.equal(queue2.data.account.orderRequests.front, 2);
    assert.equal(queue2.data.account.orderRequests.len, 0);
  });

  it("fetch all non empty", async () => {
    // Create market, purchaser
    const [purchaser, market1, market2] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([3.0]),
      monaco.create3WayMarket([3.0]),
    ]);
    await market1.airdrop(purchaser, 10_000.0);
    await market2.airdrop(purchaser, 10_000.0);

    // create ORDERS
    await market1.forOrderRequest(0, 15, 3.0, purchaser);
    await market1.againstOrderRequest(0, 10, 3.0, purchaser);
    await market2.forOrderRequest(0, 15, 3.0, purchaser);
    await market2.againstOrderRequest(0, 10, 3.0, purchaser);

    // need to filter markets as markets from other parallel tests are reported too
    const marketPkStrings = [market1.pk.toBase58(), market2.pk.toBase58()];
    const marketPkStringsCheck = (a: GetAccount<MarketOrderRequestQueue>) =>
      marketPkStrings.includes(a.account.market.toBase58());

    const queues1 = await getNonEmptyMarketOrderRequestQueues(monaco.program);
    assert.equal(
      queues1.data.marketOrderRequestQueues.filter(marketPkStringsCheck).length,
      2,
    );

    await market1.processOrderRequests();

    const queues2 = await getNonEmptyMarketOrderRequestQueues(monaco.program);
    assert.equal(
      queues2.data.marketOrderRequestQueues.filter(marketPkStringsCheck).length,
      1,
    );

    await market2.processOrderRequests();

    const queues3 = await getNonEmptyMarketOrderRequestQueues(monaco.program);
    assert.equal(
      queues3.data.marketOrderRequestQueues.filter(marketPkStringsCheck).length,
      0,
    );
  });
});
