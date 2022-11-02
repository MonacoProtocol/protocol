import { PublicKey } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import assert from "assert";

import { Orders } from "../../npm-client/src/order_query";
import { OrderStatus } from "../../npm-client/types/order";
import { createWalletWithBalance } from "../util/test_util";
import { monaco } from "../util/wrappers";

describe("Order", () => {
  it("fetching from chain", async () => {
    const orderMarketOutcomePriceList = [3.1, 3.2, 3.3, 3.4, 3.5];

    // create MARKET for the ORDER
    const [wallet1, market1] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(orderMarketOutcomePriceList),
    ]);
    const [wallet2, market2] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.create3WayMarket(orderMarketOutcomePriceList),
    ]);
    await Promise.all([
      market1.airdrop(wallet1, 10_000.0),
      market1.airdrop(wallet2, 10_000.0),
      market2.airdrop(wallet1, 10_000.0),
      market2.airdrop(wallet2, 10_000.0),
    ]);

    // create ORDERS
    const orderMarketOutcomeIndex = 1;
    const orderStake = 1.0;

    const orderPKs = new Map<string, Set<string>>([
      [wallet1.publicKey.toBase58(), new Set<string>()],
      [wallet2.publicKey.toBase58(), new Set<string>()],
    ]);
    const orderMatchedPKs = new Map<string, Set<string>>([
      [wallet1.publicKey.toBase58(), new Set<string>()],
      [wallet2.publicKey.toBase58(), new Set<string>()],
    ]);
    const orderSettledPKs = new Map<string, Set<string>>([
      [wallet1.publicKey.toBase58(), new Set<string>()],
      [wallet2.publicKey.toBase58(), new Set<string>()],
    ]);
    const orderMarketPKs = new Map<string, Set<string>>([
      [market1.pk.toBase58(), new Set<string>()],
      [market2.pk.toBase58(), new Set<string>()],
    ]);

    for (const market of [market1, market2]) {
      let index = 0;
      for (const orderMarketOutcomePrice of orderMarketOutcomePriceList) {
        const [forOrderPK, againstOrderPK] = await Promise.all([
          market.forOrder(
            orderMarketOutcomeIndex,
            orderStake,
            orderMarketOutcomePrice,
            wallet1,
          ),
          market.againstOrder(
            orderMarketOutcomeIndex,
            orderStake,
            orderMarketOutcomePrice,
            wallet2,
          ),
        ]);

        orderPKs.get(wallet1.publicKey.toBase58()).add(forOrderPK.toBase58());
        orderPKs
          .get(wallet2.publicKey.toBase58())
          .add(againstOrderPK.toBase58());
        orderMarketPKs.get(market.pk.toBase58()).add(forOrderPK.toBase58());
        orderMarketPKs.get(market.pk.toBase58()).add(againstOrderPK.toBase58());

        if (index >= 2) {
          await market.match(forOrderPK, againstOrderPK);
          orderMatchedPKs
            .get(wallet1.publicKey.toBase58())
            .add(forOrderPK.toBase58());
          orderMatchedPKs
            .get(wallet2.publicKey.toBase58())
            .add(againstOrderPK.toBase58());
        }
        if (index == 4) {
          await market.settle(orderMarketOutcomeIndex);

          await Promise.all([
            market.settleOrder(forOrderPK),
            market.settleOrder(againstOrderPK),
          ]);

          orderMatchedPKs
            .get(wallet1.publicKey.toBase58())
            .delete(forOrderPK.toBase58());
          orderMatchedPKs
            .get(wallet2.publicKey.toBase58())
            .delete(againstOrderPK.toBase58());
          orderSettledPKs
            .get(wallet1.publicKey.toBase58())
            .add(forOrderPK.toBase58());
          orderSettledPKs
            .get(wallet2.publicKey.toBase58())
            .add(againstOrderPK.toBase58());
        }
        index++;
      }
    }

    const toBase58 = (
      accounts: {
        publicKey: PublicKey;
        account: unknown;
      }[],
    ) => accounts.map((account) => account.publicKey.toBase58());

    // check ORDERS with `order.all`
    {
      const accounts = await monaco.program.account.order.all();
      const accountsPKs = accounts.map((element) =>
        element.publicKey.toBase58(),
      );

      orderPKs.get(wallet1.publicKey.toBase58()).forEach((orderPK) => {
        assert.ok(accountsPKs.includes(orderPK), orderPK);
      });
      orderPKs.get(wallet2.publicKey.toBase58()).forEach((orderPK) => {
        assert.ok(accountsPKs.includes(orderPK), orderPK);
      });
    }

    const [
      accountsPksResponse,
      wallet1AccountsPksResponse,
      unmatchedAccountsPkResponses,
      matchedAccountsPksResponse,
      matchedByMarketAccountsPksResponse,
      settledAccountsPksMarket1Response,
      settledAccountsPksMarket2Response,
    ] = await Promise.all([
      new Orders(monaco.program as Program).fetch(),
      new Orders(monaco.program as Program)
        .filterByPurchaser(wallet1.publicKey)
        .fetch(),
      new Orders(monaco.program as Program)
        .filterByPurchaser(wallet1.publicKey)
        .filterByStatus(OrderStatus.Open)
        .fetch(),
      new Orders(monaco.program as Program)
        .filterByPurchaser(wallet1.publicKey)
        .filterByStatus(OrderStatus.Matched)
        .fetch(),
      new Orders(monaco.program as Program)
        .filterByPurchaser(wallet1.publicKey)
        .filterByMarket(market1.pk)
        .filterByStatus(OrderStatus.Matched)
        .fetch(),
      new Orders(monaco.program as Program)
        .filterByStatus(OrderStatus.SettledWin)
        .filterByMarket(market1.pk)
        .fetch(),
      new Orders(monaco.program as Program)
        .filterByStatus(OrderStatus.SettledWin)
        .filterByMarket(market2.pk)
        .fetch(),
    ]);

    const accountsPks = toBase58(accountsPksResponse.data.orderAccounts);
    const wallet1AccountsPks = toBase58(
      wallet1AccountsPksResponse.data.orderAccounts,
    );
    const unmatchedAccountsPks = toBase58(
      unmatchedAccountsPkResponses.data.orderAccounts,
    );
    const matchedAccountsPks = toBase58(
      matchedAccountsPksResponse.data.orderAccounts,
    );
    const matchedByMarketAccountsPks = toBase58(
      matchedByMarketAccountsPksResponse.data.orderAccounts,
    );
    const settledAccountsPksMarket1 = toBase58(
      settledAccountsPksMarket1Response.data.orderAccounts,
    );
    const settledAccountsPksMarket2 = toBase58(
      settledAccountsPksMarket2Response.data.orderAccounts,
    );

    // check ORDERS with `getProgramAccounts`
    {
      orderPKs.get(wallet1.publicKey.toBase58()).forEach((orderPK) => {
        assert.ok(accountsPks.includes(orderPK), orderPK);
      });
      orderPKs.get(wallet2.publicKey.toBase58()).forEach((orderPK) => {
        assert.ok(accountsPks.includes(orderPK), orderPK);
      });
    }

    // check ORDERS with `getProgramAccounts` owned by user
    {
      assert.equal(wallet1AccountsPks.length, 10);
      orderPKs.get(wallet1.publicKey.toBase58()).forEach((orderPK) => {
        assert.ok(wallet1AccountsPks.includes(orderPK), orderPK);
      });
      orderPKs.get(wallet2.publicKey.toBase58()).forEach((orderPK) => {
        assert.ok(!wallet1AccountsPks.includes(orderPK), orderPK);
      });
    }

    // check ORDERS with `getProgramAccounts` owned by user that are unmatched
    {
      assert.equal(unmatchedAccountsPks.length, 4);
      orderPKs.get(wallet1.publicKey.toBase58()).forEach((orderPK) => {
        const matched = orderMatchedPKs
          .get(wallet1.publicKey.toBase58())
          .has(orderPK);
        const settled = orderSettledPKs
          .get(wallet1.publicKey.toBase58())
          .has(orderPK);
        if (!matched && !settled) {
          assert.ok(unmatchedAccountsPks.includes(orderPK), orderPK);
        } else {
          assert.ok(!unmatchedAccountsPks.includes(orderPK), orderPK);
        }
      });
      orderPKs.get(wallet2.publicKey.toBase58()).forEach((orderPK) => {
        assert.ok(!unmatchedAccountsPks.includes(orderPK), orderPK);
      });
    }

    // check ORDERS with `getProgramAccounts` owned by user that are matched
    {
      assert.equal(matchedAccountsPks.length, 4);
      orderPKs.get(wallet1.publicKey.toBase58()).forEach((orderPK) => {
        const matched = orderMatchedPKs
          .get(wallet1.publicKey.toBase58())
          .has(orderPK);
        if (matched) {
          assert.ok(matchedAccountsPks.includes(orderPK), orderPK);
        } else {
          assert.ok(!matchedAccountsPks.includes(orderPK), orderPK);
        }
      });
      orderPKs.get(wallet2.publicKey.toBase58()).forEach((orderPK) => {
        assert.ok(!matchedAccountsPks.includes(orderPK), orderPK);
      });
    }

    // check ORDERS with `getProgramAccounts` owned by user in a market that are matched
    {
      assert.equal(matchedByMarketAccountsPks.length, 2);
      orderPKs.get(wallet1.publicKey.toBase58()).forEach((orderPK) => {
        const matched = orderMatchedPKs
          .get(wallet1.publicKey.toBase58())
          .has(orderPK);
        const market1Bool = orderMarketPKs
          .get(market1.pk.toBase58())
          .has(orderPK);
        if (matched && market1Bool) {
          assert.ok(matchedByMarketAccountsPks.includes(orderPK), orderPK);
        } else {
          assert.ok(!matchedByMarketAccountsPks.includes(orderPK), orderPK);
        }
      });
      orderPKs.get(wallet2.publicKey.toBase58()).forEach((orderPK) => {
        assert.ok(!matchedByMarketAccountsPks.includes(orderPK), orderPK);
      });
    }

    // check ORDERS with `getProgramAccounts` settled
    {
      const settledAccountsPks = settledAccountsPksMarket1.concat(
        settledAccountsPksMarket2,
      );
      assert.equal(settledAccountsPks.length, 2);
      orderPKs.get(wallet1.publicKey.toBase58()).forEach((orderPK) => {
        const settled = orderSettledPKs
          .get(wallet1.publicKey.toBase58())
          .has(orderPK);
        if (settled) {
          assert.ok(settledAccountsPks.includes(orderPK), `PK ${orderPK}!`);
        } else {
          assert.ok(!settledAccountsPks.includes(orderPK), `PK ${orderPK}!`);
        }
      });
      orderPKs.get(wallet2.publicKey.toBase58()).forEach((orderPK) => {
        // losing orders should not be returned
        assert.ok(!settledAccountsPks.includes(orderPK), orderPK);
      });
    }
  });
});
