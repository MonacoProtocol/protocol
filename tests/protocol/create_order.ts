import * as anchor from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import {
  authoriseOperator,
  createAssociatedTokenAccountWithBalance,
  createAuthorisedOperatorsPda,
  createOrder,
  createMarket,
  createNewMint,
  createWalletWithBalance,
  OperatorType,
} from "../util/test_util";
import assert from "assert";
import { AnchorError, Program, BN } from "@project-serum/anchor";
import { MonacoProtocol } from "../../target/types/monaco_protocol";
import { SystemProgram } from "@solana/web3.js";
import { createOrder as createOrderNpm } from "../../npm-client/src/create_order";
import {
  findOrderPda,
  findMarketMatchingPoolPda,
  getMarketAccounts,
} from "../../npm-client/src";
import { TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";
import { monaco } from "../util/wrappers";

describe("Protocol - Create Order", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const testCaseData = [
    { forOutcome: true, stake: 10, outcomesNumber: 3 },
    { forOutcome: false, stake: 10, outcomesNumber: 3 },
    { forOutcome: true, stake: 10, outcomesNumber: 32 },
    { forOutcome: false, stake: 10, outcomesNumber: 32 },
  ];

  it.each(testCaseData)("Create Order: %p", async (testData) => {
    // Order parameters
    const outcomeIndex = 1;
    const price = 6.0;
    const outcomes = Array(testData.outcomesNumber)
      .fill("OUTCOME_")
      .map((e, i) => e + i); // OUTCOME_0, OUTCOME_1, ...

    // Create market, purchaser
    const [purchaser, market] = await Promise.all([
      createWalletWithBalance(monaco.provider),
      monaco.createMarket(outcomes, [price]),
    ]);
    await market.open();
    await market.airdrop(purchaser, 100.0);

    const orderPk = testData.forOutcome
      ? await market.forOrder(outcomeIndex, testData.stake, price, purchaser)
      : await market.againstOrder(
          outcomeIndex,
          testData.stake,
          price,
          purchaser,
        );

    // check order
    const orderAccount = await monaco.fetchOrder(orderPk);
    assert.deepEqual(orderAccount.market, market.pk);
    assert.equal(orderAccount.marketOutcomeIndex, outcomeIndex);
    assert.equal(orderAccount.forOutcome, testData.forOutcome);
    assert.deepEqual(orderAccount.purchaser, purchaser.publicKey);
    assert.deepEqual(orderAccount.orderStatus, { open: {} });
    assert.equal(
      orderAccount.stake.toNumber(),
      market.toAmountInteger(testData.stake),
    );
    assert.equal(orderAccount.payout, 0);
    assert.equal(orderAccount.expectedPrice, price);
    assert.equal(
      orderAccount.stakeUnmatched.toNumber(),
      market.toAmountInteger(testData.stake),
    );

    // check market position
    const marketPositionAccount = await monaco.fetchMarketPosition(
      await market.cacheMarketPositionPk(purchaser.publicKey),
    );
    assert.deepEqual(marketPositionAccount.purchaser, purchaser.publicKey);
    assert.deepEqual(marketPositionAccount.market, market.pk);
    assert.equal(
      marketPositionAccount.marketOutcomeSums.length,
      market.matchingPools.length,
    );
    assert.deepEqual(
      marketPositionAccount.marketOutcomeSums.map((n) => n.toNumber()),
      Array(testData.outcomesNumber).fill(0),
    );

    // check market matching pool
    const marketMatchingPool = await monaco.fetchMarketMatchingPool(
      testData.forOutcome
        ? market.matchingPools[outcomeIndex][price].forOutcome
        : market.matchingPools[outcomeIndex][price].against,
    );
    assert.equal(
      marketMatchingPool.liquidityAmount.toNumber(),
      market.toAmountInteger(testData.stake),
    );
    assert.equal(marketMatchingPool.matchedAmount.toNumber(), 0);
    assert.equal(
      marketMatchingPool.orders.items[0].toBase58(),
      orderPk.toBase58(),
    );

    // assert token balances have been updated
    const risk = testData.forOutcome
      ? testData.stake
      : testData.stake * price - testData.stake;
    assert.deepEqual(
      await Promise.all([
        market.getTokenBalance(purchaser),
        market.getEscrowBalance(),
      ]),
      [100 - risk, risk],
    );
  });

  it("is successful when stake precision is just right", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;

    // Order parameters
    const stake = 0.123456;
    const outcomeIndex = 0;
    const price = 2.0;
    const forOutcome = true;

    // Set up Market and related accounts
    const { mintPk, marketPda } = await createMarket(
      protocolProgram,
      provider,
      [price],
      null,
      null,
      ["A", "B", "C"],
      9,
      6,
    );

    await createAssociatedTokenAccountWithBalance(
      mintPk,
      provider.wallet.publicKey,
      10000,
    );
    const stakeInteger = new BN(
      stake * 10 ** (await getMint(provider.connection, mintPk)).decimals,
    );
    const orderResponse = await createOrderNpm(
      protocolProgram as Program<anchor.Idl>,
      marketPda,
      outcomeIndex,
      forOutcome,
      price,
      stakeInteger,
    );

    const orderPk = orderResponse.data.orderPk;

    // check the state of the newly created account
    const orderAccount = await protocolProgram.account.order.fetch(orderPk);
    assert.equal(orderAccount.stake.toNumber(), stakeInteger.toNumber());
  });

  it("is blocked when stake precision is too high", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;

    // Order parameters
    const stake = 0.1234567;
    const outcomeIndex = 0;
    const price = 2.0;
    const forOutcome = true;

    // Set up Market and related accounts
    const { mintPk, marketPda } = await createMarket(
      protocolProgram,
      provider,
      [price],
      null,
      null,
      ["A", "B", "C"],
      9,
      6,
    );

    await createAssociatedTokenAccountWithBalance(
      mintPk,
      provider.wallet.publicKey,
      10000,
    );
    const stakeInteger = new BN(
      stake * 10 ** (await getMint(provider.connection, mintPk)).decimals,
    );

    const orderResponse = await createOrderNpm(
      protocolProgram as Program<anchor.Idl>,
      marketPda,
      outcomeIndex,
      forOutcome,
      price,
      stakeInteger,
    );

    const thrownError = orderResponse.errors[0] as AnchorError;
    assert.equal(orderResponse.success, false);
    assert.equal(
      thrownError.error.errorCode.code,
      "CreationStakePrecisionIsTooHigh",
    );
  });

  it("Throws appropriate error when outcome index is out of bounds", async () => {
    const protocolProgram = anchor.workspace.MonacoProtocol;

    // Order parameters
    const price = 3.0;
    const index = 0;
    const outOfBoundsIndex = 10;

    // Set up Market and related accounts
    const { marketPda, matchingPools, mintPk } = await createMarket(
      protocolProgram,
      provider,
      [price],
    );
    const MarketAccounts = await getMarketAccounts(
      protocolProgram,
      marketPda,
      true,
      index,
      price,
    );

    const marketMatchingPools = matchingPools[0][price];
    const marketMatchingPool = marketMatchingPools.forOutcome;

    const purchaserTokenAccount = await createAssociatedTokenAccountWithBalance(
      mintPk,
      provider.wallet.publicKey,
      100,
    );

    const stake = new BN(
      10 ** (await getMint(provider.connection, mintPk)).decimals,
    );

    const orderPdaResponse = await findOrderPda(
      protocolProgram,
      marketPda,
      provider.wallet.publicKey,
    );
    const orderPk = orderPdaResponse.data.orderPk;
    const distinctSeed = orderPdaResponse.data.distinctSeed;

    await protocolProgram.methods
      .createOrder(distinctSeed, {
        marketOutcomeIndex: outOfBoundsIndex,
        forOutcome: true,
        stake: stake,
        price: price,
      })
      .accounts({
        purchaser: provider.wallet.publicKey,
        order: orderPk,
        marketPosition: MarketAccounts.data.marketPositionPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        market: marketPda,
        marketMatchingPool: marketMatchingPool,
        marketOutcome: MarketAccounts.data.marketOutcomePda,
        purchaserToken: purchaserTokenAccount,
        marketEscrow: MarketAccounts.data.escrowPda,
      })
      .rpc({ commitment: "confirmed" })
      .catch((e) => {
        assert.equal(e.error.errorCode.code, "ConstraintSeeds");
      });
  });

  it("is blocked when market has winning outcome set", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;

    // Order parameters
    const outcomeIndex = 1;
    const price = 6.0;
    const forOutcome = true;
    const stake = 2000;

    // Set up Market and related accounts
    const { mintPk, marketPda, authorisedMarketOperators, marketOperator } =
      await createMarket(protocolProgram, provider, [price]);

    await createAssociatedTokenAccountWithBalance(
      mintPk,
      provider.wallet.publicKey,
      10000,
    );

    // set an outcome on this market
    await protocolProgram.methods
      .settleMarket(outcomeIndex)
      .accounts({
        market: marketPda,
        authorisedOperators: authorisedMarketOperators,
        marketOperator: marketOperator.publicKey,
      })
      .signers([marketOperator])
      .rpc();

    const account = await protocolProgram.account.market.fetch(marketPda);
    assert.equal(account.marketWinningOutcomeIndex, 1);

    const stakeInteger = new BN(
      stake * 10 ** (await getMint(provider.connection, mintPk)).decimals,
    );

    const orderResponse = await createOrderNpm(
      protocolProgram as Program<anchor.Idl>,
      marketPda,
      outcomeIndex,
      forOutcome,
      price,
      stakeInteger,
    );

    const thrownError = orderResponse.errors[0] as AnchorError;
    assert.equal(orderResponse.success, false);
    assert.equal(thrownError.error.errorCode.code, "CreationMarketNotOpen");
  });

  it("is blocked when market suspended", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;

    // Order parameters
    const outcomeIndex = 1;
    const price = 6.0;
    const forOutcome = true;
    const stake = 2000;

    // Set up Market and related accounts
    const { mintPk, marketPda, authorisedMarketOperators, marketOperator } =
      await createMarket(protocolProgram, provider, [price]);

    await createAssociatedTokenAccountWithBalance(
      mintPk,
      provider.wallet.publicKey,
      10000,
    );

    // set an outcome on this market
    await protocolProgram.methods
      .suspendMarket()
      .accounts({
        market: marketPda,
        authorisedOperators: authorisedMarketOperators,
        marketOperator: marketOperator.publicKey,
      })
      .signers([marketOperator])
      .rpc();
    const account = await protocolProgram.account.market.fetch(marketPda);
    assert.equal(account.suspended, true);

    const stakeInteger = new BN(
      stake * 10 ** (await getMint(provider.connection, mintPk)).decimals,
    );

    const orderResponse = await createOrderNpm(
      protocolProgram as Program<anchor.Idl>,
      marketPda,
      outcomeIndex,
      forOutcome,
      price,
      stakeInteger,
    );

    const thrownError = orderResponse.errors[0] as AnchorError;
    assert.equal(orderResponse.success, false);
    assert.equal(thrownError.error.errorCode.code, "CreationMarketSuspended");
  });

  it("create order where order initializes matching pool", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;

    // Order parameters
    const outcomeIndex = 1;
    const price = 6.0;
    const forOutcome = true;
    const stake = 2000;

    const operator = anchor.web3.Keypair.generate();
    const authorisedOperators = await authoriseOperator(
      operator,
      protocolProgram,
      provider,
      OperatorType.MARKET,
    );

    const { mintPk, marketPda, outcomePdas } = await createMarket(
      protocolProgram,
      provider,
      [price],
      operator,
      authorisedOperators,
      ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
      3,
      0,
      false,
    );

    const matchingPoolPda = await findMarketMatchingPoolPda(
      protocolProgram as Program,
      marketPda,
      outcomeIndex,
      price,
      forOutcome,
    );

    try {
      await protocolProgram.account.marketMatchingPool.fetch(
        matchingPoolPda.data.pda,
      );
    } catch (e) {
      assert.equal(
        e,
        "Error: Account does not exist " + matchingPoolPda.data.pda,
      );
    }

    await createAssociatedTokenAccountWithBalance(
      mintPk,
      provider.wallet.publicKey,
      10000,
    );
    const stakeInteger = new BN(
      stake * 10 ** (await getMint(provider.connection, mintPk)).decimals,
    );
    const orderResponse = await createOrderNpm(
      protocolProgram as Program<anchor.Idl>,
      marketPda,
      outcomeIndex,
      forOutcome,
      price,
      stakeInteger,
    );

    const orderPk = orderResponse.data.orderPk;

    const matchingPool = await protocolProgram.account.marketMatchingPool.fetch(
      matchingPoolPda.data.pda,
    );
    assert.equal(matchingPool.orders.items[0].toBase58(), orderPk);
    assert.equal(
      matchingPool.liquidityAmount.toNumber(),
      stakeInteger.toNumber(),
    );
    assert.equal(matchingPool.matchedAmount.toNumber(), 0);
    assert.equal(
      matchingPool.purchaser.toBase58(),
      provider.wallet.publicKey.toBase58(),
    );

    const marketOutcome = await protocolProgram.account.marketOutcome.fetch(
      outcomePdas[outcomeIndex],
    );
    assert.equal(marketOutcome.priceLadder[0], price);
  });

  it("cannot create orders at invalid price", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;

    // Order parameters
    const outcomeIndex = 1;
    const forOutcome = true;
    const stake = 2000;

    const marketPrice = 6.0;
    const orderPrice = 6.1;

    // Set up Market and related accounts
    const { mintPk, marketPda } = await createMarket(
      protocolProgram,
      provider,
      [marketPrice],
    );

    await createAssociatedTokenAccountWithBalance(
      mintPk,
      provider.wallet.publicKey,
      10000,
    );

    const stakeInteger = new BN(
      stake * 10 ** (await getMint(provider.connection, mintPk)).decimals,
    );

    const orderResponse = await createOrderNpm(
      protocolProgram as Program<anchor.Idl>,
      marketPda,
      outcomeIndex,
      forOutcome,
      orderPrice,
      stakeInteger,
    );

    const thrownError = orderResponse.errors[0] as AnchorError;
    assert.equal(orderResponse.success, false);
    assert.equal(thrownError.error.errorCode.code, "CreationInvalidPrice");
  });

  it("purchaser uses different token account for the same mint", async () => {
    // token program does not allow more than one account per mint for a given wallet
  });

  it("purchaser uses different token account for a different mint", async () => {
    const program = anchor.workspace.MonacoProtocol as Program<MonacoProtocol>;

    // Order parameters
    const stake = 1.1;
    const outcomeIndex = 0;
    const price = 2.3;

    // Setup
    const market = await createMarket(program, provider, [price]);

    const purchaser = await createWalletWithBalance(provider, 100000000);
    const mintOther = await createNewMint(
      provider,
      provider.wallet as NodeWallet,
      6,
    );
    const purchaserInvalidToken = await createAssociatedTokenAccountWithBalance(
      mintOther,
      purchaser.publicKey,
      0,
    );

    await createOrder(
      market.marketPda,
      purchaser,
      outcomeIndex,
      true,
      price,
      stake,
      purchaserInvalidToken,
    ).then(
      function (_) {
        assert.fail("This test should have thrown an error");
      },
      function (err: AnchorError) {
        assert.equal(err.error.errorCode.code, "ConstraintAssociated");
      },
    );
  });

  it("purchaser uses different token account for a different mint which is passed in as well", async () => {
    const program = anchor.workspace.MonacoProtocol as Program<MonacoProtocol>;

    // Order parameters
    const stake = 1.1;
    const outcomeIndex = 0;
    const price = 2.3;

    // Setup
    const market = await createMarket(program, provider, [price]);

    const purchaser = await createWalletWithBalance(provider, 100000000);
    const mintOther = await createNewMint(
      provider,
      provider.wallet as NodeWallet,
      6,
    );
    const purchaserInvalidToken = await createAssociatedTokenAccountWithBalance(
      mintOther,
      purchaser.publicKey,
      1000,
    );

    await createOrder(
      market.marketPda,
      purchaser,
      outcomeIndex,
      true,
      price,
      stake,
      purchaserInvalidToken,
    ).then(
      function (_) {
        assert.fail("This test should have thrown an error");
      },
      function (err: AnchorError) {
        assert.equal(err.error.errorCode.code, "ConstraintAssociated");
      },
    );
  });

  it("purchaser uses different person's token account for the same mint", async () => {
    const program = anchor.workspace.MonacoProtocol as Program<MonacoProtocol>;

    // Order parameters
    const stake = 1.1;
    const outcomeIndex = 0;
    const price = 2.3;

    // Setup
    const market = await createMarket(program, provider, [price]);
    const purchaser = await createWalletWithBalance(provider, 100000000);

    const purchaserOther = await createWalletWithBalance(provider, 100000000);
    const purchaserOtherToken = await createAssociatedTokenAccountWithBalance(
      market.mintPk,
      purchaserOther.publicKey,
      10.0,
    );

    await createOrder(
      market.marketPda,
      purchaser,
      outcomeIndex,
      true,
      price,
      stake,
      purchaserOtherToken,
    ).then(
      function (_) {
        assert.fail("This test should have thrown an error");
      },
      function (err: AnchorError) {
        assert.equal(err.error.errorCode.code, "ConstraintTokenOwner");
      },
    );
  });

  it("purchaser uses different person's token account for a different mint", async () => {
    const program = anchor.workspace.MonacoProtocol as Program<MonacoProtocol>;

    // Order parameters
    const stake = 1.1;
    const outcomeIndex = 0;
    const price = 2.3;

    // Setup
    const market = await createMarket(program, provider, [price]);
    const purchaser = await createWalletWithBalance(provider, 100000000);

    const mintOther = await createNewMint(
      provider,
      provider.wallet as NodeWallet,
      6,
    );
    const purchaserOther = await createWalletWithBalance(provider, 100000000);
    const purchaserOtherToken = await createAssociatedTokenAccountWithBalance(
      mintOther,
      purchaserOther.publicKey,
      10.0,
    );

    await createOrder(
      market.marketPda,
      purchaser,
      outcomeIndex,
      true,
      price,
      stake,
      purchaserOtherToken,
    ).then(
      function (_) {
        assert.fail("This test should have thrown an error");
      },
      function (err: AnchorError) {
        assert.equal(err.error.errorCode.code, "ConstraintTokenOwner");
      },
    );
  });

  it("purchaser uses different person's token account for a different mint which is passed in as well", async () => {
    const program = anchor.workspace.MonacoProtocol as Program<MonacoProtocol>;

    // Order parameters
    const stake = 1.1;
    const outcomeIndex = 0;
    const price = 2.3;

    // Setup
    const market = await createMarket(program, provider, [price]);

    const purchaser = await createWalletWithBalance(provider, 100000000);

    const mintOther = await createNewMint(
      provider,
      provider.wallet as NodeWallet,
      6,
    );
    const purchaserOther = await createWalletWithBalance(provider, 100000000);
    const purchaserOtherToken = await createAssociatedTokenAccountWithBalance(
      mintOther,
      purchaserOther.publicKey,
      10.0,
    );

    await createOrder(
      market.marketPda,
      purchaser,
      outcomeIndex,
      true,
      price,
      stake,
      purchaserOtherToken,
    ).then(
      function (_) {
        assert.fail("This test should have thrown an error");
      },
      function (err: AnchorError) {
        assert.equal(err.error.errorCode.code, "ConstraintTokenOwner");
      },
    );
  });

  it("dequeue order", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;

    // Order parameters
    const stake = 1000;
    const outcomeIndex = 0;
    const price = 2.0;
    const forOutcome = true;

    // Set up Market and related accounts
    const { mintPk, marketPda, matchingPools } = await createMarket(
      protocolProgram,
      provider,
      [price],
      null,
      null,
      ["A", "B", "C"],
    );

    await createAssociatedTokenAccountWithBalance(
      mintPk,
      provider.wallet.publicKey,
      10000,
    );

    const orderResponse = await createOrderNpm(
      protocolProgram as Program<anchor.Idl>,
      marketPda,
      outcomeIndex,
      forOutcome,
      price,
      new BN(stake),
    );

    const marketMatchingPools = matchingPools[outcomeIndex][price];
    const matchingPoolPk = forOutcome
      ? marketMatchingPools.forOutcome
      : marketMatchingPools.against;

    let matchingPool = await protocolProgram.account.marketMatchingPool.fetch(
      matchingPoolPk,
    );
    assert.equal(matchingPool.orders.len, 1);

    await protocolProgram.methods
      .dequeueOrder(orderResponse.data.orderPk)
      .accounts({
        matchingPool: matchingPoolPk,
        authorisedOperators: await createAuthorisedOperatorsPda(
          OperatorType.CRANK,
        ),
        crankOperator: provider.wallet.publicKey,
      })
      .rpc();

    matchingPool = await protocolProgram.account.marketMatchingPool.fetch(
      matchingPoolPk,
    );
    assert.equal(matchingPool.orders.len, 0);
  });
});
