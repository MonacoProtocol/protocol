import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
  authoriseOperator,
  createAssociatedTokenAccountWithBalance,
  createAuthorisedOperatorsPda,
  createMarket,
  createOrder,
  OperatorType,
} from "../util/test_util";
import assert from "assert";
import { MonacoProtocol } from "../../target/types/monaco_protocol";

describe("Calling close_account", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  it("closing matching pool: success", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;
    const price = 1.23;
    const {
      matchingPools,
      marketOperator,
      authorisedMarketOperators,
      marketPda,
      outcomePdas,
      mintPk,
    } = await createMarket(protocolProgram, provider, [price]);

    const purchaserTokenAccount = await createAssociatedTokenAccountWithBalance(
      mintPk,
      provider.wallet.publicKey,
      2,
    );
    await createOrder(
      marketPda,
      provider.wallet,
      0,
      true,
      price,
      1,
      purchaserTokenAccount,
    );
    await createOrder(
      marketPda,
      provider.wallet,
      0,
      false,
      price,
      1,
      purchaserTokenAccount,
    );

    await protocolProgram.methods
      .settleMarket(0)
      .accounts({
        market: marketPda,
        authorisedOperators: authorisedMarketOperators,
        marketOperator: marketOperator.publicKey,
      })
      .signers([marketOperator])
      .rpc();

    await protocolProgram.methods
      .completeMarketSettlement()
      .accounts({
        market: marketPda,
        authorisedOperators: await createAuthorisedOperatorsPda(
          OperatorType.CRANK,
        ),
        crankOperator: provider.wallet.publicKey,
      })
      .rpc();

    const crankOperator = anchor.web3.Keypair.generate();
    const authorisedCrankOperators = await authoriseOperator(
      crankOperator,
      protocolProgram,
      provider,
      OperatorType.CRANK,
    );

    const marketMatchingPools = matchingPools[0][price];
    const outcomePda = outcomePdas[0];

    await protocolProgram.methods
      .closeMarketMatchingPool(price, true)
      .accounts({
        market: marketPda,
        marketOutcome: outcomePda,
        marketMatchingPool: marketMatchingPools.forOutcome,
        purchaser: marketOperator.publicKey,
        crankOperator: crankOperator.publicKey,
        authorisedOperators: authorisedCrankOperators,
      })
      .signers([crankOperator])
      .rpc();

    await protocolProgram.methods
      .closeMarketMatchingPool(price, false)
      .accounts({
        market: marketPda,
        marketOutcome: outcomePda,
        marketMatchingPool: marketMatchingPools.against,
        purchaser: marketOperator.publicKey,
        crankOperator: crankOperator.publicKey,
        authorisedOperators: authorisedCrankOperators,
      })
      .signers([crankOperator])
      .rpc();

    try {
      await protocolProgram.account.order.fetch(marketMatchingPools.forOutcome);
    } catch (e) {
      assert.equal(
        e,
        "Error: Account does not exist " + marketMatchingPools.forOutcome,
      );
    }

    try {
      await protocolProgram.account.order.fetch(marketMatchingPools.against);
    } catch (e) {
      assert.equal(
        e,
        "Error: Account does not exist " + marketMatchingPools.against,
      );
    }
  });

  it("closing matching pool: market not settled", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;
    const price = 1.23;
    const outcomeIndex = 0;
    const market = await createMarket(protocolProgram, provider, [price]);

    const purchaserTokenAccount = await createAssociatedTokenAccountWithBalance(
      market.mintPk,
      provider.wallet.publicKey,
      1,
    );
    await createOrder(
      market.marketPda,
      provider.wallet,
      outcomeIndex,
      true,
      price,
      1,
      purchaserTokenAccount,
    );

    await protocolProgram.methods
      .settleMarket(0)
      .accounts({
        market: market.marketPda,
        marketOperator: market.marketOperator.publicKey,
        authorisedOperators: market.authorisedMarketOperators,
      })
      .signers([market.marketOperator])
      .rpc();

    const crankOperator = anchor.web3.Keypair.generate();
    const authorisedCrankOperators = await authoriseOperator(
      crankOperator,
      protocolProgram,
      provider,
      OperatorType.CRANK,
    );

    const marketMatchingPools = market.matchingPools[outcomeIndex][price];

    try {
      await protocolProgram.methods
        .closeMarketMatchingPool(price, true)
        .accounts({
          market: market.marketPda,
          marketOutcome: market.outcomePdas[outcomeIndex],
          marketMatchingPool: marketMatchingPools.forOutcome,
          purchaser: provider.wallet.publicKey,
          crankOperator: crankOperator.publicKey,
          authorisedOperators: authorisedCrankOperators,
        })
        .signers([crankOperator])
        .rpc();
    } catch (e) {
      assert.equal(e.error.errorMessage, "Core Settlement: market not settled");
    }

    // check that the accounts were not closed
    const marketMatchingPoolsFor =
      await protocolProgram.account.marketMatchingPool.fetch(
        marketMatchingPools.forOutcome,
      );
    assert.deepEqual(
      marketMatchingPoolsFor.purchaser,
      market.marketOperator.publicKey,
    );
  });

  it("closing matching pool: wrong market, right market-outcome", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;
    const price = 1.23;
    const outcomeIndex = 0;
    const market1 = await createMarket(protocolProgram, provider, [price]);
    const market2 = await createMarket(protocolProgram, provider, [price]);

    const purchaserTokenAccount = await createAssociatedTokenAccountWithBalance(
      market2.mintPk,
      provider.wallet.publicKey,
      1,
    );
    await createOrder(
      market2.marketPda,
      provider.wallet,
      outcomeIndex,
      true,
      price,
      1,
      purchaserTokenAccount,
    );

    await protocolProgram.methods
      .settleMarket(0)
      .accounts({
        market: market1.marketPda,
        marketOperator: market1.marketOperator.publicKey,
        authorisedOperators: market1.authorisedMarketOperators,
      })
      .signers([market1.marketOperator])
      .rpc();

    await protocolProgram.methods
      .completeMarketSettlement()
      .accounts({
        market: market1.marketPda,
        crankOperator: provider.wallet.publicKey,
        authorisedOperators: await createAuthorisedOperatorsPda(
          OperatorType.CRANK,
        ),
      })
      .rpc();

    const crankOperator = anchor.web3.Keypair.generate();
    const authorisedCrankOperators = await authoriseOperator(
      crankOperator,
      protocolProgram,
      provider,
      OperatorType.CRANK,
    );

    const market2OutcomeMatchingPools =
      market2.matchingPools[outcomeIndex][price];

    try {
      await protocolProgram.methods
        .closeMarketMatchingPool(price, true)
        .accounts({
          market: market1.marketPda,
          marketOutcome: market2.outcomePdas[outcomeIndex],
          marketMatchingPool: market2OutcomeMatchingPools.forOutcome,
          purchaser: provider.wallet.publicKey,
          crankOperator: crankOperator.publicKey,
          authorisedOperators: authorisedCrankOperators,
        })
        .signers([crankOperator])
        .rpc();
    } catch (e) {
      assert.equal(e.error.errorMessage, "A has one constraint was violated");
    }

    // check that the accounts were not closed
    const market2OutcomeMatchingPoolsFor =
      await protocolProgram.account.marketMatchingPool.fetch(
        market2OutcomeMatchingPools.forOutcome,
      );
    assert.deepEqual(
      market2OutcomeMatchingPoolsFor.purchaser,
      market2.marketOperator.publicKey,
    );
  });

  it("closing matching pool: right market, wrong market-outcome", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;
    const price = 1.23;
    const outcomeIndex = 0;
    const market1 = await createMarket(protocolProgram, provider, [price]);
    const market2 = await createMarket(protocolProgram, provider, [price]);

    const purchaserTokenAccount = await createAssociatedTokenAccountWithBalance(
      market2.mintPk,
      provider.wallet.publicKey,
      1,
    );
    await createOrder(
      market2.marketPda,
      provider.wallet,
      outcomeIndex,
      true,
      price,
      1,
      purchaserTokenAccount,
    );

    await protocolProgram.methods
      .settleMarket(0)
      .accounts({
        market: market1.marketPda,
        marketOperator: market1.marketOperator.publicKey,
        authorisedOperators: market1.authorisedMarketOperators,
      })
      .signers([market1.marketOperator])
      .rpc();

    await protocolProgram.methods
      .completeMarketSettlement()
      .accounts({
        market: market1.marketPda,
        crankOperator: provider.wallet.publicKey,
        authorisedOperators: await createAuthorisedOperatorsPda(
          OperatorType.CRANK,
        ),
      })
      .rpc();

    const crankOperator = anchor.web3.Keypair.generate();
    const authorisedCrankOperators = await authoriseOperator(
      crankOperator,
      protocolProgram,
      provider,
      OperatorType.CRANK,
    );

    const market2OutcomeMatchingPools =
      market2.matchingPools[outcomeIndex][price];

    try {
      await protocolProgram.methods
        .closeMarketMatchingPool(price, true)
        .accounts({
          market: market2.marketPda,
          marketOutcome: market1.outcomePdas[outcomeIndex],
          marketMatchingPool: market2OutcomeMatchingPools.forOutcome,
          purchaser: provider.wallet.publicKey,
          crankOperator: crankOperator.publicKey,
          authorisedOperators: authorisedCrankOperators,
        })
        .signers([crankOperator])
        .rpc();
    } catch (e) {
      assert.equal(e.error.errorMessage, "A has one constraint was violated");
    }

    // check that the accounts were not closed
    const market2OutcomeMatchingPoolsFor =
      await protocolProgram.account.marketMatchingPool.fetch(
        market2OutcomeMatchingPools.forOutcome,
      );
    assert.deepEqual(
      market2OutcomeMatchingPoolsFor.purchaser,
      market2.marketOperator.publicKey,
    );
  });

  it("closing matching pool: wrong market, wrong market-outcome", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;
    const price = 1.23;
    const outcomeIndex = 0;
    const market1 = await createMarket(protocolProgram, provider, [price]);
    const market2 = await createMarket(protocolProgram, provider, [price]);

    const purchaserTokenAccount = await createAssociatedTokenAccountWithBalance(
      market2.mintPk,
      provider.wallet.publicKey,
      1,
    );
    await createOrder(
      market2.marketPda,
      provider.wallet,
      outcomeIndex,
      true,
      price,
      1,
      purchaserTokenAccount,
    );

    await protocolProgram.methods
      .settleMarket(0)
      .accounts({
        market: market1.marketPda,
        marketOperator: market1.marketOperator.publicKey,
        authorisedOperators: market1.authorisedMarketOperators,
      })
      .signers([market1.marketOperator])
      .rpc();

    await protocolProgram.methods
      .completeMarketSettlement()
      .accounts({
        market: market1.marketPda,
        crankOperator: provider.wallet.publicKey,
        authorisedOperators: await createAuthorisedOperatorsPda(
          OperatorType.CRANK,
        ),
      })
      .rpc();

    const crankOperator = anchor.web3.Keypair.generate();
    const authorisedCrankOperators = await authoriseOperator(
      crankOperator,
      protocolProgram,
      provider,
      OperatorType.CRANK,
    );

    const market2OutcomeMatchingPools =
      market2.matchingPools[outcomeIndex][price];

    try {
      await protocolProgram.methods
        .closeMarketMatchingPool(price, true)
        .accounts({
          market: market1.marketPda,
          marketOutcome: market1.outcomePdas[outcomeIndex],
          marketMatchingPool: market2OutcomeMatchingPools.forOutcome,
          purchaser: provider.wallet.publicKey,
          crankOperator: crankOperator.publicKey,
          authorisedOperators: authorisedCrankOperators,
        })
        .signers([crankOperator])
        .rpc();
    } catch (e) {
      assert.equal(e.error.errorMessage, "A seeds constraint was violated");
    }

    // check that the accounts were not closed
    const market2OutcomeMatchingPoolsFor =
      await protocolProgram.account.marketMatchingPool.fetch(
        market2OutcomeMatchingPools.forOutcome,
      );
    assert.deepEqual(
      market2OutcomeMatchingPoolsFor.purchaser,
      market2.marketOperator.publicKey,
    );
  });

  it("closing matching pool: incorrect refund address", async () => {
    const protocolProgram = anchor.workspace
      .MonacoProtocol as Program<MonacoProtocol>;
    const price = 1.23;
    const outcomeIndex = 0;
    const {
      matchingPools,
      marketOperator,
      authorisedMarketOperators,
      marketPda,
      outcomePdas,
      mintPk,
    } = await createMarket(protocolProgram, provider, [price]);

    const purchaserTokenAccount = await createAssociatedTokenAccountWithBalance(
      mintPk,
      provider.wallet.publicKey,
      1,
    );
    await createOrder(
      marketPda,
      provider.wallet,
      outcomeIndex,
      true,
      price,
      1,
      purchaserTokenAccount,
    );

    await protocolProgram.methods
      .settleMarket(0)
      .accounts({
        market: marketPda,
        marketOperator: marketOperator.publicKey,
        authorisedOperators: authorisedMarketOperators,
      })
      .signers([marketOperator])
      .rpc();

    const crankOperator = anchor.web3.Keypair.generate();
    const authorisedCrankOperators = await authoriseOperator(
      crankOperator,
      protocolProgram,
      provider,
      OperatorType.CRANK,
    );

    await protocolProgram.methods
      .completeMarketSettlement()
      .accounts({
        market: marketPda,
        crankOperator: provider.wallet.publicKey,
        authorisedOperators: await createAuthorisedOperatorsPda(
          OperatorType.CRANK,
        ),
      })
      .rpc();

    const marketMatchingPools = matchingPools[outcomeIndex][price];

    try {
      await protocolProgram.methods
        .closeMarketMatchingPool(price, true)
        .accounts({
          market: marketPda,
          marketOutcome: outcomePdas[outcomeIndex],
          marketMatchingPool: marketMatchingPools.forOutcome,
          purchaser: provider.wallet.publicKey,
          crankOperator: crankOperator.publicKey,
          authorisedOperators: authorisedCrankOperators,
        })
        .signers([crankOperator])
        .rpc();
    } catch (e) {
      assert.equal(e.error.errorMessage, "A has one constraint was violated");
    }
  });
});
