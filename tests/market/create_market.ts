import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import assert from "assert";
import {
  findEscrowPda,
  findMarketPda,
  MarketType,
} from "../../npm-client/src/";
import { createNewMint, createWalletWithBalance } from "../util/test_util";
import { Monaco, monaco } from "../util/wrappers";
import { findCommissionPaymentsQueuePda } from "../../npm-admin-client";

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
    assert.deepEqual(account.marketType, "EventResultWinner");

    // place some orders to ensure matching pools are created
    const purchaser = await createWalletWithBalance(
      monaco.provider,
      1000000000,
    );
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
            { len: 1, liquidity: 1, matched: 0 },
            { len: 1, liquidity: 1, matched: 0 },
            { len: 1, liquidity: 1, matched: 0 },
            { len: 1, liquidity: 1, matched: 0 },
            { len: 1, liquidity: 1, matched: 0 },
          ],
        );
      },
    );
  });

  it("failure when type is wrong", async () => {
    try {
      await createMarketWithIncorrectType(monaco);
      assert(false, "an exception should have been thrown");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "MarketTypeInvalid");
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
  const marketType = MarketType.EventResultWinner;
  const marketTitle = "SOME TITLE";

  const [mintPk, authorisedOperatorsPk] = await Promise.all([
    createNewMint(
      protocol.provider,
      protocol.provider.wallet as NodeWallet,
      mintDecimals,
    ),
    protocol.findMarketAuthorisedOperatorsPda(),
  ]);

  const marketPdaResponse = await findMarketPda(
    protocol.program as Program,
    event.publicKey,
    marketType,
    mintPk,
  );

  const marketEscrowPk = (
    await findEscrowPda(protocol.program as Program, marketPdaResponse.data.pda)
  ).data.pda;

  const marketPaymentQueuePk = (
    await findCommissionPaymentsQueuePda(
      protocol.program as Program,
      marketPdaResponse.data.pda,
    )
  ).data.pda;

  await protocol.program.methods
    .createMarketV2(
      event.publicKey,
      marketType,
      marketTitle,
      new anchor.BN(marketLockTimestamp),
      marketDecimals,
      new anchor.BN(eventStartTimestamp),
      inplayEnabled,
      inplayDelay,
      eventStartOrderBehaviour,
      marketLockOrderBehaviour,
    )
    .accounts({
      market: marketPdaResponse.data.pda,
      escrow: marketEscrowPk,
      commissionPaymentQueue: marketPaymentQueuePk,
      mint: mintPk,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      authorisedOperators: authorisedOperatorsPk,
      marketOperator: protocol.operatorPk,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc()
    .catch((e) => {
      console.error(e);
      throw e;
    });

  return marketPdaResponse.data.pda;
}

async function createMarketWithIncorrectType(protocol: Monaco) {
  const event = Keypair.generate();
  const marketType = MarketType.EventResultWinner + "x";
  const marketTitle = "SOME TITLE";
  const marketDecimals = 3;

  const [mintPk, authorisedOperatorsPk] = await Promise.all([
    createNewMint(
      protocol.provider,
      protocol.provider.wallet as NodeWallet,
      marketDecimals + 3,
    ),
    protocol.findMarketAuthorisedOperatorsPda(),
  ]);

  const [marketPda] = await PublicKey.findProgramAddress(
    [
      event.publicKey.toBuffer(),
      Buffer.from(marketType.toString()),
      mintPk.toBuffer(),
    ],
    protocol.getRawProgram().programId,
  );

  const marketEscrowPk = (
    await findEscrowPda(protocol.program as Program, marketPda)
  ).data.pda;

  const paymentsQueuePda = (
    await findCommissionPaymentsQueuePda(protocol.program as Program, marketPda)
  ).data.pda;

  await protocol.program.methods
    .createMarketV2(
      event.publicKey,
      marketType,
      marketTitle,
      new anchor.BN(1924254038),
      marketDecimals,
      new anchor.BN(1924254038),
      false,
      0,
      { none: {} },
      { none: {} },
    )
    .accounts({
      market: marketPda,
      escrow: marketEscrowPk,
      commissionPaymentQueue: paymentsQueuePda,
      mint: mintPk,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      authorisedOperators: authorisedOperatorsPk,
      marketOperator: protocol.operatorPk,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc()
    .catch((e) => {
      console.error(e);
      throw e;
    });
}
