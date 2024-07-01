import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createMint,
  getAssociatedTokenAddress,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import {
  AnchorProvider,
  BN,
  getProvider,
  Program,
  Provider,
} from "@coral-xyz/anchor";
import { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { MonacoProtocol } from "../../target/types/monaco_protocol";
import {
  findEscrowPda,
  findMarketMatchingPoolPda,
  findMarketOrderRequestQueuePda,
  findMarketOutcomePda,
  findMarketPda,
  findMarketPositionPda,
  findOrderPda,
  getMarketCommissionPaymentQueue,
  MarketAccount,
  toCommissionPayments,
} from "../../npm-client";
import { findMarketPdas, findProductPda } from "./pdas";
import * as assert from "assert";
import { AssertionError } from "assert";
import { ProtocolProduct } from "../anchor/protocol_product/protocol_product";
import console from "console";
import * as idl from "../anchor/protocol_product/protocol_product.json";
import {
  findMarketCommissionPaymentQueuePda,
  findMarketFundingPda,
  findMarketLiquiditiesPda,
  findMarketMatchingQueuePda,
  getOrCreateMarketType as getOrCreateMarketTypeClient,
} from "../../npm-admin-client";

const { SystemProgram } = anchor.web3;

export enum OperatorType {
  ADMIN,
  CRANK,
  MARKET,
}

export async function getMarketMatchingPoolsPks(
  market: PublicKey,
  outcomeIndex: number,
  priceLadder: number[],
) {
  const protocolProgram = anchor.workspace
    .MonacoProtocol as Program<MonacoProtocol>;
  const pools: { against: PublicKey; forOutcome: PublicKey }[] = [];

  for (const price of priceLadder) {
    const [marketMatchingPoolForPda, marketMatchingPoolAgainstPda] =
      await Promise.all([
        findMarketMatchingPoolPda(
          protocolProgram as Program,
          market,
          outcomeIndex,
          price,
          true,
        ),
        findMarketMatchingPoolPda(
          protocolProgram as Program,
          market,
          outcomeIndex,
          price,
          false,
        ),
      ]);

    pools[price] = {
      forOutcome: marketMatchingPoolForPda.data.pda,
      against: marketMatchingPoolAgainstPda.data.pda,
    };
  }
  return pools;
}

export async function createMarket(
  protocolProgram: Program<MonacoProtocol>,
  provider: AnchorProvider,
  priceLadder: PublicKey | number[] = [4.2],
  marketOperator: Keypair = null,
  authorisedMarketOperators: PublicKey = null,
  outcomes: string[] = ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
  mint_decimals = 6,
  max_decimals = 3,
  initialisePools = true,
  mintPk: PublicKey = null,
) {
  if (marketOperator == null) {
    marketOperator = (provider.wallet as NodeWallet).payer;
  }
  if (authorisedMarketOperators == null) {
    const [authorisedOperatorsAccountPda] = await PublicKey.findProgramAddress(
      [Buffer.from("authorised_operators"), Buffer.from("MARKET")],
      protocolProgram.programId,
    );
    authorisedMarketOperators = authorisedOperatorsAccountPda;
  }

  await provider.connection.confirmTransaction(
    await provider.connection.requestAirdrop(
      marketOperator.publicKey,
      1000000000,
    ),
  );

  const eventAccount = anchor.web3.Keypair.generate();
  const marketType = "EventResultWinner";
  const marketTypeDiscriminator = null;
  const marketTypeValue = null;
  const wallet = provider.wallet as NodeWallet;

  if (mintPk == null) {
    mintPk = await createNewMint(provider, wallet, mint_decimals);
  }

  const marketTypeResp = await getOrCreateMarketTypeClient(
    protocolProgram as Program,
    marketType,
  );
  if (!marketTypeResp.success) {
    throw new Error(marketTypeResp.errors[0].toString());
  }
  const marketTypePk = marketTypeResp.data.publicKey;

  const marketPda = (
    await findMarketPda(
      protocolProgram as Program,
      eventAccount.publicKey,
      marketTypePk,
      marketTypeDiscriminator,
      marketTypeValue,
      mintPk,
    )
  ).data.pda;

  const escrowPda = (await findEscrowPda(protocolProgram as Program, marketPda))
    .data.pda;
  const fundingPda = (
    await findMarketFundingPda(protocolProgram as Program, marketPda)
  ).data.pda;

  await protocolProgram.methods
    .createMarket(
      eventAccount.publicKey,
      marketTypeDiscriminator,
      marketTypeValue,
      "SOME TITLE",
      max_decimals,
      new BN(1924254038),
      new BN(1924254038),
      false,
      0,
      { none: {} },
      { none: {} },
    )
    .accounts({
      existingMarket: null,
      market: marketPda,
      marketType: marketTypePk,
      systemProgram: SystemProgram.programId,
      escrow: escrowPda,
      funding: fundingPda,
      mint: mintPk,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      authorisedOperators: authorisedMarketOperators,
      marketOperator: marketOperator.publicKey,
    })
    .signers([marketOperator])
    .rpc()
    .catch((e) => {
      console.error(e);
      throw e;
    });

  const outcomePdas = await Promise.all(
    outcomes.map(async (_, index) => {
      const outcomePkResponse = await findMarketOutcomePda(
        protocolProgram as Program,
        marketPda,
        index,
      );
      return outcomePkResponse.data.pda;
    }),
  );

  for (let index = 0; index < outcomes.length; index++) {
    await getAnchorProvider().connection.confirmTransaction(
      await protocolProgram.methods
        .initializeMarketOutcome(outcomes[index])
        .accounts({
          systemProgram: SystemProgram.programId,
          outcome: outcomePdas[index],
          priceLadder: Array.isArray(priceLadder) ? null : priceLadder,
          market: marketPda,
          authorisedOperators: authorisedMarketOperators,
          marketOperator: marketOperator.publicKey,
        })
        .signers([marketOperator])
        .rpc()
        .catch((e) => {
          console.error(e);
          throw e;
        }),
    );

    if (Array.isArray(priceLadder)) {
      const priceLadderBatchSize = 20;
      for (let i = 0; i < priceLadder.length; i += priceLadderBatchSize) {
        const batch = priceLadder.slice(i, i + priceLadderBatchSize);
        await getAnchorProvider().connection.confirmTransaction(
          await protocolProgram.methods
            .addPricesToMarketOutcome(index, batch)
            .accounts({
              systemProgram: SystemProgram.programId,
              outcome: outcomePdas[index],
              market: marketPda,
              authorisedOperators: authorisedMarketOperators,
              marketOperator: marketOperator.publicKey,
            })
            .signers([marketOperator])
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            }),
        );
      }
    }
  }

  let prices = priceLadder;
  if (!Array.isArray(priceLadder)) {
    const priceLadderAccount = await protocolProgram.account.priceLadder.fetch(
      priceLadder,
    );
    prices = priceLadderAccount.prices;
  }
  let matchingPools: { against: PublicKey; forOutcome: PublicKey }[][] = [];
  if (initialisePools) {
    matchingPools = await Promise.all(
      outcomePdas.map(async (outcomePda, index) => {
        return await getMarketMatchingPoolsPks(
          marketPda,
          index,
          prices as number[],
        );
      }),
    );
  }

  const [
    liquiditiesPk,
    matchingQueuePk,
    commissionQueuePk,
    orderRequestQueuePk,
  ] = await Promise.all([
    findMarketLiquiditiesPda(protocolProgram, marketPda),
    findMarketMatchingQueuePda(protocolProgram, marketPda),
    findMarketCommissionPaymentQueuePda(protocolProgram, marketPda),
    findMarketOrderRequestQueuePda(protocolProgram as Program, marketPda),
  ]);

  await protocolProgram.methods
    .openMarket(false)
    .accounts({
      market: marketPda,
      liquidities: liquiditiesPk.data.pda,
      matchingQueue: matchingQueuePk.data.pda,
      commissionPaymentQueue: commissionQueuePk.data.pda,
      orderRequestQueue: orderRequestQueuePk.data.pda,
      authorisedOperators: authorisedMarketOperators,
      marketOperator: marketOperator.publicKey,
    })
    .signers([marketOperator])
    .rpc();

  return {
    marketPda,
    outcomes,
    mintPk,
    escrowPda,
    matchingQueuePda: matchingQueuePk.data.pda,
    paymentsQueuePda: commissionQueuePk.data.pda,
    outcomePdas,
    matchingPools,
    authorisedMarketOperators,
    marketOperator,
  };
}

export async function authoriseAdminOperator(
  operatorAccount: Keypair | PublicKey,
  protocolProgram: Program<MonacoProtocol>,
  provider: AnchorProvider,
) {
  const authorisedOperatorsPk = await createAuthorisedOperatorsPda(
    OperatorType.ADMIN,
  );
  const operatorPk =
    operatorAccount instanceof Keypair
      ? operatorAccount.publicKey
      : operatorAccount;

  await provider.connection.confirmTransaction(
    await protocolProgram.methods
      .authoriseAdminOperator(operatorPk)
      .accounts({
        authorisedOperators: authorisedOperatorsPk,
        adminOperator: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );

  return authorisedOperatorsPk;
}

export async function authoriseOperator(
  operatorAccount: Keypair | PublicKey,
  protocolProgram: Program<MonacoProtocol>,
  provider: AnchorProvider,
  operatorType: OperatorType,
) {
  const operatorPk =
    operatorAccount instanceof Keypair
      ? operatorAccount.publicKey
      : operatorAccount;

  const authorisedOperatorsPk = await createAuthorisedOperatorsPda(
    operatorType,
  );

  const adminOperatorsPk = await createAuthorisedOperatorsPda(
    OperatorType.ADMIN,
  );

  await protocolProgram.methods
    .authoriseOperator(OperatorType[operatorType].toUpperCase(), operatorPk)
    .accounts({
      authorisedOperators: authorisedOperatorsPk,
      adminOperator: provider.wallet.publicKey,
      adminOperators: adminOperatorsPk,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return authorisedOperatorsPk;
}

export async function createAuthorisedOperatorsPda(
  operatorType: OperatorType,
): Promise<PublicKey> {
  const program = anchor.workspace.MonacoProtocol as Program<MonacoProtocol>;
  const [authorisedOperatorsAccountPda] = await PublicKey.findProgramAddress(
    [
      Buffer.from("authorised_operators"),
      Buffer.from(OperatorType[operatorType].toUpperCase()),
    ],
    program.programId,
  );
  return authorisedOperatorsAccountPda;
}

export async function createWalletWithBalance(
  provider: Provider,
  lamportBalance = 1000000000,
) {
  const payer = Keypair.generate();
  await provider.connection.confirmTransaction(
    await provider.connection.requestAirdrop(payer.publicKey, lamportBalance),
  );
  return payer;
}

export async function createWalletsWithBalance(
  provider: Provider,
  numberOfWallets: number,
  lamportBalance = 1000000000,
) {
  const promises: Promise<Keypair>[] = [];
  for (let i = 0; i < numberOfWallets; i++) {
    promises.push(createWalletWithBalance(provider, lamportBalance));
  }
  return Promise.all(promises);
}

export async function createAssociatedTokenAccountWithBalance(
  mintPk: PublicKey,
  owner: PublicKey,
  balance: number,
): Promise<PublicKey> {
  const provider = getAnchorProvider();
  const wallet = provider.wallet as NodeWallet;
  const [associatedTokenAcc, mintInfo] = await Promise.all([
    createAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mintPk,
      owner,
    ),
    getMint(provider.connection, mintPk),
  ]);
  await mintTo(
    provider.connection,
    wallet.payer,
    mintPk,
    associatedTokenAcc,
    getAnchorProvider().wallet.publicKey, // Assumption mint was created by provider.wallet,
    balance * 10 ** mintInfo.decimals,
    [],
  );
  await new Promise((e) => setTimeout(e, 1000)); // Small wait to ensure funds added before proceeding
  return associatedTokenAcc;
}

export async function createNewMint(
  provider: Provider,
  wallet: NodeWallet,
  mint_decimals: number,
) {
  return await createMint(
    provider.connection,
    wallet.payer,
    wallet.publicKey,
    wallet.publicKey,
    mint_decimals,
  );
}

export async function processNextOrderRequest(
  marketPk: PublicKey,
  crankOperator?: Keypair | Wallet,
) {
  const protocolProgram = anchor.workspace
    .MonacoProtocol as Program<MonacoProtocol>;

  const orderRequestQueuePk = (
    await findMarketOrderRequestQueuePda(protocolProgram, marketPk)
  ).data.pda;
  const orderRequestQueue =
    await protocolProgram.account.marketOrderRequestQueue.fetch(
      orderRequestQueuePk,
    );
  const firstOrderRequest =
    orderRequestQueue.orderRequests.items[
      orderRequestQueue.orderRequests.front
    ];

  const {
    market,
    marketEscrowPk,
    marketLiquiditiesPk,
    marketMatchingQueuePk,
    marketMatchingPoolPk,
  } = await findMarketPdas(
    marketPk,
    firstOrderRequest.forOutcome,
    firstOrderRequest.marketOutcomeIndex,
    firstOrderRequest.expectedPrice,
    protocolProgram as Program<anchor.Idl>,
  );

  const orderPk = (
    await findOrderPda(
      protocolProgram,
      marketPk,
      firstOrderRequest.purchaser,
      Uint8Array.from(firstOrderRequest.distinctSeed),
    )
  ).data.orderPk;

  const purchaserTokenPk = await getAssociatedTokenAddress(
    market.mintAccount,
    firstOrderRequest.purchaser,
  );
  const marketPositionPk = await findMarketPositionPda(
    protocolProgram as Program,
    marketPk,
    firstOrderRequest.purchaser,
  );

  await protocolProgram.methods
    .processOrderRequest()
    .accounts({
      order: orderPk,
      purchaserTokenAccount: purchaserTokenPk,
      marketPosition: marketPositionPk.data.pda,
      marketMatchingPool: marketMatchingPoolPk,
      orderRequestQueue: orderRequestQueuePk,
      market: marketPk,
      marketEscrow: marketEscrowPk,
      marketLiquidities: marketLiquiditiesPk,
      marketMatchingQueue: marketMatchingQueuePk,
      crankOperator:
        crankOperator == null
          ? protocolProgram.provider.publicKey
          : crankOperator.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers(crankOperator instanceof Keypair ? [crankOperator] : [])
    .rpc()
    .catch((e) => {
      console.error(e);
      throw e;
    });

  return orderPk;
}

export async function processOrderRequests(
  marketPk: PublicKey,
  purchaser?: Keypair | Wallet,
) {
  const protocolProgram = anchor.workspace
    .MonacoProtocol as Program<MonacoProtocol>;

  const orderRequestQueuePk = (
    await findMarketOrderRequestQueuePda(protocolProgram, marketPk)
  ).data.pda;
  const orderRequestQueue =
    await protocolProgram.account.marketOrderRequestQueue.fetch(
      orderRequestQueuePk,
    );

  const orderPks: PublicKey[] = [];
  for (let i = 0; i < orderRequestQueue.orderRequests.len; i++) {
    const orderPk = await processNextOrderRequest(marketPk, purchaser);
    orderPks.push(orderPk);
  }

  return orderPks;
}

export async function retryOnException(
  promise: () => Promise<void>,
  timesToRetry = 10,
  delayMs = 100,
) {
  for (let i = 0; i < timesToRetry; i++) {
    const success = await promise()
      .then(() => {
        return true;
      })
      .catch(async (err) => {
        if (err instanceof AssertionError) {
          throw err;
        }
      });

    if (success) {
      return;
    }
    await new Promise((e) => setTimeout(e, delayMs));
  }
  assert.fail(`Failed to execute promise after ${timesToRetry} retries`);
}

export function getAnchorProvider(): AnchorProvider {
  return getProvider() as AnchorProvider;
}

export function getProtocolProductProgram(): Program<ProtocolProduct> {
  return new Program(
    JSON.parse(JSON.stringify(idl)),
    "mppFrYmM6A4Ud3AxRbGXsGisX1HUsbDfp1nrg9FQJEE",
    anchor.getProvider(),
  );
}

export async function createProtocolProduct(provider) {
  try {
    const program = getProtocolProductProgram();
    await createProduct(program as Program, "MONACO_PROTOCOL", 10.0, provider);
  } catch (e) {
    assert.equal(
      e.message,
      "failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0",
    );
  }
}

export async function createProduct(
  program: Program,
  productTitle: string,
  commissionRate = 5.0,
  provider: AnchorProvider,
) {
  const productPk = await findProductPda(productTitle, program as Program);
  await program.methods
    .createProduct(productTitle, commissionRate)
    .accounts({
      product: productPk,
      commissionEscrow: provider.wallet.publicKey,
      authority: provider.wallet.publicKey,
      payer: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc()
    .catch((e) => {
      throw e;
    });

  return productPk;
}

export async function processCommissionPayments(
  monaco: Program,
  productProgram: Program,
  marketPk: PublicKey,
) {
  const marketCommissionPaymentQueuePk = (
    await findMarketCommissionPaymentQueuePda(monaco, marketPk)
  ).data.pda;
  const marketEscrowPk = (await findEscrowPda(monaco, marketPk)).data.pda;

  const marketCommissionPaymentQueue = (
    await getMarketCommissionPaymentQueue(
      monaco,
      marketCommissionPaymentQueuePk,
    )
  ).data.account;

  if (marketCommissionPaymentQueue.commissionPayments.empty) {
    return;
  }

  const market = (await monaco.account.market.fetch(marketPk)) as MarketAccount;
  const queuedItems = toCommissionPayments(marketCommissionPaymentQueue);

  const tx = new Transaction();
  for (const item of queuedItems) {
    const productPk = item.to;
    const productEscrowPk = (
      await productProgram.account.product.fetch(productPk)
    ).commissionEscrow as PublicKey;
    const productEscrowTokenPk = await getOrCreateAssociatedTokenAccount(
      getAnchorProvider().connection,
      (getAnchorProvider().wallet as NodeWallet).payer,
      market.mintAccount,
      productEscrowPk,
      true,
    );

    tx.add(
      await monaco.methods
        .processCommissionPayment()
        .accounts({
          productEscrowToken: productEscrowTokenPk.address,
          commissionEscrow: productEscrowPk,
          product: productPk,

          commissionPaymentsQueue: marketCommissionPaymentQueuePk,
          market: marketPk,
          marketEscrow: marketEscrowPk,
        })
        .instruction(),
    );
  }

  const signer = await createWalletWithBalance(monaco.provider);
  try {
    await sendAndConfirmTransaction(monaco.provider.connection, tx, [signer]);
  } catch (e) {
    console.log(e);
  }
}

export async function executeTransactionMaxCompute(
  instructions: TransactionInstruction[],
  signer?: Keypair,
) {
  const provider = getAnchorProvider();
  if (!signer) {
    const wallet = provider.wallet as NodeWallet;
    signer = wallet.payer;
  }

  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 1400000,
    }),
  );
  instructions.forEach((instruction) => tx.add(instruction));

  return await sendAndConfirmTransaction(provider.connection, tx, [signer]);
}

export async function assertTransactionThrowsErrorCode(
  ix: TransactionInstruction,
  errorCode: string,
  signer?: Keypair,
) {
  await executeTransactionMaxCompute([ix], signer).then(
    function (_) {
      assert.fail("This test should have thrown an error");
    },
    function (err) {
      assert.ok(err.logs.toString().includes(errorCode));
    },
  );
}

export async function getOrCreateMarketType(program: Program, name: string) {
  const response = await getOrCreateMarketTypeClient(program, name);
  if (!response.success) {
    throw response.errors[0];
  }
  return response.data.publicKey;
}
