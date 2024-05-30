import assert from "assert";
import {
  findMarketMatchingQueuePda,
  GetAccount,
  getMarketMatchingQueue,
  getNonEmptyMarketMatchingQueues,
  MarketMatchingQueue,
} from "../../npm-client";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";

describe("Market Matching Queue", () => {
  it("fetch by public-key", async () => {
    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket([3.0]),
    ]);
    await market.airdrop(purchaser, 10_000.0);

    // create ORDERS
    await market.forOrder(0, 15, 3.0, purchaser);
    await market.againstOrder(0, 10, 3.0, purchaser);

    const queuePda = await findMarketMatchingQueuePda(
      monaco.program,
      market.pk,
    );

    const queue1 = await getMarketMatchingQueue(
      monaco.program,
      queuePda.data.pda,
    );
    assert.deepEqual(
      queue1.data.account.market.toBase58(),
      market.pk.toBase58(),
    );
    assert.equal(queue1.data.account.matches.empty, false);
    assert.equal(queue1.data.account.matches.front, 0);
    assert.equal(queue1.data.account.matches.len, 1);

    await market.processMatchingQueue();

    const queue2 = await getMarketMatchingQueue(
      monaco.program,
      queuePda.data.pda,
    );
    assert.deepEqual(
      queue2.data.account.market.toBase58(),
      market.pk.toBase58(),
    );
    assert.equal(queue2.data.account.matches.empty, true);
    assert.equal(queue2.data.account.matches.front, 1);
    assert.equal(queue2.data.account.matches.len, 0);
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
    await market1.forOrder(0, 15, 3.0, purchaser);
    await market1.againstOrder(0, 10, 3.0, purchaser);
    await market2.forOrder(0, 15, 3.0, purchaser);
    await market2.againstOrder(0, 10, 3.0, purchaser);

    // need to filter markets as markets from other parallel tests are reported too
    const marketPkStrings = [market1.pk.toBase58(), market2.pk.toBase58()];
    const marketPkStringsCheck = (a: GetAccount<MarketMatchingQueue>) =>
      marketPkStrings.includes(a.account.market.toBase58());

    const queues1 = await getNonEmptyMarketMatchingQueues(monaco.program);
    assert.equal(
      queues1.data.marketMatchingQueues.filter(marketPkStringsCheck).length,
      2,
    );

    await market1.processMatchingQueue();

    const queues2 = await getNonEmptyMarketMatchingQueues(monaco.program);
    assert.equal(
      queues2.data.marketMatchingQueues.filter(marketPkStringsCheck).length,
      1,
    );

    await market2.processMatchingQueue();

    const queues3 = await getNonEmptyMarketMatchingQueues(monaco.program);
    assert.equal(
      queues3.data.marketMatchingQueues.filter(marketPkStringsCheck).length,
      0,
    );
  });
});
