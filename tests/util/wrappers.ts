import { Keypair, PublicKey } from "@solana/web3.js";
import {
  getMint,
  getOrCreateAssociatedTokenAccount,
  Mint,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { MonacoProtocol } from "../../target/types/monaco_protocol";
import {
  findEscrowPda,
  findMarketOutcomePda,
  findMarketPda,
  findMarketPositionPda,
  findOrderPda,
  findTradePda,
} from "../../npm-client/src/";
import {
  authoriseOperator,
  createNewMint,
  executeTransactionMaxCompute,
  getMarketMatchingPoolsPks,
  getOrCreateMarketType,
  getProtocolProductProgram,
  OperatorType,
  processCommissionPayments,
} from "../util/test_util";
import { findAuthorisedOperatorsPda, findProductPda } from "../util/pdas";
import { ProtocolProduct } from "../anchor/protocol_product/protocol_product";
import {
  createPriceLadderWithPrices,
  findMarketLiquiditiesPda,
  findMarketCommissionPaymentQueuePda,
  findMarketOrderRequestQueuePda,
  findMarketMatchingQueuePda,
  findPriceLadderPda,
  MarketAccount,
  findMarketFundingPda,
} from "../../npm-admin-client";
import console from "console";
import { MarketMatchingPoolAccount } from "../../npm-client/types";

const { SystemProgram } = anchor.web3;

const TOKEN_DECIMALS = 6;

export let monaco: Monaco;
export let externalPrograms: ExternalPrograms;

beforeAll(async () => {
  const provider = anchor.AnchorProvider.local();

  // Programs
  monaco = new Monaco(provider, anchor.workspace.MonacoProtocol);

  externalPrograms = new ExternalPrograms(
    provider,
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
  private defaultPriceLadderPk: PublicKey;

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

  async fetchMarketOrderRequestQueue(pk: PublicKey) {
    return await this.program.account.marketOrderRequestQueue.fetch(pk);
  }

  async fetchMarketMatchingQueue(pk: PublicKey) {
    return await this.program.account.marketMatchingQueue.fetch(pk);
  }

  async fetchMarketMatchingPool(marketMatchingPoolPk: PublicKey) {
    return (await this.program.account.marketMatchingPool.fetch(
      marketMatchingPoolPk,
    )) as MarketMatchingPoolAccount;
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
    const decimalsMultiplier = 10 ** decimals;
    const marketPosition = await this.program.account.marketPosition.fetch(
      marketPositionPk,
    );
    return {
      matched: marketPosition.marketOutcomeSums.map(
        (bn) => bn.toNumber() / decimalsMultiplier,
      ),
      unmatched: marketPosition.unmatchedExposures.map(
        (bn) => bn.toNumber() / decimalsMultiplier,
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

  async getMarketOrderRequestQueueHead(marketOrderRequestQueuePk: PublicKey) {
    const marketOrderRequestQueue = await this.fetchMarketOrderRequestQueue(
      marketOrderRequestQueuePk,
    );

    if (marketOrderRequestQueue.orderRequests.len == 0) {
      return null;
    }

    const front = marketOrderRequestQueue.orderRequests.front;
    const orderRequest = marketOrderRequestQueue.orderRequests.items[front];

    return {
      purchaser: orderRequest.purchaser,
      distinctSeed: orderRequest.distinctSeed,
      forOutcome: orderRequest.forOutcome,
      marketOutcomeIndex: orderRequest.marketOutcomeIndex,
      expectedPrice: orderRequest.expectedPrice,
      delayExpirationTimestamp: orderRequest.delayExpirationTimestamp,
    };
  }

  async getMarketMatchingQueueHead(
    marketMatchingQueuePk: PublicKey,
    decimals = TOKEN_DECIMALS,
  ) {
    const decimalsMultiplier = 10 ** decimals;
    const marketMatchingQueue = await this.fetchMarketMatchingQueue(
      marketMatchingQueuePk,
    );

    if (marketMatchingQueue.matches.len == 0) {
      return null;
    }

    const matchesFront = marketMatchingQueue.matches.front;
    const matchesHead = marketMatchingQueue.matches.items[matchesFront];

    return {
      pk: matchesHead.pk,
      forOutcome: matchesHead.forOutcome,
      outcomeIndex: matchesHead.outcomeIndex,
      price: matchesHead.price,
      stake: matchesHead.stake.toNumber() / decimalsMultiplier,
    };
  }

  async getMarketMatchingQueueLength(marketMatchingQueuePk: PublicKey) {
    const marketMatchingQueue = await this.fetchMarketMatchingQueue(
      marketMatchingQueuePk,
    );
    return marketMatchingQueue.matches.len;
  }

  async getMarketMatchingPoolHead(marketMatchingPoolPk: PublicKey) {
    const marketMatchingPool = await this.fetchMarketMatchingPool(
      marketMatchingPoolPk,
    );

    if (marketMatchingPool.orders.len == 0) {
      return null;
    }

    const ordersFront = marketMatchingPool.orders.front;
    return marketMatchingPool.orders.items[ordersFront];
  }

  async getMarketMatchingPool(
    marketMatchingPoolPk: PublicKey,
    decimals = TOKEN_DECIMALS,
  ) {
    const decimalsMultiplier = 10 ** decimals;
    const marketMatchingPool = await this.fetchMarketMatchingPool(
      marketMatchingPoolPk,
    );
    return {
      len: marketMatchingPool.orders.len,
      liquidity:
        marketMatchingPool.liquidityAmount.toNumber() / decimalsMultiplier,
      matched: marketMatchingPool.matchedAmount.toNumber() / decimalsMultiplier,
    };
  }

  async getOrder(orderPk: PublicKey, decimals = TOKEN_DECIMALS) {
    const decimalsMultiplier = 10 ** decimals;
    const order = await this.fetchOrder(orderPk);
    return {
      status: order.orderStatus,
      stakeUnmatched: order.stakeUnmatched.toNumber() / decimalsMultiplier,
      stakeVoided: order.voidedStake.toNumber() / decimalsMultiplier,
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
    marketLockOrderBehaviour?: object,
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
      marketLockOrderBehaviour,
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

  async createMarketWithOptions(options: {
    outcomes: string[];
    priceLadder: number[];
    eventPk?: PublicKey;
    marketTypePk?: PublicKey;
    marketTypeDiscriminator?: string;
    marketTypeValue?: string;
    marketTitle?: string;
    decimals?: number;
    eventStartTimestamp?: number;
    marketLockTimestamp?: number;
    inplayEnabled?: boolean;
    inplayOrderDelay?: number;
    eventStartOrderBehaviour?: object;
    marketLockOrderBehaviour?: object;
    marketOperatorKeypair?: Keypair;
  }) {
    /* eslint-disable */
    // prettier-ignore-start
    const eventPk: PublicKey = options.eventPk
      ? options.eventPk
      : Keypair.generate().publicKey;
    const marketTitle = options.marketTitle
      ? options.marketTitle
      : "SOME TITLE";
    const decimals = options.decimals ? options.decimals : 3;
    const marketTypePk = options.marketTypePk
      ? options.marketTypePk
      : await getOrCreateMarketType(
          this.program as Program,
          "EventResultWinner",
        );
    const marketTypeDiscriminator = options.marketTypeDiscriminator
      ? options.marketTypeDiscriminator
      : null;
    const marketTypeValue = options.marketTypeValue
      ? options.marketTypeValue
      : null;
    const eventStartTimestamp = options.eventStartTimestamp
      ? options.eventStartTimestamp
      : 1924254038;
    const marketLockTimestamp = options.marketLockTimestamp
      ? options.marketLockTimestamp
      : 1924254038;
    const inplayEnabled = options.inplayEnabled ? options.inplayEnabled : false;
    const inplayOrderDelay = options.inplayOrderDelay
      ? options.inplayOrderDelay
      : 0;
    const eventStartOrderBehaviour = options.eventStartOrderBehaviour
      ? options.eventStartOrderBehaviour
      : { cancelUnmatched: {} };
    const marketLockOrderBehaviour = options.marketLockOrderBehaviour
      ? options.marketLockOrderBehaviour
      : { none: {} };
    // prettier-ignore-end
    /* eslint-enable */

    const [mintPk, authorisedOperatorsPk] = await Promise.all([
      createNewMint(
        this.provider,
        this.provider.wallet as NodeWallet,
        decimals + 3,
      ),
      this.findMarketAuthorisedOperatorsPda(),
    ]);

    const mintInfo = await getMint(this.provider.connection, mintPk);

    const marketPk = (
      await findMarketPda(
        monaco.program as Program,
        eventPk,
        marketTypePk,
        marketTypeDiscriminator,
        marketTypeValue,
        mintPk,
      )
    ).data.pda;

    const marketEscrowPk = await findEscrowPda(
      this.program as Program,
      marketPk,
    );
    const fundingPk = await findMarketFundingPda(
      this.program as Program,
      marketPk,
    );

    // invoke core program to call operations required for creating an order
    await this.program.methods
      .createMarket(
        eventPk,
        marketTypeDiscriminator,
        marketTypeValue,
        marketTitle,
        decimals,
        new BN(marketLockTimestamp),
        new BN(eventStartTimestamp),
        inplayEnabled,
        inplayOrderDelay,
        eventStartOrderBehaviour,
        marketLockOrderBehaviour,
      )
      .accounts({
        existingMarket: null,
        market: marketPk,
        marketType: marketTypePk,
        escrow: marketEscrowPk.data.pda,
        funding: fundingPk.data.pda,
        mint: mintPk,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        authorisedOperators: authorisedOperatorsPk,
        marketOperator:
          options.marketOperatorKeypair instanceof Keypair
            ? options.marketOperatorKeypair.publicKey
            : this.operatorPk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers(
        options.marketOperatorKeypair instanceof Keypair
          ? [options.marketOperatorKeypair]
          : [],
      )
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const outcomePks = await Promise.all(
      options.outcomes.map(async (_, index) => {
        const outcomePkResponse = await findMarketOutcomePda(
          this.program as Program,
          marketPk,
          index,
        );
        return outcomePkResponse.data.pda;
      }),
    );

    for (const outcomeIndex in options.outcomes) {
      await this.provider.connection.confirmTransaction(
        await this.program.methods
          .initializeMarketOutcome(options.outcomes[outcomeIndex])
          .accounts({
            outcome: outcomePks[outcomeIndex],
            market: marketPk,
            priceLadder: null,
            authorisedOperators: authorisedOperatorsPk,
            marketOperator:
              options.marketOperatorKeypair instanceof Keypair
                ? options.marketOperatorKeypair.publicKey
                : this.operatorPk,
            systemProgram: SystemProgram.programId,
          })
          .signers(
            options.marketOperatorKeypair instanceof Keypair
              ? [options.marketOperatorKeypair]
              : [],
          )
          .rpc()
          .catch((e) => {
            console.error(e);
            throw e;
          }),
      );

      const priceLadderBatchSize = 20;
      for (
        let i = 0;
        i < options.priceLadder.length;
        i += priceLadderBatchSize
      ) {
        const batch = options.priceLadder.slice(i, i + priceLadderBatchSize);
        await this.provider.connection.confirmTransaction(
          await this.program.methods
            .addPricesToMarketOutcome(parseInt(outcomeIndex), batch)
            .accounts({
              outcome: outcomePks[outcomeIndex],
              market: marketPk,
              authorisedOperators: authorisedOperatorsPk,
              marketOperator:
                options.marketOperatorKeypair instanceof Keypair
                  ? options.marketOperatorKeypair.publicKey
                  : this.operatorPk,
              systemProgram: SystemProgram.programId,
            })
            .signers(
              options.marketOperatorKeypair instanceof Keypair
                ? [options.marketOperatorKeypair]
                : [],
            )
            .rpc()
            .catch((e) => {
              console.error(e);
              throw e;
            }),
        );
      }
    }

    let matchingPools: { against: PublicKey; forOutcome: PublicKey }[][] = [];
    matchingPools = await Promise.all(
      outcomePks.map(async (_, index) => {
        return await getMarketMatchingPoolsPks(
          marketPk,
          index,
          options.priceLadder,
        );
      }),
    );

    const [
      liquiditiesPk,
      matchingQueuePk,
      commissionQueuePk,
      orderRequestQueuePk,
    ] = await Promise.all([
      findMarketLiquiditiesPda(this.program as Program, marketPk),
      findMarketMatchingQueuePda(this.program as Program, marketPk),
      findMarketCommissionPaymentQueuePda(this.program as Program, marketPk),
      findMarketOrderRequestQueuePda(
        this.program as Program as Program,
        marketPk,
      ),
    ]);

    return new MonacoMarket(
      this,
      externalPrograms,
      marketPk,
      marketEscrowPk.data.pda,
      fundingPk.data.pda,
      liquiditiesPk.data.pda,
      matchingQueuePk.data.pda,
      commissionQueuePk.data.pda,
      orderRequestQueuePk.data.pda,
      outcomePks,
      matchingPools,
      eventPk,
      marketTypePk,
      mintPk,
      mintInfo,
      options.marketOperatorKeypair,
    );
  }

  async createMarket(
    outcomes: string[],
    priceLadder: number[],
    marketOperatorKeypair?: Keypair,
    inplayEnabled?: boolean,
    inplayOrderDelay?: number,
    eventStartTimestamp = 1924254038,
    marketLockTimestamp = 1924254038,
    eventStartOrderBehaviour: object = { cancelUnmatched: {} },
    marketLockOrderBehaviour: object = { none: {} },
  ) {
    return await this.createMarketWithOptions({
      outcomes,
      priceLadder,
      marketOperatorKeypair,
      inplayEnabled,
      inplayOrderDelay,
      eventStartTimestamp,
      marketLockTimestamp,
      eventStartOrderBehaviour,
      marketLockOrderBehaviour,
    });
  }

  async createPriceLadder(prices: number[]): Promise<PublicKey> {
    const distinctSeed = JSON.stringify(prices);
    const priceLadderPk = findPriceLadderPda(
      this.program as Program,
      JSON.stringify(prices),
    ).data.pda;

    const response = await createPriceLadderWithPrices(
      this.program as Program,
      priceLadderPk,
      distinctSeed,
      prices,
    );
    if (!response.success) {
      throw response.errors[0];
    }
    return priceLadderPk;
  }
}

export class MonacoMarket {
  private monaco: Monaco;
  private externalPrograms: ExternalPrograms;
  readonly pk: PublicKey;
  readonly escrowPk: PublicKey;
  readonly fundingPk: PublicKey;
  readonly liquiditiesPk: PublicKey;
  readonly matchingQueuePk: PublicKey;
  readonly paymentsQueuePk: PublicKey;
  readonly orderRequestQueuePk: PublicKey;
  readonly outcomePks: PublicKey[];
  readonly matchingPools: {
    against: PublicKey;
    forOutcome: PublicKey;
  }[][];
  readonly marketTypePk: PublicKey;
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
    fundingPk: PublicKey,
    liquiditiesPk: PublicKey,
    matchingQueuePk: PublicKey,
    paymentsQueuePk: PublicKey,
    orderRequestQueuePk: PublicKey,
    outcomePks: PublicKey[],
    matchingPools: {
      against: PublicKey;
      forOutcome: PublicKey;
    }[][],
    eventPk: PublicKey,
    marketTypePk: PublicKey,
    mintPk: PublicKey,
    mintInfo: Mint,
    marketAuthority?: Keypair,
  ) {
    this.monaco = monaco;
    this.externalPrograms = externalPrograms;
    this.pk = pk;
    this.escrowPk = escrowPk;
    this.fundingPk = fundingPk;
    this.liquiditiesPk = liquiditiesPk;
    this.matchingQueuePk = matchingQueuePk;
    this.paymentsQueuePk = paymentsQueuePk;
    this.orderRequestQueuePk = orderRequestQueuePk;
    this.outcomePks = outcomePks;
    this.matchingPools = matchingPools;
    this.eventPk = eventPk;
    this.marketTypePk = marketTypePk;
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
    await this.airdropTokenAccount(purchaserTokenPk, balance);
    return purchaserTokenPk;
  }

  async airdropTokenAccount(receivingTokenAccount: PublicKey, balance: number) {
    const providerWallet = this.monaco.provider.wallet as NodeWallet;
    const provider = this.monaco.provider;
    await mintTo(
      provider.connection,
      providerWallet.payer,
      this.mintInfo.address,
      receivingTokenAccount,
      this.monaco.provider.wallet.publicKey, // Assume mint was created by provider.wallet
      balance * 10 ** this.mintInfo.decimals,
    );
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

  async getMarketMatchingQueueHead() {
    return await this.monaco.getMarketMatchingQueueHead(this.matchingQueuePk);
  }

  async getMarketMatchingQueueLength() {
    return await this.monaco.getMarketMatchingQueueLength(this.matchingQueuePk);
  }

  async getOrderRequestQueue() {
    return await this.monaco.program.account.marketOrderRequestQueue.fetch(
      this.orderRequestQueuePk,
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
    crankKeypair?: Keypair,
  ) {
    const result = await this._createOrderRequest(
      outcome,
      true,
      stake,
      price,
      purchaser,
      {
        productPk,
      },
    );
    await this.processNextOrderRequest(crankKeypair);
    return result.data.orderPk;
  }

  async againstOrder(
    outcome: number,
    stake: number,
    price: number,
    purchaser: Keypair,
    productPk?: PublicKey,
    crankKeypair?: Keypair,
  ) {
    const result = await this._createOrderRequest(
      outcome,
      false,
      stake,
      price,
      purchaser,
      {
        productPk,
      },
    );
    await this.processNextOrderRequest(crankKeypair);
    return result.data.orderPk;
  }

  async forOrderRequest(
    outcome: number,
    stake: number,
    price: number,
    purchaser: Keypair,
    productPk?: PublicKey,
  ) {
    const result = await this._createOrderRequest(
      outcome,
      true,
      stake,
      price,
      purchaser,
      {
        productPk,
      },
    );
    await new Promise((e) => setTimeout(e, 1000));
    return result;
  }

  async againstOrderRequest(
    outcome: number,
    stake: number,
    price: number,
    purchaser: Keypair,
    productPk?: PublicKey,
  ) {
    const result = await this._createOrderRequest(
      outcome,
      false,
      stake,
      price,
      purchaser,
      {
        productPk,
      },
    );
    await new Promise((e) => setTimeout(e, 1000));
    return result;
  }

  async _createOrderRequest(
    outcome: number,
    forOutcome: boolean,
    stake: number,
    price: number,
    purchaser: Keypair,
    overrides?: {
      marketOutcome?: PublicKey;
      productPk?: PublicKey;
      purchaserToken?: PublicKey;
      expiresOn?: number;
    },
  ) {
    const orderPk = await findOrderPda(
      this.monaco.program as Program,
      this.pk,
      purchaser.publicKey,
    );
    await this.monaco.program.methods
      .createOrderRequest({
        marketOutcomeIndex: outcome,
        forOutcome: forOutcome,
        stake: new BN(this.toAmountInteger(stake)),
        price: price,
        distinctSeed: Array.from(orderPk.data.distinctSeed),
        expiresOn: overrides.expiresOn ? new BN(overrides.expiresOn) : null,
      })
      .accounts({
        reservedOrder: orderPk.data.orderPk,
        orderRequestQueue: this.orderRequestQueuePk,
        marketPosition: await this.cacheMarketPositionPk(purchaser.publicKey),
        purchaser: purchaser.publicKey,
        payer: purchaser.publicKey,
        purchaserToken: overrides.purchaserToken
          ? overrides.purchaserToken
          : await this.cachePurchaserTokenPk(purchaser.publicKey),
        market: this.pk,
        marketOutcome: overrides.marketOutcome
          ? overrides.marketOutcome
          : this.outcomePks[outcome],
        priceLadder: null,
        marketEscrow: this.escrowPk,
        product: overrides.productPk ? overrides.productPk : null,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers(purchaser instanceof Keypair ? [purchaser] : [])
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    await new Promise((e) => setTimeout(e, 1000));
    return orderPk;
  }

  async processNextOrderRequest(crankKeypair?: Keypair): Promise<PublicKey> {
    const firstOrderRequest = await this.monaco.getMarketOrderRequestQueueHead(
      this.orderRequestQueuePk,
    );
    const orderPk = (
      await findOrderPda(
        this.monaco.program,
        this.pk,
        firstOrderRequest.purchaser,
        Uint8Array.from(firstOrderRequest.distinctSeed),
      )
    ).data.orderPk;

    const marketMatchingPoolPk = firstOrderRequest.forOutcome
      ? this.matchingPools[firstOrderRequest.marketOutcomeIndex][
          firstOrderRequest.expectedPrice
        ].forOutcome
      : this.matchingPools[firstOrderRequest.marketOutcomeIndex][
          firstOrderRequest.expectedPrice
        ].against;

    await this.monaco.program.methods
      .processOrderRequest()
      .accounts({
        order: orderPk,
        purchaserTokenAccount: await this.cachePurchaserTokenPk(
          firstOrderRequest.purchaser,
        ),
        marketPosition: await this.cacheMarketPositionPk(
          firstOrderRequest.purchaser,
        ),
        marketMatchingPool: marketMatchingPoolPk,
        orderRequestQueue: this.orderRequestQueuePk,
        market: this.pk,
        marketEscrow: this.escrowPk,
        marketLiquidities: this.liquiditiesPk,
        marketMatchingQueue: this.matchingQueuePk,
        crankOperator: crankKeypair
          ? crankKeypair.publicKey
          : this.monaco.operatorPk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers(crankKeypair ? [crankKeypair] : [])
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    return orderPk;
  }

  async processOrderRequests(): Promise<PublicKey[]> {
    const marketOrderRequestQueue =
      await this.monaco.fetchMarketOrderRequestQueue(this.orderRequestQueuePk);

    const orderPks: PublicKey[] = [];
    for (let i = 0; i < marketOrderRequestQueue.orderRequests.len; i++) {
      const orderPk = await this.processNextOrderRequest();
      orderPks.push(orderPk);
    }

    return orderPks;
  }

  async dequeueOrderRequest() {
    const orderRequestQueue =
      await this.monaco.program.account.marketOrderRequestQueue.fetch(
        this.orderRequestQueuePk,
      );
    const firstOrderRequest =
      orderRequestQueue.orderRequests.items[
        orderRequestQueue.orderRequests.front
      ];

    await monaco.program.methods
      .dequeueOrderRequest()
      .accounts({
        orderRequestQueue: this.orderRequestQueuePk,
        marketPosition: await this.cacheMarketPositionPk(
          firstOrderRequest.purchaser,
        ),
        purchaserToken: await this.cachePurchaserTokenPk(
          firstOrderRequest.purchaser,
        ),
        market: this.pk,
        marketEscrow: this.escrowPk,
        marketOperator: this.monaco.operatorPk,
        authorisedOperators:
          await this.monaco.findMarketAuthorisedOperatorsPda(),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async cancel(orderPk: PublicKey, purchaser: Keypair) {
    const order = await this.monaco.fetchOrder(orderPk);
    const purchaserTokenPk = await this.cachePurchaserTokenPk(
      purchaser.publicKey,
    );
    const outcomePk = this.outcomePks[order.marketOutcomeIndex];
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
        payer: order.payer,
        market: this.pk,
        marketEscrow: this.escrowPk,
        marketLiquidities: this.liquiditiesPk,
        marketOutcome: outcomePk,
        marketMatchingQueue: this.matchingQueuePk,
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
        marketLiquidities: this.liquiditiesPk,
        marketMatchingPool: matchingPoolPk,
        tokenProgram: TOKEN_PROGRAM_ID,
        orderRequestQueue: this.orderRequestQueuePk,
        matchingQueue: this.matchingQueuePk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async cancelOrderPostMarketLock(orderPk: PublicKey) {
    const [order] = await Promise.all([this.monaco.fetchOrder(orderPk)]);
    const purchaserTokenPk = await this.cachePurchaserTokenPk(order.purchaser);
    await this.monaco.program.methods
      .cancelOrderPostMarketLock()
      .accounts({
        order: orderPk,
        marketPosition: await this.cacheMarketPositionPk(order.purchaser),
        purchaser: order.purchaser,
        purchaserToken: purchaserTokenPk,
        market: this.pk,
        marketEscrow: this.escrowPk,
        orderRequestQueue: this.orderRequestQueuePk,
        matchingQueue: this.matchingQueuePk,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async processMatchingQueue(crankOperatorKeypair?: Keypair) {
    let remainingMatches = 0;
    do {
      const processMatchingQueueResponse = await this.processMatchingQueueOnce(
        crankOperatorKeypair,
      );
      remainingMatches = processMatchingQueueResponse.remainingMatches;
    } while (remainingMatches > 0);
  }

  async processMatchingQueueOnce(crankOperatorKeypair?: Keypair) {
    const orderMatch = await this.getMarketMatchingQueueHead();
    if (orderMatch == null) {
      return { remainingMatches: 0 };
    }
    console.log(
      `forOutcome ${orderMatch.forOutcome} outcomeIndex ${orderMatch.outcomeIndex} price ${orderMatch.price} stake ${orderMatch.stake}`,
    );

    if (orderMatch.pk) {
      const orderTradePk = await this.processMatchingQueueTakerOnce(
        orderMatch.pk,
        crankOperatorKeypair,
      );

      const remainingMatches = await this.getMarketMatchingQueueLength();
      return {
        remainingMatches,
        order: orderMatch.pk,
        orderTrade: orderTradePk.data.tradePk,
        orderTradeSeed: orderTradePk.data.distinctSeed,
      };
    } else {
      const result = await this.processMatchingQueueMakerOnce(
        orderMatch.forOutcome,
        orderMatch.outcomeIndex,
        orderMatch.price,
        crankOperatorKeypair,
      );

      const remainingMatches = await this.getMarketMatchingQueueLength();
      return {
        remainingMatches,
        order: result.order,
        orderTrade: result.orderTrade.data.tradePk,
        orderTradeSeed: result.orderTrade.data.distinctSeed,
      };
    }
  }

  async processMatchingQueueTakerOnce(
    orderPk: PublicKey,
    crankOperatorKeypair?: Keypair,
  ) {
    const orderTradePk = await findTradePda(
      this.monaco.getRawProgram(),
      orderPk,
    );

    const ix = await this.monaco.program.methods
      .processOrderMatchTaker(Array.from(orderTradePk.data.distinctSeed))
      .accounts({
        market: this.pk,
        marketMatchingQueue: this.matchingQueuePk,
        order: orderPk,
        orderTrade: orderTradePk.data.tradePk,
        crankOperator:
          crankOperatorKeypair instanceof Keypair
            ? crankOperatorKeypair.publicKey
            : this.monaco.operatorPk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers(
        crankOperatorKeypair instanceof Keypair ? [crankOperatorKeypair] : null,
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

    return orderTradePk;
  }

  async processMatchingQueueMakerOnce(
    forOutcome: boolean,
    outcomeIndex: number,
    price: number,
    crankOperatorKeypair?: Keypair,
  ) {
    const matchingPools = this.matchingPools[outcomeIndex][price];
    const matchingPoolPk = forOutcome
      ? matchingPools.forOutcome
      : matchingPools.against;

    const orderPk = await this.monaco.getMarketMatchingPoolHead(matchingPoolPk);

    const order = await this.monaco.fetchOrder(orderPk);
    const orderTradePk = await findTradePda(
      this.monaco.getRawProgram(),
      orderPk,
    );

    const ix = await this.monaco.program.methods
      .processOrderMatchMaker(Array.from(orderTradePk.data.distinctSeed))
      .accounts({
        market: this.pk,
        marketEscrow: this.escrowPk,
        marketMatchingPool: matchingPoolPk,
        marketMatchingQueue: this.matchingQueuePk,
        order: orderPk,
        marketPosition: await this.cacheMarketPositionPk(order.purchaser),
        purchaserToken: await this.cachePurchaserTokenPk(order.purchaser),
        orderTrade: orderTradePk.data.tradePk,
        crankOperator:
          crankOperatorKeypair instanceof Keypair
            ? crankOperatorKeypair.publicKey
            : this.monaco.operatorPk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers(
        crankOperatorKeypair instanceof Keypair ? [crankOperatorKeypair] : null,
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

    return { order: orderPk, orderTrade: orderTradePk };
  }

  async settle(outcome: number) {
    const authorisedOperatorsPk =
      await this.monaco.findMarketAuthorisedOperatorsPda();

    const orderRequestQueuePk = (
      await findMarketOrderRequestQueuePda(this.monaco.getRawProgram(), this.pk)
    ).data.pda;

    await this.monaco.program.methods
      .settleMarket(outcome)
      .accounts({
        market: this.pk,
        marketMatchingQueue: this.matchingQueuePk,
        marketOperator: this.marketAuthority
          ? this.marketAuthority.publicKey
          : this.monaco.operatorPk,
        authorisedOperators: authorisedOperatorsPk,
        orderRequestQueue: orderRequestQueuePk,
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

    const market = (await this.monaco
      .getRawProgram()
      .account.market.fetch(this.pk)) as MarketAccount;

    const marketMatchingQueuePk = market.marketStatus.initializing
      ? null
      : (await findMarketMatchingQueuePda(this.monaco.getRawProgram(), this.pk))
          .data.pda;
    const orderRequestQueuePk = market.marketStatus.initializing
      ? null
      : (
          await findMarketOrderRequestQueuePda(
            this.monaco.getRawProgram(),
            this.pk,
          )
        ).data.pda;

    await this.monaco.program.methods
      .voidMarket()
      .accounts({
        market: this.pk,
        marketOperator: this.marketAuthority
          ? this.marketAuthority.publicKey
          : this.monaco.operatorPk,
        authorisedOperators: authorisedOperatorsPk,
        marketMatchingQueue: marketMatchingQueuePk,
        orderRequestQueue: orderRequestQueuePk,
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
    const order = await this.monaco.fetchOrder(orderPk);

    await this.monaco.program.methods
      .settleOrder()
      .accounts({
        order: orderPk,
        market: this.pk,
        payer: order.payer,
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
        liquidities: this.liquiditiesPk,
        matchingQueue: this.matchingQueuePk,
        commissionPaymentQueue: this.paymentsQueuePk,
        orderRequestQueue: this.orderRequestQueuePk,
        authorisedOperators:
          await this.monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: this.marketAuthority
          ? this.marketAuthority.publicKey
          : this.monaco.operatorPk,
        systemProgram: SystemProgram.programId,
      })
      .signers(this.marketAuthority ? [this.marketAuthority] : [])
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async updateMarketLockTimeToNow() {
    await this.monaco.program.methods
      .updateMarketLocktimeToNow()
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
        marketLiquidities: this.liquiditiesPk,
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
        marketMatchingQueue: this.matchingQueuePk,
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
        commissionPaymentsQueue: this.paymentsQueuePk,
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
        marketFunding: this.fundingPk,
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

  async closeOutcome(outcomeIndex: number) {
    await monaco.program.methods
      .closeMarketOutcome()
      .accounts({
        market: this.pk,
        authority: this.marketAuthority.publicKey,
        marketOutcome: (
          await findMarketOutcomePda(
            monaco.program as Program,
            this.pk,
            outcomeIndex,
          )
        ).data.pda,
      })
      .rpc()
      .catch((e) => console.log(e));
  }

  async closeMarketQueues() {
    await this.monaco.program.methods
      .closeMarketQueues()
      .accounts({
        market: this.pk,
        liquidities: this.liquiditiesPk,
        matchingQueue: this.matchingQueuePk,
        commissionPaymentQueue: this.paymentsQueuePk,
        orderRequestQueue: this.orderRequestQueuePk,
        authority: this.marketAuthority.publicKey,
      })
      .rpc()
      .catch((e) => console.log(e));
  }

  async settleMarketPositionForPurchaser(
    purchaser: PublicKey,
    processCommissionPayments = true,
  ) {
    const marketPositionPk = await this.cacheMarketPositionPk(purchaser);
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
        protocolConfig: protocolCommissionPks.protocolConfigPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    if (processCommissionPayments) {
      await this.processCommissionPayments();
    }
  }

  async processCommissionPayments() {
    await processCommissionPayments(
      this.monaco.getRawProgram(),
      this.externalPrograms.protocolProduct as Program,
      this.pk,
    );
  }

  async voidMarketPositionForPurchaser(purchaser: PublicKey) {
    const marketPositionPk = await this.cacheMarketPositionPk(purchaser);
    const purchaserTokenPk = await this.cachePurchaserTokenPk(purchaser);

    await this.monaco.program.methods
      .voidMarketPosition()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        market: this.pk,
        purchaserTokenAccount: purchaserTokenPk,
        marketPosition: marketPositionPk,
        marketEscrow: this.escrowPk,
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
