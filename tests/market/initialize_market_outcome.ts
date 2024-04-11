import { PublicKey, SystemProgram } from "@solana/web3.js";
import assert from "assert";
import { monaco } from "../util/wrappers";
import { findMarketOutcomePda } from "../../npm-client";
import { AnchorError } from "@coral-xyz/anchor";
import console from "console";

describe("Market: market outcome initialization", () => {
  it("Success with price ladder account", async () => {
    // create a new market
    const market = await monaco.createMarket([], []);
    const priceLadderPk = await monaco.createPriceLadder([1.001, 1.01, 1.1]);

    const [marketOutcomePk, __] = await PublicKey.findProgramAddress(
      [market.pk.toBuffer(), Buffer.from("0")],
      monaco.program.programId,
    );

    await monaco.program.methods
      .initializeMarketOutcome("EXTRA")
      .accounts({
        systemProgram: SystemProgram.programId,
        outcome: marketOutcomePk,
        priceLadder: priceLadderPk,
        market: market.pk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    // check the state of the newly created account
    const marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketOutcomesCount, 1);

    const marketOutcome = await monaco.fetchMarketOutcome(marketOutcomePk);
    assert.deepEqual(marketOutcome.index, 0);
    assert.deepEqual(marketOutcome.title, "EXTRA");
    assert.deepEqual(marketOutcome.priceLadder, []);
    assert.equal(marketOutcome.prices.toString(), priceLadderPk.toString());
  });

  it("Success", async () => {
    // create a new market
    const market = await monaco.createMarket(
      ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
      [1.001, 1.01, 1.1],
    );

    // check the state of the newly created account
    const account = await monaco.fetchMarket(market.pk);
    assert.deepEqual(account.title, "SOME TITLE");
    assert.deepEqual(account.marketOutcomesCount, 3);

    const marketOutcomeIndex = account.marketOutcomesCount;
    const [marketOutcomePk, _] = await PublicKey.findProgramAddress(
      [market.pk.toBuffer(), Buffer.from(marketOutcomeIndex.toString())],
      monaco.program.programId,
    );

    await monaco.program.methods
      .initializeMarketOutcome("EXTRA")
      .accounts({
        systemProgram: SystemProgram.programId,
        outcome: marketOutcomePk,
        priceLadder: null,
        market: market.pk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    // check the state of the newly created account
    const marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketOutcomesCount, 4);

    const marketOutcome = await monaco.fetchMarketOutcome(marketOutcomePk);
    assert.deepEqual(marketOutcome.index, 3);
    assert.deepEqual(marketOutcome.title, "EXTRA");
    assert.deepEqual(marketOutcome.priceLadder, []);
  });

  it("Failure: using incorrect market account", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([1.001, 1.01, 1.1]);
    const marketOther = await monaco.create3WayMarket([1.001, 1.01, 1.1]);

    // check the state of the newly created account
    const account = await monaco.fetchMarket(market.pk);
    assert.deepEqual(account.title, "SOME TITLE");
    assert.deepEqual(account.marketOutcomesCount, 3);

    // TODO: use findMarketOutcomePda when changed to accept index
    const marketOutcomeIndex = account.marketOutcomesCount;
    const [marketOutcomePk, _] = await PublicKey.findProgramAddress(
      [market.pk.toBuffer(), Buffer.from(marketOutcomeIndex.toString())],
      monaco.program.programId,
    );
    // TODO: use findMarketOutcomePda when changed to accept index

    try {
      await monaco.program.methods
        .initializeMarketOutcome("EXTRA")
        .accounts({
          systemProgram: SystemProgram.programId,
          outcome: marketOutcomePk,
          priceLadder: null,
          market: marketOther.pk,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
          marketOperator: monaco.operatorPk,
        })
        .rpc();
      assert(false, "an exception should have been thrown");
    } catch (e) {
      expect(e.message).toMatch(
        /^AnchorError caused by account: outcome. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated./,
      );
    }

    // check the state of the newly created account
    const marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketOutcomesCount, 3);

    try {
      await monaco.fetchMarketOutcome(marketOutcomePk);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        "Account does not exist or has no data " + marketOutcomePk,
      );
    }
  });

  it("Failure: title too long", async () => {
    // create a new market
    const market = await monaco.createMarket([], [1.001, 1.01, 1.1]);
    assert.deepEqual(
      (await monaco.fetchMarket(market.pk)).marketOutcomesCount,
      0,
    );

    const marketOutcomeTitle = "0123456789".repeat(10); // 100 characters long

    const marketOutcome0Pk = (
      await findMarketOutcomePda(monaco.program, market.pk, 0)
    ).data.pda;
    await monaco.program.methods
      .initializeMarketOutcome(marketOutcomeTitle)
      .accounts({
        market: market.pk,
        outcome: marketOutcome0Pk,
        priceLadder: null,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        assert.fail("This test should have NOT thrown an error");
      });
    assert.deepEqual(
      (await monaco.fetchMarket(market.pk)).marketOutcomesCount,
      1,
    );

    const marketOutcome1Pk = (
      await findMarketOutcomePda(monaco.program, market.pk, 1)
    ).data.pda;
    await monaco.program.methods
      .initializeMarketOutcome(marketOutcomeTitle + "1") // 101 characters long
      .accounts({
        market: market.pk,
        outcome: marketOutcome1Pk,
        priceLadder: null,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .then(
        function (_) {
          assert.fail("This test should have thrown an error");
        },
        function (e: AnchorError) {
          assert.equal(e.error.errorCode.code, "MarketOutcomeTitleTooLong");
        },
      );
    assert.deepEqual(
      (await monaco.fetchMarket(market.pk)).marketOutcomesCount,
      1,
    );
  });

  it("PDA seed: market-pk incorrect", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([1.001, 1.01, 1.1]);
    const marketOther = await monaco.create3WayMarket([1.001, 1.01, 1.1]);

    // check the state of the newly created account
    const account = await monaco.fetchMarket(market.pk);
    assert.deepEqual(account.title, "SOME TITLE");
    assert.deepEqual(account.marketOutcomesCount, 3);

    // TODO: use findMarketOutcomePda when changed to accept index
    const marketOutcomeIndex = account.marketOutcomesCount;
    const [marketOutcomePk, _] = await PublicKey.findProgramAddress(
      [marketOther.pk.toBuffer(), Buffer.from(marketOutcomeIndex.toString())],
      monaco.program.programId,
    );
    // TODO: use findMarketOutcomePda when changed to accept index

    try {
      await monaco.program.methods
        .initializeMarketOutcome("EXTRA")
        .accounts({
          systemProgram: SystemProgram.programId,
          outcome: marketOutcomePk,
          priceLadder: null,
          market: market.pk,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
          marketOperator: monaco.operatorPk,
        })
        .rpc();
      assert(false, "an exception should have been thrown");
    } catch (e) {
      expect(e.message).toMatch(
        /^AnchorError caused by account: outcome. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated./,
      );
    }

    // check the state of the newly created account
    const marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketOutcomesCount, 3);

    try {
      await monaco.fetchMarketOutcome(marketOutcomePk);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        "Account does not exist or has no data " + marketOutcomePk,
      );
    }
  });

  it("PDA seed: index incorrect", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([1.001, 1.01, 1.1]);

    // check the state of the newly created account
    const account = await monaco.fetchMarket(market.pk);
    assert.deepEqual(account.title, "SOME TITLE");
    assert.deepEqual(account.marketOutcomesCount, 3);

    // TODO: use findMarketOutcomePda when changed to accept index
    const marketOutcomeIndex = account.marketOutcomesCount + 1;
    const [marketOutcomePk, _] = await PublicKey.findProgramAddress(
      [market.pk.toBuffer(), Buffer.from(marketOutcomeIndex.toString())],
      monaco.program.programId,
    );
    // TODO: use findMarketOutcomePda when changed to accept index

    try {
      await monaco.program.methods
        .initializeMarketOutcome("EXTRA")
        .accounts({
          systemProgram: SystemProgram.programId,
          outcome: marketOutcomePk,
          priceLadder: null,
          market: market.pk,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
          marketOperator: monaco.operatorPk,
        })
        .rpc();
      assert(false, "an exception should have been thrown");
    } catch (e) {
      expect(e.message).toMatch(
        /^AnchorError caused by account: outcome. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated./,
      );
    }

    // check the state of the newly created account
    const marketAccount = await monaco.fetchMarket(market.pk);
    assert.deepEqual(marketAccount.marketOutcomesCount, 3);

    try {
      await monaco.fetchMarketOutcome(marketOutcomePk);
      assert.fail("Account should not exist");
    } catch (e) {
      assert.equal(
        e.message,
        "Account does not exist or has no data " + marketOutcomePk,
      );
    }
  });
});
