import assert from "assert";
import {
  GetAccount,
  findMarketCommissionPaymentQueuePda,
  getMarketCommissionPaymentQueue,
  getNonEmptyMarketCommissionPaymentQueuePks,
  getNonEmptyMarketCommissionPaymentQueues,
  MarketCommissionPaymentQueue,
} from "../../npm-client";
import { externalPrograms, monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import { PublicKey } from "@solana/web3.js";

describe("Market Commission Payment Queue", () => {
  it("fetch by public-key", async () => {
    // Create market, purchaser
    const [forPurchaser, againstPurchaser, market, productPk] =
      await Promise.all([
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        monaco.create3WayMarket([3.0]),
        externalPrograms.createProduct("RATE_10_V1", 10),
      ]);
    await market.airdrop(forPurchaser, 10_000.0);
    await market.airdrop(againstPurchaser, 10_000.0);

    // create ORDERS
    await market.forOrder(0, 15, 3.0, forPurchaser, productPk);
    await market.againstOrder(0, 10, 3.0, againstPurchaser, productPk);
    await market.processMatchingQueue();
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(
      forPurchaser.publicKey,
      false,
    );

    const queuePda = await findMarketCommissionPaymentQueuePda(
      monaco.program,
      market.pk,
    );

    const queue1 = await getMarketCommissionPaymentQueue(
      monaco.program,
      queuePda.data.pda,
    );

    assert.deepEqual(
      queue1.data.account.market.toBase58(),
      market.pk.toBase58(),
    );
    assert.equal(queue1.data.account.paymentQueue.empty, false);
    assert.equal(queue1.data.account.paymentQueue.front, 0);
    assert.equal(queue1.data.account.paymentQueue.len, 2);

    await market.processCommissionPayments();

    const queue2 = await getMarketCommissionPaymentQueue(
      monaco.program,
      queuePda.data.pda,
    );
    assert.deepEqual(
      queue2.data.account.market.toBase58(),
      market.pk.toBase58(),
    );
    assert.equal(queue2.data.account.paymentQueue.empty, true);
    assert.equal(queue2.data.account.paymentQueue.front, 2);
    assert.equal(queue2.data.account.paymentQueue.len, 0);
  });

  it("fetch all non empty", async () => {
    // Create market, purchaser
    const [forPurchaser, againstPurchaser, market1, market2, productPk] =
      await Promise.all([
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        monaco.create3WayMarket([3.0]),
        monaco.create3WayMarket([3.0]),
        externalPrograms.createProduct("RATE_10_V2", 10),
      ]);
    await market1.airdrop(forPurchaser, 10_000.0);
    await market1.airdrop(againstPurchaser, 10_000.0);
    await market2.airdrop(forPurchaser, 10_000.0);
    await market2.airdrop(againstPurchaser, 10_000.0);

    // create ORDERS
    await market1.forOrder(0, 15, 3.0, forPurchaser, productPk);
    await market1.againstOrder(0, 10, 3.0, againstPurchaser, productPk);
    await market2.forOrder(0, 15, 3.0, forPurchaser, productPk);
    await market2.againstOrder(0, 10, 3.0, againstPurchaser, productPk);

    await market1.processMatchingQueue();
    await market1.settle(0);
    await market1.settleMarketPositionForPurchaser(
      forPurchaser.publicKey,
      false,
    );
    await market2.processMatchingQueue();
    await market2.settle(0);
    await market2.settleMarketPositionForPurchaser(
      forPurchaser.publicKey,
      false,
    );

    // need to filter markets as markets from other parallel tests are reported too
    const queuePkStrings = [
      market1.paymentsQueuePk.toBase58(),
      market2.paymentsQueuePk.toBase58(),
    ];
    const pkStringsCheck = (a: GetAccount<MarketCommissionPaymentQueue>) =>
      queuePkStrings.includes(a.publicKey.toBase58());
    const pkStringsCheck2 = (a: PublicKey) =>
      queuePkStrings.includes(a.toBase58());

    const queues1 = await getNonEmptyMarketCommissionPaymentQueues(
      monaco.program,
    );
    assert.equal(
      queues1.data.marketCommissionPaymentQueues.filter(pkStringsCheck).length,
      2,
    );
    const pks1 = await getNonEmptyMarketCommissionPaymentQueuePks(
      monaco.program,
    );
    assert.equal(pks1.data.publicKeys.filter(pkStringsCheck2).length, 2);

    await market1.processCommissionPayments();

    const queues2 = await getNonEmptyMarketCommissionPaymentQueues(
      monaco.program,
    );
    assert.equal(
      queues2.data.marketCommissionPaymentQueues.filter(pkStringsCheck).length,
      1,
    );
    const pks2 = await getNonEmptyMarketCommissionPaymentQueuePks(
      monaco.program,
    );
    assert.equal(pks2.data.publicKeys.filter(pkStringsCheck2).length, 1);

    await market2.processCommissionPayments();

    const queues3 = await getNonEmptyMarketCommissionPaymentQueues(
      monaco.program,
    );
    assert.equal(
      queues3.data.marketCommissionPaymentQueues.filter(pkStringsCheck).length,
      0,
    );
    const pks3 = await getNonEmptyMarketCommissionPaymentQueuePks(
      monaco.program,
    );
    assert.equal(pks3.data.publicKeys.filter(pkStringsCheck2).length, 0);
  });
});
