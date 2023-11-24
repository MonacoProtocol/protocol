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
  findMarketOutcomePda,
  findMarketPda,
  findMarketPositionPda,
  findOrderPda,
  findTradePda,
} from "../../npm-client/src";
import { findMarketPdas, findProductPda, findUserPdas } from "../util/pdas";
import * as assert from "assert";
import { AssertionError } from "assert";
import { ProtocolProduct } from "../anchor/protocol_product/protocol_product";
import console from "console";
import * as idl from "../anchor/protocol_product/protocol_product.json";
import {
  findCommissionPaymentsQueuePda,
  findMarketMatchingQueuePda,
  findOrderRequestQueuePda,
  PaymentInfo,
} from "../../npm-admin-client";
import { getOrCreateMarketType as getOrCreateMarketTypeClient } from "../../npm-admin-client/src/market_type_create";

const { SystemProgram } = anchor.web3;

export enum OperatorType {
  ADMIN,
  CRANK,
  MARKET,
}

export async function matchOrder(
  forPk: PublicKey,
  againstPk: PublicKey,
  marketPk: PublicKey,
  marketOutcomePk: PublicKey,
  marketMatchingPools: { forOutcome: PublicKey; against: PublicKey },
  crankOperator: Keypair,
  authorisedCrankOperatorsPk: PublicKey,
) {
  const program = anchor.workspace.MonacoProtocol;
  const protocolProgram = anchor.workspace
    .MonacoProtocol as Program<MonacoProtocol>;

  const [orderFor, orderAgainst] = await Promise.all([
    protocolProgram.account.order.fetch(forPk),
    protocolProgram.account.order.fetch(againstPk),
  ]);

  const [tradeForPK, tradeAgainstPK] = (
    await Promise.all([
      findTradePda(program, againstPk, forPk, true),
      findTradePda(program, againstPk, forPk, false),
    ])
  ).map((result) => result.data.tradePk);

  const [marketPositionForPK, marketPositionAgainstPK] = await Promise.all([
    findMarketPositionPda(
      protocolProgram as Program,
      marketPk,
      orderFor.purchaser,
    ),
    findMarketPositionPda(
      protocolProgram as Program,
      marketPk,
      orderAgainst.purchaser,
    ),
  ]);

  const market = await protocolProgram.account.market.fetch(marketPk);
  const marketEscrowPk = await findEscrowPda(
    protocolProgram as Program,
    marketPk,
  );

  const purchaserTokenAccountForPk = await getAssociatedTokenAddress(
    market.mintAccount,
    orderFor.purchaser,
  );

  const purchaserTokenAccountAgainstPk = await getAssociatedTokenAddress(
    market.mintAccount,
    orderAgainst.purchaser,
  );

  const ix = await protocolProgram.methods
    .matchOrders()
    .accounts({
      orderFor: forPk,
      tradeFor: tradeForPK,
      marketPositionFor: marketPositionForPK.data.pda,
      marketMatchingPoolFor: marketMatchingPools.forOutcome,
      purchaserTokenAccountFor: purchaserTokenAccountForPk,
      orderAgainst: againstPk,
      tradeAgainst: tradeAgainstPK,
      marketPositionAgainst: marketPositionAgainstPK.data.pda,
      marketMatchingPoolAgainst: marketMatchingPools.against,
      purchaserTokenAccountAgainst: purchaserTokenAccountAgainstPk,
      market: marketPk,
      marketOutcome: marketOutcomePk,
      marketEscrow: marketEscrowPk.data.pda,
      crankOperator: crankOperator.publicKey,
      authorisedOperators: authorisedCrankOperatorsPk,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([crankOperator])
    .instruction();

  try {
    await executeTransactionMaxCompute([ix]);
  } catch (e) {
    console.error(e);
    throw e;
  }
}

export async function getMarketMatchingPoolsPks(
  market: PublicKey,
  outcomeIndex: number,
  outcomePda: PublicKey,
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

  const matchingQueuePda = (
    await findMarketMatchingQueuePda(protocolProgram as Program, marketPda)
  ).data.pda;

  const commissionPaymentQueuePda = (
    await findCommissionPaymentsQueuePda(protocolProgram as Program, marketPda)
  ).data.pda;

  const orderRequestQueuePda = (
    await findOrderRequestQueuePda(protocolProgram as Program, marketPda)
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
      mint: mintPk,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      authorisedOperators: authorisedMarketOperators,
      marketOperator: marketOperator.publicKey,
    })
    .signers([marketOperator])
    .rpc();

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
          outcomePda,
          prices as number[],
        );
      }),
    );
  }

  const matchingQueuePk = (
    await findMarketMatchingQueuePda(protocolProgram, marketPda)
  ).data.pda;

  const commissionQueuePk = (
    await findCommissionPaymentsQueuePda(protocolProgram, marketPda)
  ).data.pda;

  await protocolProgram.methods
    .openMarket()
    .accounts({
      market: marketPda,
      matchingQueue: matchingQueuePk,
      commissionPaymentQueue: commissionQueuePk,
      orderRequestQueue: orderRequestQueuePda,
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
    matchingQueuePda,
    paymentsQueuePda: commissionPaymentQueuePda,
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

export async function createOrder(
  marketPk: PublicKey,
  purchaser: Keypair | Wallet,
  marketOutcomeIndex: number,
  forOutcome: boolean,
  marketOutcomePrice: number,
  stake: number,
  purchaserTokenAccount: PublicKey,
  productPk?: PublicKey,
) {
  await createOrderRequest(
    marketPk,
    purchaser,
    marketOutcomeIndex,
    forOutcome,
    marketOutcomePrice,
    stake,
    purchaserTokenAccount,
    productPk,
  );

  return await processNextOrderRequest(marketPk, purchaser);
}

export async function createOrderRequest(
  marketPk: PublicKey,
  purchaser: Keypair | Wallet,
  marketOutcomeIndex: number,
  forOutcome: boolean,
  marketOutcomePrice: number,
  stake: number,
  purchaserTokenAccount: PublicKey,
  productPk?: PublicKey,
) {
  const protocolProgram = anchor.workspace
    .MonacoProtocol as Program<MonacoProtocol>;

  const { uiAmountToAmount, marketEscrowPk, marketOutcomePk } =
    await findMarketPdas(
      marketPk,
      forOutcome,
      marketOutcomeIndex,
      marketOutcomePrice,
      protocolProgram as Program<anchor.Idl>,
    );

  const { orderPk, orderDistinctSeed, marketPositionPk } = await findUserPdas(
    marketPk,
    purchaser.publicKey,
    protocolProgram as Program<anchor.Idl>,
  );

  const stakeInteger = uiAmountToAmount(stake);

  const orderRequestQueuePk = await findOrderRequestQueuePda(
    protocolProgram as Program<anchor.Idl>,
    marketPk,
  );

  await protocolProgram.methods
    .createOrderRequest({
      marketOutcomeIndex: marketOutcomeIndex,
      forOutcome: forOutcome,
      stake: new BN(stakeInteger),
      price: marketOutcomePrice,
      distinctSeed: Array.from(orderDistinctSeed),
    })
    .accounts({
      reservedOrder: orderPk,
      orderRequestQueue: orderRequestQueuePk.data.pda,
      marketPosition: marketPositionPk.data.pda,
      purchaser: purchaser.publicKey,
      purchaserToken: purchaserTokenAccount,
      market: marketPk,
      marketOutcome: marketOutcomePk,
      priceLadder: null,
      marketEscrow: marketEscrowPk,
      product: productPk == undefined ? null : productPk,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers(purchaser instanceof Keypair ? [purchaser] : [])
    .rpc()
    .catch((e) => {
      console.error(e);
      throw e;
    });

  return orderPk;
}

export async function processNextOrderRequest(
  marketPk: PublicKey,
  crankOperator?: Keypair | Wallet,
) {
  const protocolProgram = anchor.workspace
    .MonacoProtocol as Program<MonacoProtocol>;

  const orderRequestQueuePk = (
    await findOrderRequestQueuePda(protocolProgram, marketPk)
  ).data.pda;
  const orderRequestQueue =
    await protocolProgram.account.marketOrderRequestQueue.fetch(
      orderRequestQueuePk,
    );
  const firstOrderRequest =
    orderRequestQueue.orderRequests.items[
      orderRequestQueue.orderRequests.front
    ];

  const marketMatchingPoolPk = (
    await findMarketMatchingPoolPda(
      protocolProgram,
      marketPk,
      firstOrderRequest.marketOutcomeIndex,
      firstOrderRequest.expectedPrice,
      firstOrderRequest.forOutcome,
    )
  ).data.pda;

  const orderPk = (
    await findOrderPda(
      protocolProgram,
      marketPk,
      firstOrderRequest.purchaser,
      Uint8Array.from(firstOrderRequest.distinctSeed),
    )
  ).data.orderPk;

  await protocolProgram.methods
    .processOrderRequest()
    .accounts({
      order: orderPk,
      marketMatchingPool: marketMatchingPoolPk,
      orderRequestQueue: orderRequestQueuePk,
      market: marketPk,
      crankOperator:
        crankOperator == null
          ? protocolProgram.provider.publicKey
          : crankOperator.publicKey,
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
    await findOrderRequestQueuePda(protocolProgram, marketPk)
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

export async function cancelOrderSmart(orderPk: PublicKey, purchaser: Keypair) {
  const protocolProgram = anchor.workspace
    .MonacoProtocol as Program<MonacoProtocol>;

  const order = await protocolProgram.account.order.fetch(orderPk);
  const { market, marketEscrowPk, marketMatchingPoolPk } = await findMarketPdas(
    order.market,
    order.forOutcome,
    order.marketOutcomeIndex,
    order.expectedPrice,
    protocolProgram as Program<anchor.Idl>,
  );

  const purchaserTokenPk = await getAssociatedTokenAddress(
    market.mintAccount,
    purchaser.publicKey,
  );
  const marketPositionPk = await findMarketPositionPda(
    protocolProgram as Program,
    order.market,
    order.purchaser,
  );

  await protocolProgram.methods
    .cancelOrder()
    .accounts({
      order: orderPk,
      marketPosition: marketPositionPk.data.pda,
      purchaser: purchaser.publicKey,
      purchaserTokenAccount: purchaserTokenPk,
      marketMatchingPool: marketMatchingPoolPk,
      market: order.market,
      marketEscrow: marketEscrowPk,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([purchaser])
    .rpc()
    .catch((e) => {
      console.error(e);
      throw e;
    });
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
  const commissionQueuePk = (
    await findCommissionPaymentsQueuePda(monaco, marketPk)
  ).data.pda;
  const marketEscrowPk = (await findEscrowPda(monaco, marketPk)).data.pda;

  const queue = (
    await monaco.account.marketPaymentsQueue.fetch(commissionQueuePk)
  ).paymentQueue;
  if (queue.len == 0) {
    return;
  }

  const market = await monaco.account.market.fetch(marketPk);
  const queuedItems = getPaymentInfoQueueItems(queue);

  const tx = new Transaction();
  for (const item of queuedItems) {
    const productPk = item.to;
    const productEscrowPk = (
      await productProgram.account.product.fetch(productPk)
    ).commissionEscrow;
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

          commissionPaymentsQueue: commissionQueuePk,
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

export function getPaymentInfoQueueItems(queue): PaymentInfo[] {
  const frontIndex = queue.front;
  const allItems = queue.items;
  const backIndex = frontIndex + (queue.len % queue.items.length);

  let queuedItems: PaymentInfo[] = [];
  if (queue.len > 0) {
    if (backIndex <= frontIndex) {
      // queue bridges array
      queuedItems = allItems
        .slice(frontIndex)
        .concat(allItems.slice(0, backIndex));
    } else {
      // queue can be treated as normal array
      queuedItems = allItems.slice(frontIndex, backIndex);
    }
  }
  return queuedItems;
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
