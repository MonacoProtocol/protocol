import { Keypair, PublicKey } from "@solana/web3.js";
import {
  Mint,
  TOKEN_PROGRAM_ID,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { MonacoProtocol } from "../../target/types/monaco_protocol";
import {
  findEscrowPda,
  findMarketOutcomePda,
  findMarketPositionPda,
  findTradePda,
  findMarketPda,
  MarketType,
} from "../../npm-client/src/";
import {
  authoriseOperator,
  createOrder,
  getMarketMatchingPoolsPks,
  createNewMint,
  OperatorType,
  getProtocolProductProgram,
  processCommissionPayments,
  executeTransactionMaxCompute,
} from "../util/test_util";
import { findAuthorisedOperatorsPda, findProductPda } from "../util/pdas";
import { ProtocolProduct } from "../anchor/protocol_product/protocol_product";
import { findCommissionPaymentsQueuePda } from "../../npm-admin-client";

const { SystemProgram } = anchor.web3;

const TOKEN_DECIMALS = 6;

export let monaco: Monaco;
export let externalPrograms: ExternalPrograms;

beforeAll(async () => {
  // Programs
  monaco = new Monaco(
    anchor.getProvider() as anchor.AnchorProvider,
    anchor.workspace.MonacoProtocol,
  );

  externalPrograms = new ExternalPrograms(
    anchor.getProvider() as anchor.AnchorProvider,
    getProtocolProductProgram(),
  );
});

export class Monaco {
  readonly provider: anchor.AnchorProvider;
  readonly program: Program<MonacoProtocol>;
  readonly operatorPk: PublicKey;
  readonly operatorWallet: NodeWallet;

  private marketAuthorisedOperatorsPk: PublicKey;
  private crankAuthorisedOperatorsPk: PublicKey;

  constructor(
    provider: anchor.AnchorProvider,
    program: Program<MonacoProtocol>,
  ) {
    this.provider = provider;
    this.program = program;
    this.operatorPk = provider.wallet.publicKey;
    this.operatorWallet = provider.wallet as NodeWallet;
  }

  getRawProgram(): Program {
    return this.program as Program;
  }

  async findMarketAuthorisedOperatorsPda() {
    if (!this.marketAuthorisedOperatorsPk) {
      this.marketAuthorisedOperatorsPk = await findAuthorisedOperatorsPda(
        "MARKET",
        this.program as Program,
      );
    }
    return this.marketAuthorisedOperatorsPk;
  }

  async findCrankAuthorisedOperatorsPda() {
    if (!this.crankAuthorisedOperatorsPk) {
      this.crankAuthorisedOperatorsPk = await findAuthorisedOperatorsPda(
        "CRANK",
        this.program as Program,
      );
    }
    return this.crankAuthorisedOperatorsPk;
  }

  async fetchOrder(orderPk: PublicKey) {
    return await this.program.account.order.fetch(orderPk);
  }

  async fetchMarketPosition(marketPositionPk: PublicKey) {
    return await this.program.account.marketPosition.fetch(marketPositionPk);
  }

  async fetchTrade(tradePk: PublicKey) {
    return await this.program.account.trade.fetch(tradePk);
  }

  async fetchMarket(marketPk: PublicKey) {
    return await this.program.account.market.fetch(marketPk);
  }

  async fetchMarketOutcome(marketOutcomePk: PublicKey) {
    return await this.program.account.marketOutcome.fetch(marketOutcomePk);
  }

  async fetchMarketMatchingPool(marketMatchingPoolPk: PublicKey) {
    return await this.program.account.marketMatchingPool.fetch(
      marketMatchingPoolPk,
    );
  }

  async getTokenBalance(tokenPk: PublicKey) {
    const result = await this.provider.connection.getTokenAccountBalance(
      tokenPk,
    );
    return result.value.uiAmount;
  }

  async getMarketPosition(
    marketPositionPk: PublicKey,
    decimals = TOKEN_DECIMALS,
  ) {
    const decimalsMultiplayer = 10 ** decimals;
    const marketPosition = await this.program.account.marketPosition.fetch(
      marketPositionPk,
    );
    return {
      matched: marketPosition.marketOutcomeSums.map(
        (bn) => bn.toNumber() / decimalsMultiplayer,
      ),
      maxExposure: marketPosition.outcomeMaxExposure.map(
        (bn) => bn.toNumber() / decimalsMultiplayer,
      ),
    };
  }

  async getMarket(marketPk: PublicKey) {
    const market = await this.fetchMarket(marketPk);
    return {
      marketStatus: market.marketStatus,
      inplayEnabled: market.inplayEnabled,
      inplayOrderDelay: market.inplayOrderDelay,
      eventStartTimestamp: market.eventStartTimestamp.toNumber(),
    };
  }

  async getMarketOutcome(marketOutcomePk: PublicKey) {
    const marketOutcome = await this.fetchMarketOutcome(marketOutcomePk);
    return {
      title: marketOutcome.title,
      price: marketOutcome.priceLadder,
    };
  }

  async getMarketMatchingPool(
    marketMatchingPoolPk: PublicKey,
    decimals = TOKEN_DECIMALS,
  ) {
    const decimalsMultiplayer = 10 ** decimals;
    const marketMatchingPool = await this.fetchMarketMatchingPool(
      marketMatchingPoolPk,
    );
    return {
      len: marketMatchingPool.orders.len,
      liquidity:
        marketMatchingPool.liquidityAmount.toNumber() / decimalsMultiplayer,
      matched:
        marketMatchingPool.matchedAmount.toNumber() / decimalsMultiplayer,
    };
  }

  async getOrder(orderPk: PublicKey, decimals = TOKEN_DECIMALS) {
    const decimalsMultiplayer = 10 ** decimals;
    const order = await this.program.account.order.fetch(orderPk);
    return {
      status: order.orderStatus,
      stakeUnmatched: order.stakeUnmatched.toNumber() / decimalsMultiplayer,
      stakeVoided: order.voidedStake.toNumber() / decimalsMultiplayer,
    };
  }

  async authoriseCrankOperator(operator: Keypair) {
    await authoriseOperator(
      operator,
      this.program,
      this.provider,
      OperatorType.CRANK,
    );
  }

  async authoriseMarketOperator(operator: Keypair) {
    await authoriseOperator(
      operator,
      this.program,
      this.provider,
      OperatorType.MARKET,
    );
  }

  async create3WayMarket(
    priceLadder: number[],
    inplayEnabled = false,
    inplayDelay = 0,
    eventStartTimestamp?: number,
    marketLockTimestamp?: number,
    eventStartOrderBehaviour?: object,
  ) {
    const market = await this.createMarket(
      ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
      priceLadder,
      null,
      inplayEnabled,
      inplayDelay,
      eventStartTimestamp,
      marketLockTimestamp,
      eventStartOrderBehaviour,
    );
    await market.open();
    return market;
  }

  async create3WayMarketWithInplay(priceLadder: number[]) {
    const market = await this.createMarket(
      ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
      priceLadder,
      null,
      true,
    );
    await market.open();
    return market;
  }

  async createMarket(
    outcomes: string[],
    priceLadder: number[],
    marketOperatorKeypair?: Keypair,
    inplayEnabled?: boolean,
    inplayDelay?: number,
    eventStartTimestamp = 1924254038,
    marketLockTimestamp = 1924254038,
    eventStartOrderBehaviour: object = { cancelUnmatched: {} },
  ) {
    const event = anchor.web3.Keypair.generate();
    const marketType = MarketType.EventResultWinner;
    const marketTitle = "SOME TITLE";
    const decimals = 3;

    const [mintPk, authorisedOperatorsPk] = await Promise.all([
      createNewMint(
        this.provider,
        this.provider.wallet as NodeWallet,
        decimals + 3,
      ),
      this.findMarketAuthorisedOperatorsPda(),
    ]);

    const mintInfo = await getMint(this.provider.connection, mintPk);

    const marketPdaResponse = await findMarketPda(
      this.program as Program,
      event.publicKey,
      marketType,
      mintPk,
    );

    const marketEscrowPk = await findEscrowPda(
      this.program as Program,
      marketPdaResponse.data.pda,
    );

    const commissionQueuePk = await findCommissionPaymentsQueuePda(
      this.program as Program,
      marketPdaResponse.data.pda,
    );

    // invoke core program to call operations required for creating an order
    await this.program.methods
      .createMarketV2(
        event.publicKey,
        marketType,
        marketTitle,
        new anchor.BN(marketLockTimestamp),
        decimals,
        new anchor.BN(eventStartTimestamp),
        inplayEnabled,
        inplayDelay,
        eventStartOrderBehaviour,
        { none: {} },
      )
      .accounts({
        market: marketPdaResponse.data.pda,
        escrow: marketEscrowPk.data.pda,
        commissionPaymentQueue: commissionQueuePk.data.pda,
        mint: mintPk,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        authorisedOperators: authorisedOperatorsPk,
        marketOperator:
          marketOperatorKeypair instanceof Keypair
            ? marketOperatorKeypair.publicKey
            : this.operatorPk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers(
        marketOperatorKeypair instanceof Keypair ? [marketOperatorKeypair] : [],
      )
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const outcomePks = await Promise.all(
      outcomes.map(async (_, index) => {
        const outcomePkResponse = await findMarketOutcomePda(
          this.program as Program,
          marketPdaResponse.data.pda,
          index,
        );
        return outcomePkResponse.data.pda;
      }),
    );

    for (const outcomeIndex in outcomes) {
      await this.provider.connection.confirmTransaction(
        await this.program.methods
          .initializeMarketOutcome(outcomes[outcomeIndex])
          .accounts({
            outcome: outcomePks[outcomeIndex],
            market: marketPdaResponse.data.pda,
            authorisedOperators: authorisedOperatorsPk,
            marketOperator:
              marketOperatorKeypair instanceof Keypair
                ? marketOperatorKeypair.publicKey
                : this.operatorPk,
            systemProgram: SystemProgram.programId,
          })
          .signers(
            marketOperatorKeypair instanceof Keypair
              ? [marketOperatorKeypair]
              : [],
          )
          .rpc()
          .catch((e) => {
            console.error(e);
            throw e;
          }),
        "confirmed",
      );

      const priceLadderBatchSize = 20;
      for (let i = 0; i < priceLadder.length; i += priceLadderBatchSize) {
        const batch = priceLadder.slice(i, i + priceLadderBatchSize);
        await this.provider.connection.confirmTransaction(
          await this.program.methods
            .addPricesToMarketOutcome(parseInt(outcomeIndex), batch)
            .accounts({
              outcome: outcomePks[outcomeIndex],
              market: marketPdaResponse.data.pda,
              authorisedOperators: authorisedOperatorsPk,
              marketOperator:
                marketOperatorKeypair instanceof Keypair
                  ? marketOperatorKeypair.publicKey
                  : this.operatorPk,
              systemProgram: SystemProgram.programId,
            })
            .signers(
              marketOperatorKeypair instanceof Keypair
                ? [marketOperatorKeypair]
                : [],
            )
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            }),
          "confirmed",
        );
      }
    }

    let matchingPools: { against: PublicKey; forOutcome: PublicKey }[][] = [];
    matchingPools = await Promise.all(
      outcomePks.map(async (outcomePk, index) => {
        return await getMarketMatchingPoolsPks(
          marketPdaResponse.data.pda,
          index,
          outcomePk,
          priceLadder,
        );
      }),
    );

    const bmarket = new MonacoMarket(
      this,
      externalPrograms,
      marketPdaResponse.data.pda,
      marketEscrowPk.data.pda,
      commissionQueuePk.data.pda,
      outcomePks,
      matchingPools,
      event.publicKey,
      mintPk,
      mintInfo,
      marketOperatorKeypair,
    );
    return bmarket;
  }
}

export class MonacoMarket {
  private monaco: Monaco;
  private externalPrograms: ExternalPrograms;
  readonly pk: PublicKey;
  readonly escrowPk: PublicKey;
  readonly paymentsQueuePk: PublicKey;
  readonly outcomePks: PublicKey[];
  readonly matchingPools: {
    against: PublicKey;
    forOutcome: PublicKey;
  }[][];
  readonly eventPk: PublicKey;
  readonly mintPk: PublicKey;
  readonly mintInfo: Mint;
  readonly marketAuthority?: Keypair;

  private purchaserTokenPks = new Map<string, PublicKey>();
  private marketPositionPkCache = new Map<string, PublicKey>();

  private protocolConfigPk: PublicKey;
  private protocolCommissionEscrowPk: PublicKey;
  private productEscrowCache = new Map<PublicKey, PublicKey>();

  constructor(
    monaco: Monaco,
    externalPrograms: ExternalPrograms,
    pk: PublicKey,
    escrowPk: PublicKey,
    paymentsQueuePk: PublicKey,
    outcomePks: PublicKey[],
    matchingPools: {
      against: PublicKey;
      forOutcome: PublicKey;
    }[][],
    eventPk: PublicKey,
    mintPk: PublicKey,
    mintInfo: Mint,
    marketAuthority?: Keypair,
  ) {
    this.monaco = monaco;
    this.externalPrograms = externalPrograms;
    this.pk = pk;
    this.escrowPk = escrowPk;
    this.paymentsQueuePk = paymentsQueuePk;
    this.outcomePks = outcomePks;
    this.matchingPools = matchingPools;
    this.eventPk = eventPk;
    this.mintPk = mintPk;
    this.mintInfo = mintInfo;
    this.marketAuthority = marketAuthority;
  }

  async getAccount() {
    return this.monaco.fetchMarket(this.pk);
  }

  toAmountInteger(amount: number): number {
    return amount * 10 ** this.mintInfo.decimals;
  }

  async cacheMarketPositionPk(purchaserPk: PublicKey) {
    let marketPositionPk = this.marketPositionPkCache.get(
      purchaserPk.toBase58(),
    );
    if (marketPositionPk == undefined) {
      const marketPositionPkResponse = await findMarketPositionPda(
        this.monaco.program as Program,
        this.pk,
        purchaserPk,
      );
      marketPositionPk = marketPositionPkResponse.data.pda;
      this.marketPositionPkCache.set(purchaserPk.toBase58(), marketPositionPk);
    }
    return marketPositionPk;
  }

  async cachePurchaserTokenPk(purchaserPk: PublicKey) {
    let purchaserTokenPk = this.purchaserTokenPks.get(purchaserPk.toBase58());
    const wallet = this.monaco.provider.wallet as NodeWallet;
    const provider = this.monaco.provider;
    if (purchaserTokenPk == undefined) {
      purchaserTokenPk = (
        await getOrCreateAssociatedTokenAccount(
          provider.connection,
          wallet.payer,
          this.mintPk,
          purchaserPk,
        )
      ).address;
      this.purchaserTokenPks.set(purchaserPk.toBase58(), purchaserTokenPk);
    }
    return purchaserTokenPk;
  }

  async airdrop(purchaser: Keypair, balance: number) {
    const purchaserTokenPk = await this.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const wallet = this.monaco.provider.wallet as NodeWallet;
    const provider = this.monaco.provider;
    await mintTo(
      provider.connection,
      wallet.payer,
      this.mintInfo.address,
      purchaserTokenPk,
      this.monaco.provider.wallet.publicKey, // Assume mint was created by provider.wallet
      balance * 10 ** this.mintInfo.decimals,
    );
    return purchaserTokenPk;
  }

  async airdropProvider(balance: number) {
    const purchaserTokenPk = await this.cachePurchaserTokenPk(
      this.monaco.provider.wallet.publicKey,
    );
    const wallet = this.monaco.provider.wallet as NodeWallet;
    const provider = this.monaco.provider;
    await mintTo(
      provider.connection,
      wallet.payer,
      this.mintInfo.address,
      purchaserTokenPk,
      this.monaco.provider.wallet.publicKey, // Assume mint was created by provider.wallet
      balance * 10 ** this.mintInfo.decimals,
    );
    return purchaserTokenPk;
  }

  async getEscrowBalance() {
    return await this.monaco.getTokenBalance(this.escrowPk);
  }

  async getTokenBalance(purchaser: Keypair | PublicKey) {
    const purchaserTokenPk = await this.cachePurchaserTokenPk(
      purchaser instanceof Keypair ? purchaser.publicKey : purchaser,
    );
    return await this.monaco.getTokenBalance(purchaserTokenPk);
  }

  async getMarketPosition(purchaser: Keypair) {
    const marketPositionPk = await this.cacheMarketPositionPk(
      purchaser.publicKey,
    );
    return await this.monaco.getMarketPosition(
      marketPositionPk,
      this.mintInfo.decimals,
    );
  }

  async getForMatchingPool(outcome: number, price: number) {
    const matchingPool = this.matchingPools[outcome][price];
    return await this.monaco.getMarketMatchingPool(
      matchingPool.forOutcome,
      this.mintInfo.decimals,
    );
  }

  async getAgainstMatchingPool(outcome: number, price: number) {
    const matchingPool = this.matchingPools[outcome][price];
    return await this.monaco.getMarketMatchingPool(
      matchingPool.against,
      this.mintInfo.decimals,
    );
  }

  async getMarketOutcome(outcome: number) {
    return await this.monaco.getMarketOutcome(this.outcomePks[outcome]);
  }

  async forOrder(
    outcome: number,
    stake: number,
    price: number,
    purchaser: Keypair,
    productPk?: PublicKey,
  ) {
    const purchaserTokenPk = await this.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const result = await createOrder(
      this.pk,
      purchaser,
      outcome,
      true,
      price,
      stake,
      purchaserTokenPk,
      productPk,
    );
    await new Promise((e) => setTimeout(e, 1000));
    return result;
  }

  async againstOrder(
    outcome: number,
    stake: number,
    price: number,
    purchaser: Keypair,
    productPk?: PublicKey,
  ) {
    const purchaserTokenPk = await this.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const result = await createOrder(
      this.pk,
      purchaser,
      outcome,
      false,
      price,
      stake,
      purchaserTokenPk,
      productPk,
    );
    await new Promise((e) => setTimeout(e, 1000));
    return result;
  }

  async cancel(orderPk: PublicKey, purchaser: Keypair) {
    const [order] = await Promise.all([this.monaco.fetchOrder(orderPk)]);
    const purchaserTokenPk = await this.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const matchingPoolPk = order.forOutcome
      ? this.matchingPools[order.marketOutcomeIndex][order.expectedPrice]
          .forOutcome
      : this.matchingPools[order.marketOutcomeIndex][order.expectedPrice]
          .against;
    await this.monaco.program.methods
      .cancelOrder()
      .accounts({
        order: orderPk,
        marketPosition: await this.cacheMarketPositionPk(purchaser.publicKey),
        purchaser: purchaser.publicKey,
        purchaserTokenAccount: purchaserTokenPk,
        market: this.pk,
        marketEscrow: this.escrowPk,
        marketMatchingPool: matchingPoolPk,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([purchaser])
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async cancelPreplayOrderPostEventStart(orderPk: PublicKey) {
    const [order] = await Promise.all([this.monaco.fetchOrder(orderPk)]);
    const purchaserTokenPk = await this.cachePurchaserTokenPk(order.purchaser);
    const matchingPoolPk = order.forOutcome
      ? this.matchingPools[order.marketOutcomeIndex][order.expectedPrice]
          .forOutcome
      : this.matchingPools[order.marketOutcomeIndex][order.expectedPrice]
          .against;
    await this.monaco.program.methods
      .cancelPreplayOrderPostEventStart()
      .accounts({
        order: orderPk,
        marketPosition: await this.cacheMarketPositionPk(order.purchaser),
        purchaser: order.purchaser,
        purchaserToken: purchaserTokenPk,
        market: this.pk,
        marketEscrow: this.escrowPk,
        marketMatchingPool: matchingPoolPk,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async match(
    forOrderPk: PublicKey,
    againstOrderPk: PublicKey,
    crankOperatorKeypair?: Keypair,
  ) {
    const [forOrder, againstOrder, authorisedOperatorsPk] = await Promise.all([
      this.monaco.fetchOrder(forOrderPk),
      this.monaco.fetchOrder(againstOrderPk),
      this.monaco.findCrankAuthorisedOperatorsPda(),
    ]);

    const forPurchaserTokenPk = await this.cachePurchaserTokenPk(
      forOrder.purchaser,
    );
    const againstPurchaserTokenPk = await this.cachePurchaserTokenPk(
      againstOrder.purchaser,
    );
    const outcomePk = this.outcomePks[forOrder.marketOutcomeIndex];
    const forMatchingPoolPk =
      this.matchingPools[forOrder.marketOutcomeIndex][forOrder.expectedPrice]
        .forOutcome;
    const againstMatchingPoolPk =
      this.matchingPools[againstOrder.marketOutcomeIndex][
        againstOrder.expectedPrice
      ].against;

    const [forTradePk, againstTradePk] = (
      await Promise.all([
        findTradePda(
          this.monaco.getRawProgram(),
          againstOrderPk,
          forOrderPk,
          true,
        ),
        findTradePda(
          this.monaco.getRawProgram(),
          againstOrderPk,
          forOrderPk,
          false,
        ),
      ])
    ).map((result) => result.data.tradePk);

    const ix = await this.monaco.program.methods
      .matchOrders()
      .accounts({
        orderFor: forOrderPk,
        orderAgainst: againstOrderPk,
        tradeFor: forTradePk,
        tradeAgainst: againstTradePk,
        marketPositionFor: await this.cacheMarketPositionPk(forOrder.purchaser),
        marketPositionAgainst: await this.cacheMarketPositionPk(
          againstOrder.purchaser,
        ),
        purchaserTokenAccountFor: forPurchaserTokenPk,
        purchaserTokenAccountAgainst: againstPurchaserTokenPk,
        market: this.pk,
        marketEscrow: this.escrowPk,
        marketOutcome: outcomePk,
        marketMatchingPoolFor: forMatchingPoolPk,
        marketMatchingPoolAgainst: againstMatchingPoolPk,
        crankOperator:
          crankOperatorKeypair instanceof Keypair
            ? crankOperatorKeypair.publicKey
            : this.monaco.operatorPk,
        authorisedOperators: authorisedOperatorsPk,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers(
        crankOperatorKeypair instanceof Keypair ? [crankOperatorKeypair] : [],
      )
      .instruction();

    try {
      await executeTransactionMaxCompute(
        [ix],
        crankOperatorKeypair instanceof Keypair ? crankOperatorKeypair : null,
      );
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  async settle(outcome: number) {
    const authorisedOperatorsPk =
      await this.monaco.findMarketAuthorisedOperatorsPda();

    await this.monaco.program.methods
      .settleMarket(outcome)
      .accounts({
        market: this.pk,
        marketOperator: this.marketAuthority
          ? this.marketAuthority.publicKey
          : this.monaco.operatorPk,
        authorisedOperators: authorisedOperatorsPk,
      })
      .signers(this.marketAuthority ? [this.marketAuthority] : [])
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async voidMarket() {
    const authorisedOperatorsPk =
      await this.monaco.findMarketAuthorisedOperatorsPda();

    await this.monaco.program.methods
      .voidMarket()
      .accounts({
        market: this.pk,
        marketOperator: this.marketAuthority
          ? this.marketAuthority.publicKey
          : this.monaco.operatorPk,
        authorisedOperators: authorisedOperatorsPk,
      })
      .signers(this.marketAuthority ? [this.marketAuthority] : [])
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async voidOrder(orderPk: PublicKey) {
    await this.monaco.program.methods
      .voidOrder()
      .accounts({
        market: this.pk,
        order: orderPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async cacheProductCommissionEscrowPk(productPk: PublicKey) {
    if (this.productEscrowCache.get(productPk) == undefined) {
      const wallet = this.monaco.provider.wallet as NodeWallet;
      const product =
        await this.externalPrograms.protocolProduct.account.product.fetch(
          productPk,
        );
      const productCommissionTokenAccount =
        await getOrCreateAssociatedTokenAccount(
          this.monaco.provider.connection,
          wallet.payer,
          this.mintPk,
          product.commissionEscrow,
        );
      this.productEscrowCache.set(
        productPk,
        productCommissionTokenAccount.address,
      );
    }

    return this.productEscrowCache.get(productPk);
  }

  async cacheProtocolCommissionPks() {
    if (
      this.protocolConfigPk == undefined ||
      this.protocolCommissionEscrowPk == undefined
    ) {
      const wallet = this.monaco.provider.wallet as NodeWallet;
      const productPk = await findProductPda(
        "MONACO_PROTOCOL",
        this.externalPrograms.protocolProduct as Program,
      );
      const protocolConfig =
        await this.externalPrograms.protocolProduct.account.product.fetch(
          productPk,
        );
      const protocolCommissionTokenAccount =
        await getOrCreateAssociatedTokenAccount(
          this.monaco.provider.connection,
          wallet.payer,
          this.mintPk,
          protocolConfig.commissionEscrow,
        );

      this.protocolConfigPk = productPk;
      this.protocolCommissionEscrowPk = protocolCommissionTokenAccount.address;
    }

    return {
      protocolConfigPk: this.protocolConfigPk,
      protocolCommissionEscrowPk: this.protocolCommissionEscrowPk,
    };
  }

  async settleOrder(orderPk: PublicKey) {
    const [order, authorisedOperatorsPk] = await Promise.all([
      this.monaco.fetchOrder(orderPk),
      await this.monaco.findCrankAuthorisedOperatorsPda(),
    ]);

    await this.monaco.program.methods
      .settleOrder()
      .accounts({
        order: orderPk,
        market: this.pk,
        purchaser: order.purchaser,
        crankOperator: this.monaco.operatorPk,
        authorisedOperators: authorisedOperatorsPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async open() {
    await this.monaco.program.methods
      .openMarket()
      .accounts({
        market: this.pk,
        authorisedOperators:
          await this.monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: this.marketAuthority
          ? this.marketAuthority.publicKey
          : this.monaco.operatorPk,
      })
      .signers(this.marketAuthority ? [this.marketAuthority] : [])
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async updateMarketEventStartTimeToNow() {
    await this.monaco.program.methods
      .updateMarketEventStartTimeToNow()
      .accounts({
        market: this.pk,
        authorisedOperators:
          await this.monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: this.marketAuthority
          ? this.marketAuthority.publicKey
          : this.monaco.operatorPk,
      })
      .signers(this.marketAuthority ? [this.marketAuthority] : [])
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async moveMarketToInplay() {
    await this.monaco.program.methods
      .moveMarketToInplay()
      .accounts({
        market: this.pk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async moveMarketMatchingPoolToInplay(
    outcomeIndex: number,
    price: number,
    forOutcome: boolean,
  ) {
    const marketMatchingPool = forOutcome
      ? this.matchingPools[outcomeIndex][price].forOutcome
      : this.matchingPools[outcomeIndex][price].against;
    await this.monaco.program.methods
      .moveMarketMatchingPoolToInplay()
      .accounts({
        market: this.pk,
        marketMatchingPool,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async completeSettlement() {
    await this.monaco.program.methods
      .completeMarketSettlement()
      .accounts({
        market: this.pk,
        crankOperator: this.monaco.operatorPk,
        authorisedOperators:
          await this.monaco.findCrankAuthorisedOperatorsPda(),
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async completeVoid() {
    await this.monaco.program.methods
      .completeMarketVoid()
      .accounts({
        market: this.pk,
        crankOperator: this.monaco.operatorPk,
        authorisedOperators:
          await this.monaco.findCrankAuthorisedOperatorsPda(),
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async readyToClose() {
    await this.monaco.program.methods
      .setMarketReadyToClose()
      .accounts({
        market: this.pk,
        marketEscrow: this.escrowPk,
        marketOperator: this.marketAuthority
          ? this.marketAuthority.publicKey
          : this.monaco.operatorPk,
        authorisedOperators:
          await this.monaco.findMarketAuthorisedOperatorsPda(),
      })
      .signers(this.marketAuthority ? [this.marketAuthority] : [])
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async settleMarketPositionForPurchaser(purchaser: PublicKey) {
    const marketPositionPk = await this.cacheMarketPositionPk(purchaser);
    const authorisedOperatorsPk =
      await this.monaco.findCrankAuthorisedOperatorsPda();
    const purchaserTokenPk = await this.cachePurchaserTokenPk(purchaser);
    const protocolCommissionPks = await this.cacheProtocolCommissionPks();

    await this.monaco.program.methods
      .settleMarketPosition()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        market: this.pk,
        purchaserTokenAccount: purchaserTokenPk,
        marketPosition: marketPositionPk,
        marketEscrow: this.escrowPk,
        commissionPaymentQueue: this.paymentsQueuePk,
        crankOperator: this.monaco.operatorPk,
        authorisedOperators: authorisedOperatorsPk,
        protocolConfig: protocolCommissionPks.protocolConfigPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    await this.processCommissionPayments();
  }

  async processCommissionPayments() {
    await processCommissionPayments(
      this.monaco.getRawProgram(),
      this.externalPrograms.protocolProduct as Program,
      this.pk,
    );
  }

  async processDelayExpiredOrders(
    outcomeIndex: number,
    price: number,
    forOutcome: boolean,
  ) {
    const matchingPools = this.matchingPools[outcomeIndex][price];
    const marketMatchingPool = forOutcome
      ? matchingPools.forOutcome
      : matchingPools.against;
    try {
      await this.monaco.program.methods
        .processDelayExpiredOrders()
        .accounts({
          market: this.pk,
          marketMatchingPool,
        })
        .rpc();
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  async voidMarketPositionForPurchaser(purchaser: PublicKey) {
    const marketPositionPk = await this.cacheMarketPositionPk(purchaser);
    const authorisedOperatorsPk =
      await this.monaco.findCrankAuthorisedOperatorsPda();
    const purchaserTokenPk = await this.cachePurchaserTokenPk(purchaser);

    await this.monaco.program.methods
      .voidMarketPosition()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        market: this.pk,
        purchaserTokenAccount: purchaserTokenPk,
        marketPosition: marketPositionPk,
        marketEscrow: this.escrowPk,
        crankOperator: this.monaco.operatorPk,
        authorisedOperators: authorisedOperatorsPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }
}

export class ExternalPrograms {
  readonly provider: anchor.AnchorProvider;

  readonly protocolProduct: Program<ProtocolProduct>;

  constructor(
    provider: anchor.AnchorProvider,
    protocolProduct: Program<ProtocolProduct>,
  ) {
    this.provider = provider;
    this.protocolProduct = protocolProduct;
  }

  async createProduct(
    productTitle: string,
    commissionRate: number,
    authority?: Keypair,
  ) {
    const defaultAuthority = authority == undefined;
    const productPk = await findProductPda(
      productTitle,
      this.protocolProduct as Program,
    );
    await this.protocolProduct.methods
      .createProduct(productTitle, commissionRate)
      .accounts({
        product: productPk,
        commissionEscrow: Keypair.generate().publicKey,
        authority: defaultAuthority
          ? monaco.provider.publicKey
          : authority.publicKey,
        payer: monaco.provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(defaultAuthority ? [] : [authority])
      .rpc()
      .catch((e) => {
        throw e;
      });

    return productPk;
  }

  async updateProductCommission(
    productTitle: string,
    commissionRate: number,
    authority?: Keypair,
  ) {
    const defaultAuthority = authority == undefined;
    const productPk = await findProductPda(
      productTitle,
      this.protocolProduct as Program,
    );

    await this.protocolProduct.methods
      .updateProductCommissionRate(productTitle, commissionRate)
      .accounts({
        product: productPk,
        authority: defaultAuthority
          ? monaco.provider.publicKey
          : authority.publicKey,
      })
      .signers(defaultAuthority ? [] : [authority])
      .rpc()
      .catch((e) => {
        throw e;
      });
  }
}
