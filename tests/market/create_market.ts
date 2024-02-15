import { Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import assert from "assert";
import { findEscrowPda, findMarketPda } from "../../npm-client/src/";
import { createNewMint, createWalletWithBalance } from "../util/test_util";
import { Monaco, monaco } from "../util/wrappers";
import {
  findCommissionPaymentsQueuePda,
  findOrderRequestQueuePda,
  findMarketMatchingQueuePda,
  findMarketFundingPda,
} from "../../npm-admin-client";
import { getOrCreateMarketType } from "../../npm-admin-client/src/market_type_create";

describe("Create markets with inplay features", () => {
  it("successfully", async () => {
    const now = Math.floor(new Date().getTime() / 1000);
    const lockTime = now + 1000;
    const eventTime = now + 100;
    const marketPk = await createMarket(
      monaco,
      6,
      3,
      lockTime,
      eventTime,
      true,
      10,
      { none: {} },
      { cancelUnmatched: {} },
    );

    const market = await monaco.fetchMarket(marketPk);

    assert.equal(market.inplayEnabled, true);
    assert.equal(market.inplayOrderDelay, 10);
    assert.equal(market.marketLockTimestamp.toNumber(), lockTime);
    assert.equal(market.eventStartTimestamp.toNumber(), eventTime);
    assert.deepEqual(market.marketLockOrderBehaviour, { none: {} });
    assert.deepEqual(market.eventStartOrderBehaviour, { cancelUnmatched: {} });
  });
});

describe("Market: creation", () => {
  it("Success", async () => {
    const priceLadder = [1.001, 1.01, 1.1];
    // create a new market
    const market = await monaco.create3WayMarket(priceLadder);

    // check the state of the newly created account
    const account = await monaco.fetchMarket(market.pk);
    assert.deepEqual(account.title, "SOME TITLE");
    assert.deepEqual(account.marketType, market.marketTypePk);

    // place some orders to ensure matching pools are created
    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.cachePurchaserTokenPk(purchaser.publicKey);
    await market.airdrop(purchaser, 100);

    for (
      let marketOutcomeIndex = 0;
      marketOutcomeIndex < market.outcomePks.length;
      marketOutcomeIndex++
    ) {
      for (const price of priceLadder) {
        await market.forOrder(marketOutcomeIndex, 1, price, purchaser);
        await market.againstOrder(marketOutcomeIndex, 1, price, purchaser);
      }
    }

    ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"].forEach(
      async (marketOutcome, marketOutcomeIndex) => {
        assert.deepEqual(
          await Promise.all([
            market.getMarketOutcome(marketOutcomeIndex),
            market.getForMatchingPool(marketOutcomeIndex, 1.001),
            market.getAgainstMatchingPool(marketOutcomeIndex, 1.001),
            market.getForMatchingPool(marketOutcomeIndex, 1.01),
            market.getAgainstMatchingPool(marketOutcomeIndex, 1.01),
            market.getForMatchingPool(marketOutcomeIndex, 1.1),
            market.getAgainstMatchingPool(marketOutcomeIndex, 1.1),
          ]),
          [
            { price: [1.001, 1.01, 1.1], title: marketOutcome },
            { len: 1, liquidity: 1, matched: 0 },
            { len: 0, liquidity: 0, matched: 1 },
            { len: 1, liquidity: 1, matched: 0 },
            { len: 0, liquidity: 0, matched: 1 },
            { len: 1, liquidity: 1, matched: 0 },
            { len: 0, liquidity: 0, matched: 1 },
          ],
        );
      },
    );
  });

  it("success when market type discriminator and value are provided appropriately", async () => {
    const marketTypeDiscriminator = "foo";
    const marketTypeValue = "bar";

    const marketType = "TypeWithDiscrimAndValue";
    const marketTypeResp = await getOrCreateMarketType(
      monaco.program as Program,
      marketType,
      true,
      true,
    );
    if (!marketTypeResp.success) {
      throw new Error(marketTypeResp.errors[0].toString());
    }
    const marketTypePk = marketTypeResp.data.publicKey;

    const mintDecimals = 6;
    const marketDecimals = 3;
    const event = Keypair.generate();
    const marketTitle = "SOME TITLE";
    const now = Math.floor(new Date().getTime() / 1000);
    const marketLockTimestamp = now + 1000;
    const eventStartTimestamp = marketLockTimestamp;

    const [mintPk, authorisedOperatorsPk] = await Promise.all([
      createNewMint(
        monaco.provider,
        monaco.provider.wallet as NodeWallet,
        mintDecimals,
      ),
      monaco.findMarketAuthorisedOperatorsPda(),
    ]);

    const marketPk = (
      await findMarketPda(
        monaco.program as Program,
        event.publicKey,
        marketTypePk,
        marketTypeDiscriminator,
        marketTypeValue,
        mintPk,
      )
    ).data.pda;

    const marketEscrowPk = (
      await findEscrowPda(monaco.program as Program, marketPk)
    ).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketPaymentQueuePk = (
      await findCommissionPaymentsQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketFundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    await monaco.program.methods
      .createMarket(
        event.publicKey,
        marketTypeDiscriminator,
        marketTypeValue,
        marketTitle,
        marketDecimals,
        new anchor.BN(marketLockTimestamp),
        new anchor.BN(eventStartTimestamp),
        false,
        0,
        { none: {} },
        { none: {} },
      )
      .accounts({
        existingMarket: null,
        market: marketPk,
        marketType: marketTypePk,
        escrow: marketEscrowPk,
        matchingQueue: matchingQueuePk,
        funding: marketFundingPk,
        commissionPaymentQueue: marketPaymentQueuePk,
        mint: mintPk,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        authorisedOperators: authorisedOperatorsPk,
        marketOperator: monaco.operatorPk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  });

  it("failure when market type discriminator contains the seed separator", async () => {
    const marketTypeDiscriminator = "a market ␞ discriminator";
    const marketTypeValue = "bar";

    const marketType = "TypeWithDiscrimAndValue";
    const marketTypeResp = await getOrCreateMarketType(
      monaco.program as Program,
      marketType,
      true,
      true,
    );
    if (!marketTypeResp.success) {
      throw new Error(marketTypeResp.errors[0].toString());
    }
    const marketTypePk = marketTypeResp.data.publicKey;

    const mintDecimals = 6;
    const marketDecimals = 3;
    const event = Keypair.generate();
    const marketTitle = "SOME TITLE";
    const now = Math.floor(new Date().getTime() / 1000);
    const marketLockTimestamp = now + 1000;
    const eventStartTimestamp = marketLockTimestamp;

    const [mintPk, authorisedOperatorsPk] = await Promise.all([
      createNewMint(
        monaco.provider,
        monaco.provider.wallet as NodeWallet,
        mintDecimals,
      ),
      monaco.findMarketAuthorisedOperatorsPda(),
    ]);

    const marketPk = (
      await findMarketPda(
        monaco.program as Program,
        event.publicKey,
        marketTypePk,
        marketTypeDiscriminator,
        marketTypeValue,
        mintPk,
      )
    ).data.pda;

    const marketEscrowPk = (
      await findEscrowPda(monaco.program as Program, marketPk)
    ).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketPaymentQueuePk = (
      await findCommissionPaymentsQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketFundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    try {
      await monaco.program.methods
        .createMarket(
          event.publicKey,
          marketTypeDiscriminator,
          marketTypeValue,
          marketTitle,
          marketDecimals,
          new anchor.BN(marketLockTimestamp),
          new anchor.BN(eventStartTimestamp),
          false,
          0,
          { none: {} },
          { none: {} },
        )
        .accounts({
          existingMarket: null,
          market: marketPk,
          marketType: marketTypePk,
          escrow: marketEscrowPk,
          matchingQueue: matchingQueuePk,
          funding: marketFundingPk,
          commissionPaymentQueue: marketPaymentQueuePk,
          mint: mintPk,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          authorisedOperators: authorisedOperatorsPk,
          marketOperator: monaco.operatorPk,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Expected an exception to be thrown");
    } catch (err) {
      assert.equal(
        err.error.errorCode.code,
        "MarketTypeDiscriminatorContainsSeedSeparator",
      );
    }
  });

  it("failure when type discriminator provided but not required by market type", async () => {
    const marketTypeDiscriminator = "Foobar";
    const marketTypeValue = null;

    const marketType = "EventResultWinner";
    const marketTypeResp = await getOrCreateMarketType(
      monaco.program as Program,
      marketType,
      false,
      false,
    );
    if (!marketTypeResp.success) {
      throw new Error(marketTypeResp.errors[0].toString());
    }
    const marketTypePk = marketTypeResp.data.publicKey;

    const mintDecimals = 6;
    const marketDecimals = 3;
    const event = Keypair.generate();
    const marketTitle = "SOME TITLE";
    const now = Math.floor(new Date().getTime() / 1000);
    const marketLockTimestamp = now + 1000;
    const eventStartTimestamp = marketLockTimestamp;

    const [mintPk, authorisedOperatorsPk] = await Promise.all([
      createNewMint(
        monaco.provider,
        monaco.provider.wallet as NodeWallet,
        mintDecimals,
      ),
      monaco.findMarketAuthorisedOperatorsPda(),
    ]);

    const marketPk = (
      await findMarketPda(
        monaco.program as Program,
        event.publicKey,
        marketTypePk,
        marketTypeDiscriminator,
        marketTypeValue,
        mintPk,
      )
    ).data.pda;

    const marketEscrowPk = (
      await findEscrowPda(monaco.program as Program, marketPk)
    ).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketPaymentQueuePk = (
      await findCommissionPaymentsQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketFundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    const orderRequestQueuePk = (
      await findOrderRequestQueuePda(monaco.program as Program, marketPk)
    ).data.pda;

    try {
      await monaco.program.methods
        .createMarket(
          event.publicKey,
          marketTypeDiscriminator,
          marketTypeValue,
          marketTitle,
          marketDecimals,
          new anchor.BN(marketLockTimestamp),
          new anchor.BN(eventStartTimestamp),
          false,
          0,
          { none: {} },
          { none: {} },
        )
        .accounts({
          existingMarket: null,
          market: marketPk,
          marketType: marketTypePk,
          escrow: marketEscrowPk,
          matchingQueue: matchingQueuePk,
          funding: marketFundingPk,
          commissionPaymentQueue: marketPaymentQueuePk,
          orderRequestQueue: orderRequestQueuePk,
          mint: mintPk,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          authorisedOperators: authorisedOperatorsPk,
          marketOperator: monaco.operatorPk,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Expected to fail");
    } catch (err) {
      assert.equal(
        err.error.errorCode.code,
        "MarketTypeDiscriminatorUsageIncorrect",
      );
    }
  });

  it("failure when type discriminator not provided but is required by market type", async () => {
    const marketTypeDiscriminator = null;
    const marketTypeValue = null;

    const marketType = "DiscrimOnly";
    const marketTypeResp = await getOrCreateMarketType(
      monaco.program as Program,
      marketType,
      true,
      false,
    );
    if (!marketTypeResp.success) {
      throw new Error(marketTypeResp.errors[0].toString());
    }
    const marketTypePk = marketTypeResp.data.publicKey;

    const mintDecimals = 6;
    const marketDecimals = 3;
    const event = Keypair.generate();
    const marketTitle = "SOME TITLE";
    const now = Math.floor(new Date().getTime() / 1000);
    const marketLockTimestamp = now + 1000;
    const eventStartTimestamp = marketLockTimestamp;

    const [mintPk, authorisedOperatorsPk] = await Promise.all([
      createNewMint(
        monaco.provider,
        monaco.provider.wallet as NodeWallet,
        mintDecimals,
      ),
      monaco.findMarketAuthorisedOperatorsPda(),
    ]);

    const marketPk = (
      await findMarketPda(
        monaco.program as Program,
        event.publicKey,
        marketTypePk,
        marketTypeDiscriminator,
        marketTypeValue,
        mintPk,
      )
    ).data.pda;

    const marketEscrowPk = (
      await findEscrowPda(monaco.program as Program, marketPk)
    ).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketPaymentQueuePk = (
      await findCommissionPaymentsQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketFundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    try {
      await monaco.program.methods
        .createMarket(
          event.publicKey,
          marketTypeDiscriminator,
          marketTypeValue,
          marketTitle,
          marketDecimals,
          new anchor.BN(marketLockTimestamp),
          new anchor.BN(eventStartTimestamp),
          false,
          0,
          { none: {} },
          { none: {} },
        )
        .accounts({
          existingMarket: null,
          market: marketPk,
          marketType: marketTypePk,
          escrow: marketEscrowPk,
          matchingQueue: matchingQueuePk,
          funding: marketFundingPk,
          commissionPaymentQueue: marketPaymentQueuePk,
          mint: mintPk,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          authorisedOperators: authorisedOperatorsPk,
          marketOperator: monaco.operatorPk,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Expected to fail");
    } catch (err) {
      assert.equal(
        err.error.errorCode.code,
        "MarketTypeDiscriminatorUsageIncorrect",
      );
    }
  });

  it("failure when type value provided but not required by market type", async () => {
    const marketTypeValue = "Foobar";
    const marketTypeDiscriminator = null;

    const marketType = "EventResultWinner";
    const marketTypeResp = await getOrCreateMarketType(
      monaco.program as Program,
      marketType,
      false,
      false,
    );
    if (!marketTypeResp.success) {
      throw new Error(marketTypeResp.errors[0].toString());
    }
    const marketTypePk = marketTypeResp.data.publicKey;

    const mintDecimals = 6;
    const marketDecimals = 3;
    const event = Keypair.generate();

    const marketTitle = "SOME TITLE";
    const now = Math.floor(new Date().getTime() / 1000);
    const marketLockTimestamp = now + 1000;
    const eventStartTimestamp = marketLockTimestamp;

    const [mintPk, authorisedOperatorsPk] = await Promise.all([
      createNewMint(
        monaco.provider,
        monaco.provider.wallet as NodeWallet,
        mintDecimals,
      ),
      monaco.findMarketAuthorisedOperatorsPda(),
    ]);

    const marketPk = (
      await findMarketPda(
        monaco.program as Program,
        event.publicKey,
        marketTypePk,
        marketTypeDiscriminator,
        marketTypeValue,
        mintPk,
      )
    ).data.pda;

    const marketEscrowPk = (
      await findEscrowPda(monaco.program as Program, marketPk)
    ).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketPaymentQueuePk = (
      await findCommissionPaymentsQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketFundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    const orderRequestQueuePk = (
      await findOrderRequestQueuePda(monaco.program as Program, marketPk)
    ).data.pda;

    try {
      await monaco.program.methods
        .createMarket(
          event.publicKey,
          marketTypeDiscriminator,
          marketTypeValue,
          marketTitle,
          marketDecimals,
          new anchor.BN(marketLockTimestamp),
          new anchor.BN(eventStartTimestamp),
          false,
          0,
          { none: {} },
          { none: {} },
        )
        .accounts({
          existingMarket: null,
          market: marketPk,
          marketType: marketTypePk,
          escrow: marketEscrowPk,
          matchingQueue: matchingQueuePk,
          funding: marketFundingPk,
          commissionPaymentQueue: marketPaymentQueuePk,
          orderRequestQueue: orderRequestQueuePk,
          mint: mintPk,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          authorisedOperators: authorisedOperatorsPk,
          marketOperator: monaco.operatorPk,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Expected to fail");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "MarketTypeValueUsageIncorrect");
    }
  });

  it("failure when type value not provided but is required by market type", async () => {
    const marketTypeDiscriminator = null;
    const marketTypeValue = null;

    const marketType = "ValueOnly";
    const marketTypeResp = await getOrCreateMarketType(
      monaco.program as Program,
      marketType,
      false,
      true,
    );
    if (!marketTypeResp.success) {
      throw new Error(marketTypeResp.errors[0].toString());
    }
    const marketTypePk = marketTypeResp.data.publicKey;

    const mintDecimals = 6;
    const marketDecimals = 3;
    const event = Keypair.generate();
    const marketTitle = "SOME TITLE";
    const now = Math.floor(new Date().getTime() / 1000);
    const marketLockTimestamp = now + 1000;
    const eventStartTimestamp = marketLockTimestamp;

    const [mintPk, authorisedOperatorsPk] = await Promise.all([
      createNewMint(
        monaco.provider,
        monaco.provider.wallet as NodeWallet,
        mintDecimals,
      ),
      monaco.findMarketAuthorisedOperatorsPda(),
    ]);

    const marketPk = (
      await findMarketPda(
        monaco.program as Program,
        event.publicKey,
        marketTypePk,
        marketTypeDiscriminator,
        marketTypeValue,
        mintPk,
      )
    ).data.pda;

    const marketEscrowPk = (
      await findEscrowPda(monaco.program as Program, marketPk)
    ).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketPaymentQueuePk = (
      await findCommissionPaymentsQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketFundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    const orderRequestQueuePk = (
      await findOrderRequestQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    try {
      await monaco.program.methods
        .createMarket(
          event.publicKey,
          marketTypeDiscriminator,
          marketTypeValue,
          marketTitle,
          marketDecimals,
          new anchor.BN(marketLockTimestamp),
          new anchor.BN(eventStartTimestamp),
          false,
          0,
          { none: {} },
          { none: {} },
        )
        .accounts({
          existingMarket: null,
          market: marketPk,
          marketType: marketTypePk,
          escrow: marketEscrowPk,
          matchingQueue: matchingQueuePk,
          funding: marketFundingPk,
          commissionPaymentQueue: marketPaymentQueuePk,
          orderRequestQueue: orderRequestQueuePk,
          mint: mintPk,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          authorisedOperators: authorisedOperatorsPk,
          marketOperator: monaco.operatorPk,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Expected to fail");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "MarketTypeValueUsageIncorrect");
    }
  });

  it("failure when lock time is after event start time", async () => {
    const now = Math.floor(new Date().getTime() / 1000);
    const lockTime = now + 1000;
    const eventTime = now + 100;

    try {
      await createMarket(monaco, 6, 3, lockTime, eventTime);
      assert(false, "an exception should have been thrown");
    } catch (err) {
      assert.equal(
        err.error.errorCode.code,
        "MarketLockTimeAfterEventStartTime",
      );
    }
  });

  it("failure when max_decimals is too large", async () => {
    // Decimals to test with
    const mint_decimals = 6;
    const market_decimals = 4;

    try {
      await createMarket(monaco, mint_decimals, market_decimals);
      assert(false, "an exception should have been thrown");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "MaxDecimalsTooLarge");
    }
  });

  it("failure when max_decimals is larger than mint_decimals (nice error)", async () => {
    // Decimals to test with
    const mint_decimals = 3;
    const market_decimals = 4;

    try {
      await createMarket(monaco, mint_decimals, market_decimals);
      assert(false, "an exception should have been thrown");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "MaxDecimalsTooLarge");
    }
  });

  it("failure when mint_decimals is less than PRICE_SCALE", async () => {
    const mint_decimals = 2; // < 3

    try {
      await createMarket(monaco, mint_decimals, 3);
      assert(false, "an exception should have been thrown");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "MintDecimalsUnsupported");
    }
  });

  it("update price ladder for market outcome", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([1.001, 1.01, 1.1]);

    const pricesToAdd = [9.999, 9.99, 9.9];

    await monaco.program.methods
      .addPricesToMarketOutcome(0, pricesToAdd)
      .accounts({
        outcome: market.outcomePks[0],
        market: market.pk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const marketOutcome = await monaco.getMarketOutcome(market.outcomePks[0]);

    const expectedPrices = [1.001, 1.01, 1.1, 9.9, 9.99, 9.999];

    assert.deepEqual(marketOutcome.price, expectedPrices);
  });
});

async function createMarket(
  protocol: Monaco,
  mintDecimals: number,
  marketDecimals: number,
  marketLockTimestamp = 1924254038,
  eventStartTimestamp = 1924254038,
  inplayEnabled = false,
  inplayDelay = 0,
  marketLockOrderBehaviour: object = { none: {} },
  eventStartOrderBehaviour: object = { none: {} },
) {
  const event = Keypair.generate();
  const marketType = "EventResultWinner";
  const marketTypeDiscriminator = null;
  const marketTypeValue = null;
  const marketTitle = "SOME TITLE";

  const [mintPk, authorisedOperatorsPk] = await Promise.all([
    createNewMint(
      protocol.provider,
      protocol.provider.wallet as NodeWallet,
      mintDecimals,
    ),
    protocol.findMarketAuthorisedOperatorsPda(),
  ]);

  const marketTypeResp = await getOrCreateMarketType(
    protocol.program as Program,
    marketType,
  );
  if (!marketTypeResp.success) {
    throw new Error(marketTypeResp.errors[0].toString());
  }
  const marketTypePk = marketTypeResp.data.publicKey;

  const marketPk = (
    await findMarketPda(
      protocol.program as Program,
      event.publicKey,
      marketTypePk,
      marketTypeDiscriminator,
      marketTypeValue,
      mintPk,
    )
  ).data.pda;

  const marketEscrowPk = (
    await findEscrowPda(protocol.program as Program, marketPk)
  ).data.pda;
  const marketFundingPk = (
    await findMarketFundingPda(monaco.program as Program, marketPk)
  ).data.pda;

  await protocol.program.methods
    .createMarket(
      event.publicKey,
      marketTypeDiscriminator,
      marketTypeValue,
      marketTitle,
      marketDecimals,
      new anchor.BN(marketLockTimestamp),
      new anchor.BN(eventStartTimestamp),
      inplayEnabled,
      inplayDelay,
      eventStartOrderBehaviour,
      marketLockOrderBehaviour,
    )
    .accounts({
      existingMarket: null,
      market: marketPk,
      marketType: marketTypePk,
      escrow: marketEscrowPk,
      authorisedOperators: authorisedOperatorsPk,
      marketOperator: protocol.operatorPk,
      funding: marketFundingPk,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      mint: mintPk,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc()
    .catch((e) => {
      console.error(e);
      throw e;
    });

  return marketPk;
}
