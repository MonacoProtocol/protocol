import { PublicKey, SystemProgram } from "@solana/web3.js";
import assert from "assert";
import { monaco } from "../util/wrappers";

describe("Market: creation", () => {
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
      .initializeMarketOutcome("EXTRA", [1.001, 1.01, 1.1, 1.2])
      .accounts({
        systemProgram: SystemProgram.programId,
        outcome: marketOutcomePk,
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
    assert.deepEqual(marketOutcome.priceLadder, [1.001, 1.01, 1.1, 1.2]);
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
        .initializeMarketOutcome("EXTRA", [1.001, 1.01, 1.1, 1.2])
        .accounts({
          systemProgram: SystemProgram.programId,
          outcome: marketOutcomePk,
          market: marketOther.pk,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
          marketOperator: monaco.operatorPk,
        })
        .rpc();
      assert(false, "an exception should have been thrown");
    } catch (e) {
      console.error(e);
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
        .initializeMarketOutcome("EXTRA", [1.001, 1.01, 1.1, 1.2])
        .accounts({
          systemProgram: SystemProgram.programId,
          outcome: marketOutcomePk,
          market: market.pk,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
          marketOperator: monaco.operatorPk,
        })
        .rpc();
      assert(false, "an exception should have been thrown");
    } catch (e) {
      console.error(e);
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
        .initializeMarketOutcome("EXTRA", [1.001, 1.01, 1.1, 1.2])
        .accounts({
          systemProgram: SystemProgram.programId,
          outcome: marketOutcomePk,
          market: market.pk,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
          marketOperator: monaco.operatorPk,
        })
        .rpc();
      assert(false, "an exception should have been thrown");
    } catch (e) {
      console.error(e);
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
