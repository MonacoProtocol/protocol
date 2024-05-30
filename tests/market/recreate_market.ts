import { Program } from "@coral-xyz/anchor";
import { findEscrowPda, findMarketPda } from "../../npm-client";
import { monaco } from "../util/wrappers";
import {
  findMarketCommissionPaymentQueuePda,
  findMarketOrderRequestQueuePda,
  findMarketMatchingQueuePda,
  getOrCreateMarketType,
  findMarketFundingPda,
} from "../../npm-admin-client";
import { createNewMint, createWalletWithBalance } from "../util/test_util";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { PublicKey } from "@solana/web3.js";

describe("Recreate markets", () => {
  it("successfully", async () => {
    const program = monaco.program as Program;

    const existingMarketWrapper = await monaco.create3WayMarket([2, 3, 4]);
    await existingMarketWrapper.voidMarket();
    const existingMarket = await monaco.fetchMarket(existingMarketWrapper.pk);

    const marketPk = (
      await findMarketPda(
        program,
        existingMarket.eventAccount,
        existingMarket.marketType,
        existingMarket.marketTypeDiscriminator,
        existingMarket.marketTypeValue,
        existingMarket.mintAccount,
        existingMarket.version + 1,
      )
    ).data.pda;
    const escrowPk = (await findEscrowPda(program, marketPk)).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(program, marketPk)
    ).data.pda;
    const paymentsQueuePk = (
      await findMarketCommissionPaymentQueuePda(program, marketPk)
    ).data.pda;
    const orderRequestQueuePk = (
      await findMarketOrderRequestQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const fundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    await program.methods
      .createMarket(
        existingMarket.eventAccount,
        existingMarket.marketTypeDiscriminator,
        existingMarket.marketTypeValue,
        existingMarket.title,
        existingMarket.decimalLimit,
        existingMarket.marketLockTimestamp,
        existingMarket.eventStartTimestamp,
        existingMarket.inplayEnabled,
        existingMarket.inplayOrderDelay,
        { none: {} },
        { none: {} },
      )
      .accounts({
        existingMarket: existingMarketWrapper.pk,
        market: marketPk,
        marketType: existingMarket.marketType,
        escrow: escrowPk,
        matchingQueue: matchingQueuePk,
        commissionPaymentQueue: paymentsQueuePk,
        orderRequestQueue: orderRequestQueuePk,
        funding: fundingPk,
        mint: existingMarket.mintAccount,
        marketOperator: monaco.operatorPk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
      })
      .rpc();
  });

  it("fails if event account is not the same", async () => {
    const program = monaco.program as Program;

    const existingMarketWrapper = await monaco.create3WayMarket([2, 3, 4]);
    await existingMarketWrapper.voidMarket();
    const existingMarket = await monaco.fetchMarket(existingMarketWrapper.pk);

    const eventAccount = PublicKey.unique();

    const marketPk = (
      await findMarketPda(
        program,
        eventAccount,
        existingMarket.marketType,
        existingMarket.marketTypeDiscriminator,
        existingMarket.marketTypeValue,
        existingMarket.mintAccount,
        existingMarket.version + 1,
      )
    ).data.pda;
    const escrowPk = (await findEscrowPda(program, marketPk)).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(program, marketPk)
    ).data.pda;
    const paymentsQueuePk = (
      await findMarketCommissionPaymentQueuePda(program, marketPk)
    ).data.pda;
    const orderRequestQueuePk = (
      await findMarketOrderRequestQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketFundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    try {
      await program.methods
        .createMarket(
          eventAccount,
          existingMarket.marketTypeDiscriminator,
          existingMarket.marketTypeValue,
          existingMarket.title,
          existingMarket.decimalLimit,
          existingMarket.marketLockTimestamp,
          existingMarket.eventStartTimestamp,
          existingMarket.inplayEnabled,
          existingMarket.inplayOrderDelay,
          { none: {} },
          { none: {} },
        )
        .accounts({
          existingMarket: existingMarketWrapper.pk,
          market: marketPk,
          marketType: existingMarket.marketType,
          escrow: escrowPk,
          matchingQueue: matchingQueuePk,
          commissionPaymentQueue: paymentsQueuePk,
          orderRequestQueue: orderRequestQueuePk,
          funding: marketFundingPk,
          mint: existingMarket.mintAccount,
          marketOperator: monaco.operatorPk,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        })
        .rpc();
      fail("Should have thrown");
    } catch (e) {
      expect(e.error.errorCode.code).toMatch("MarketEventAccountMismatch");
    }
  });

  it("fails if market type is not the same", async () => {
    const program = monaco.program as Program;

    const existingMarketWrapper = await monaco.create3WayMarket([2, 3, 4]);
    await existingMarketWrapper.voidMarket();
    const existingMarket = await monaco.fetchMarket(existingMarketWrapper.pk);

    const marketType = (
      await getOrCreateMarketType(program, "recreate_test_type", false, false)
    ).data.publicKey;

    const marketPk = (
      await findMarketPda(
        program,
        existingMarket.eventAccount,
        marketType,
        existingMarket.marketTypeDiscriminator,
        existingMarket.marketTypeValue,
        existingMarket.mintAccount,
        existingMarket.version + 1,
      )
    ).data.pda;
    const escrowPk = (await findEscrowPda(program, marketPk)).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(program, marketPk)
    ).data.pda;
    const paymentsQueuePk = (
      await findMarketCommissionPaymentQueuePda(program, marketPk)
    ).data.pda;
    const orderRequestQueuePk = (
      await findMarketOrderRequestQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketFundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    try {
      await program.methods
        .createMarket(
          existingMarket.eventAccount,
          existingMarket.marketTypeDiscriminator,
          existingMarket.marketTypeValue,
          existingMarket.title,
          existingMarket.decimalLimit,
          existingMarket.marketLockTimestamp,
          existingMarket.eventStartTimestamp,
          existingMarket.inplayEnabled,
          existingMarket.inplayOrderDelay,
          { none: {} },
          { none: {} },
        )
        .accounts({
          existingMarket: existingMarketWrapper.pk,
          market: marketPk,
          marketType: marketType,
          escrow: escrowPk,
          matchingQueue: matchingQueuePk,
          commissionPaymentQueue: paymentsQueuePk,
          orderRequestQueue: orderRequestQueuePk,
          funding: marketFundingPk,
          mint: existingMarket.mintAccount,
          marketOperator: monaco.operatorPk,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        })
        .rpc();
      fail("Should have thrown");
    } catch (e) {
      expect(e.error.errorCode.code).toMatch("MarketTypeMismatch");
    }
  });

  it("fails if market type discriminant is not the same", async () => {
    const program = monaco.program as Program;

    const marketTypeResp = await getOrCreateMarketType(
      program,
      "recreate_test_type_discrimator",
      true,
      false,
    );
    const marketTypePk = marketTypeResp.data.publicKey;

    const existingMarketWrapper = await monaco.createMarketWithOptions({
      outcomes: ["A", "B", "C"],
      priceLadder: [2, 3, 4],
      marketTypePk,
      marketTypeDiscriminator: "a",
    });
    await existingMarketWrapper.voidMarket();
    const existingMarket = await monaco.fetchMarket(existingMarketWrapper.pk);

    const marketPk = (
      await findMarketPda(
        program,
        existingMarket.eventAccount,
        existingMarket.marketType,
        "b",
        existingMarket.marketTypeValue,
        existingMarket.mintAccount,
        existingMarket.version + 1,
      )
    ).data.pda;
    const escrowPk = (await findEscrowPda(program, marketPk)).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(program, marketPk)
    ).data.pda;
    const paymentsQueuePk = (
      await findMarketCommissionPaymentQueuePda(program, marketPk)
    ).data.pda;
    const orderRequestQueuePk = (
      await findMarketOrderRequestQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketFundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    try {
      await program.methods
        .createMarket(
          existingMarket.eventAccount,
          "b",
          existingMarket.marketTypeValue,
          existingMarket.title,
          existingMarket.decimalLimit,
          existingMarket.marketLockTimestamp,
          existingMarket.eventStartTimestamp,
          existingMarket.inplayEnabled,
          existingMarket.inplayOrderDelay,
          { none: {} },
          { none: {} },
        )
        .accounts({
          existingMarket: existingMarketWrapper.pk,
          market: marketPk,
          marketType: existingMarket.marketType,
          escrow: escrowPk,
          matchingQueue: matchingQueuePk,
          commissionPaymentQueue: paymentsQueuePk,
          orderRequestQueue: orderRequestQueuePk,
          funding: marketFundingPk,
          mint: existingMarket.mintAccount,
          marketOperator: monaco.operatorPk,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        })
        .rpc();
      fail("Should have thrown");
    } catch (e) {
      expect(e.error.errorCode.code).toMatch("MarketTypeDiscriminatorMismatch");
    }
  });

  it("fails if market type value is not the same", async () => {
    const program = monaco.program as Program;

    const marketTypePk = (
      await getOrCreateMarketType(
        program,
        "recreate_test_type_value",
        false,
        true,
      )
    ).data.publicKey;

    const existingMarketWrapper = await monaco.createMarketWithOptions({
      outcomes: ["A", "B", "C"],
      priceLadder: [2, 3, 4],
      marketTypePk,
      marketTypeValue: "a",
    });
    await existingMarketWrapper.voidMarket();
    const existingMarket = await monaco.fetchMarket(existingMarketWrapper.pk);

    const marketPk = (
      await findMarketPda(
        program,
        existingMarket.eventAccount,
        existingMarket.marketType,
        existingMarket.marketTypeDiscriminator,
        "b",
        existingMarket.mintAccount,
        existingMarket.version + 1,
      )
    ).data.pda;
    const escrowPk = (await findEscrowPda(program, marketPk)).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(program, marketPk)
    ).data.pda;
    const paymentsQueuePk = (
      await findMarketCommissionPaymentQueuePda(program, marketPk)
    ).data.pda;
    const orderRequestQueuePk = (
      await findMarketOrderRequestQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketFundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    try {
      await program.methods
        .createMarket(
          existingMarket.eventAccount,
          existingMarket.marketTypeDiscriminator,
          "b",
          existingMarket.title,
          existingMarket.decimalLimit,
          existingMarket.marketLockTimestamp,
          existingMarket.eventStartTimestamp,
          existingMarket.inplayEnabled,
          existingMarket.inplayOrderDelay,
          { none: {} },
          { none: {} },
        )
        .accounts({
          existingMarket: existingMarketWrapper.pk,
          market: marketPk,
          marketType: existingMarket.marketType,
          escrow: escrowPk,
          matchingQueue: matchingQueuePk,
          commissionPaymentQueue: paymentsQueuePk,
          orderRequestQueue: orderRequestQueuePk,
          funding: marketFundingPk,
          mint: existingMarket.mintAccount,
          marketOperator: monaco.operatorPk,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        })
        .rpc();
      fail("Should have thrown");
    } catch (e) {
      expect(e.error.errorCode.code).toMatch("MarketTypeValueMismatch");
    }
  });

  it("fails if mint is not the same", async () => {
    const program = monaco.program as Program;

    const existingMarketWrapper = await monaco.create3WayMarket([2, 3, 4]);
    await existingMarketWrapper.voidMarket();
    const existingMarket = await monaco.fetchMarket(existingMarketWrapper.pk);

    const mint = await createNewMint(
      monaco.provider,
      monaco.provider.wallet as NodeWallet,
      6,
    );

    const marketPk = (
      await findMarketPda(
        program,
        existingMarket.eventAccount,
        existingMarket.marketType,
        existingMarket.marketTypeDiscriminator,
        existingMarket.marketTypeValue,
        mint,
        existingMarket.version + 1,
      )
    ).data.pda;
    const escrowPk = (await findEscrowPda(program, marketPk)).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(program, marketPk)
    ).data.pda;
    const paymentsQueuePk = (
      await findMarketCommissionPaymentQueuePda(program, marketPk)
    ).data.pda;
    const orderRequestQueuePk = (
      await findMarketOrderRequestQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const marketFundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    try {
      await program.methods
        .createMarket(
          existingMarket.eventAccount,
          existingMarket.marketTypeDiscriminator,
          existingMarket.marketTypeValue,
          existingMarket.title,
          existingMarket.decimalLimit,
          existingMarket.marketLockTimestamp,
          existingMarket.eventStartTimestamp,
          existingMarket.inplayEnabled,
          existingMarket.inplayOrderDelay,
          { none: {} },
          { none: {} },
        )
        .accounts({
          existingMarket: existingMarketWrapper.pk,
          market: marketPk,
          marketType: existingMarket.marketType,
          escrow: escrowPk,
          matchingQueue: matchingQueuePk,
          commissionPaymentQueue: paymentsQueuePk,
          orderRequestQueue: orderRequestQueuePk,
          funding: marketFundingPk,
          mint: mint,
          marketOperator: monaco.operatorPk,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        })
        .rpc();
      fail("Should have thrown");
    } catch (e) {
      expect(e.error.errorCode.code).toMatch("MarketMintMismatch");
    }
  });

  it("fails if operator is not the same as existing market authority", async () => {
    const program = monaco.program as Program;

    const newOperator = await createWalletWithBalance(monaco.provider);
    await monaco.authoriseMarketOperator(newOperator);

    const existingMarketWrapper = await monaco.create3WayMarket([2, 3, 4]);
    await existingMarketWrapper.voidMarket();
    const existingMarket = await monaco.fetchMarket(existingMarketWrapper.pk);

    const marketPk = (
      await findMarketPda(
        program,
        existingMarket.eventAccount,
        existingMarket.marketType,
        existingMarket.marketTypeDiscriminator,
        existingMarket.marketTypeValue,
        existingMarket.mintAccount,
        existingMarket.version + 1,
      )
    ).data.pda;
    const escrowPk = (await findEscrowPda(program, marketPk)).data.pda;
    const matchingQueuePk = (
      await findMarketMatchingQueuePda(program, marketPk)
    ).data.pda;
    const paymentsQueuePk = (
      await findMarketCommissionPaymentQueuePda(program, marketPk)
    ).data.pda;
    const orderRequestQueuePk = (
      await findMarketOrderRequestQueuePda(monaco.program as Program, marketPk)
    ).data.pda;
    const fundingPk = (
      await findMarketFundingPda(monaco.program as Program, marketPk)
    ).data.pda;

    try {
      await program.methods
        .createMarket(
          existingMarket.eventAccount,
          existingMarket.marketTypeDiscriminator,
          existingMarket.marketTypeValue,
          existingMarket.title,
          existingMarket.decimalLimit,
          existingMarket.marketLockTimestamp,
          existingMarket.eventStartTimestamp,
          existingMarket.inplayEnabled,
          existingMarket.inplayOrderDelay,
          { none: {} },
          { none: {} },
        )
        .accounts({
          existingMarket: existingMarketWrapper.pk,
          market: marketPk,
          marketType: existingMarket.marketType,
          escrow: escrowPk,
          matchingQueue: matchingQueuePk,
          commissionPaymentQueue: paymentsQueuePk,
          orderRequestQueue: orderRequestQueuePk,
          funding: fundingPk,
          mint: existingMarket.mintAccount,
          marketOperator: newOperator.publicKey,
          authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        })
        .signers([newOperator])
        .rpc();
      fail("Should have thrown");
    } catch (e) {
      expect(e.error.errorCode.code).toMatch("MarketAuthorityMismatch");
    }
  });
});
