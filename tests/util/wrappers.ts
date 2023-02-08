import { AccountMeta, Keypair, PublicKey } from "@solana/web3.js";
import {
  Mint,
  TOKEN_PROGRAM_ID,
  getMint,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as anchor from "@project-serum/anchor";
import { BN, Program } from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
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
} from "../util/test_util";
import {
  findAuthorisedOperatorsPda,
  findMultisigGroupPda,
  findMultisigTransactionPda,
  findProductConfigPda,
} from "../util/pdas";

const { SystemProgram } = anchor.web3;

const TOKEN_DECIMALS = 6;

export let monaco: Monaco;

beforeAll(async () => {
  // Programs
  monaco = new Monaco(
    anchor.getProvider() as anchor.AnchorProvider,
    anchor.workspace.MonacoProtocol,
  );
});

export class Monaco {
  readonly provider: anchor.AnchorProvider;
  readonly program: Program<MonacoProtocol>;
  readonly operatorPk: PublicKey;

  private marketAuthorisedOperatorsPk: PublicKey;
  private crankAuthorisedOperatorsPk: PublicKey;

  constructor(
    provider: anchor.AnchorProvider,
    program: Program<MonacoProtocol>,
  ) {
    this.provider = provider;
    this.program = program;
    this.operatorPk = provider.wallet.publicKey;
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
      offset: marketPosition.offset.toNumber() / decimalsMultiplayer,
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

  async create3WayMarket(priceLadder: number[]) {
    const market = await this.createMarket(
      ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
      priceLadder,
    );
    await market.open();
    return market;
  }

  async createMarket(
    outcomes: string[],
    priceLadder: number[],
    marketOperatorKeypair?: Keypair,
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

    // invoke core program to call operations required for creating an order
    await this.program.methods
      .createMarket(
        event.publicKey,
        marketType,
        marketTitle,
        new anchor.BN(1924254038),
        decimals,
      )
      .accounts({
        market: marketPdaResponse.data.pda,
        escrow: marketEscrowPk.data.pda,
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
      marketPdaResponse.data.pda,
      marketEscrowPk.data.pda,
      outcomePks,
      matchingPools,
      event.publicKey,
      mintPk,
      mintInfo,
      marketOperatorKeypair,
    );
    return bmarket;
  }

  async createMultisigGroup(
    groupTitle: string,
    signers: PublicKey[],
    approvalThreshold: number,
  ): Promise<PublicKey> {
    const multisigGroupPk = await findMultisigGroupPda(
      groupTitle,
      this.getRawProgram(),
    );
    await this.program.methods
      .createMultisig(groupTitle, signers, new BN(approvalThreshold))
      .accounts({
        multisigGroup: multisigGroupPk,
        signer: monaco.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    return multisigGroupPk;
  }

  async createMultisigTransaction(
    multisigGroupPk: PublicKey,
    multisigMemberPk: PublicKey,
    instructionData: Buffer,
    instructionAccounts: AccountMeta[],
  ): Promise<PublicKey> {
    const distinctSeed = Date.now().toString();
    const txPk = await findMultisigTransactionPda(
      distinctSeed,
      this.getRawProgram(),
    );

    await monaco.program.methods
      .createMultisigTransaction(
        distinctSeed,
        instructionAccounts,
        instructionData,
      )
      .accounts({
        multisigGroup: multisigGroupPk,
        multisigTransaction: txPk,
        multisigMember: multisigMemberPk,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return txPk;
  }

  async executeMultisigTransaction(
    multisigGroupPk: PublicKey,
    multisigTransactionPk: PublicKey,
    multisigPdaSignerPk: PublicKey,
    instructionAccounts: AccountMeta[],
  ) {
    // Construct remainingAccounts
    // map isSigner to false for executing transaction (unsure why I have to do this but it's required)
    const updatedAccounts = instructionAccounts.map((acc) => {
      return {
        pubkey: acc.pubkey,
        isSigner: false,
        isWritable: acc.isWritable,
      };
    });
    // ensure monaco program account is passed
    const updatedAccountsWithProgram = updatedAccounts.concat({
      pubkey: monaco.program.programId,
      isWritable: false,
      isSigner: false,
    });

    // execute transaction
    await monaco.program.methods
      .executeMultisigTransaction()
      .accounts({
        multisigGroup: multisigGroupPk,
        multisigTransaction: multisigTransactionPk,
        multisigPdaSigner: multisigPdaSignerPk,
      })
      .remainingAccounts(updatedAccountsWithProgram)
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  async createProductConfig(
    productTitle: string,
    commissionRate: number,
    multisigGroupPk: PublicKey,
  ) {
    const productConfigPk = await findProductConfigPda(
      productTitle,
      this.getRawProgram(),
    );
    await monaco.program.methods
      .createProductConfig(productTitle, commissionRate)
      .accounts({
        productConfig: productConfigPk,
        commissionEscrow: Keypair.generate().publicKey,
        multisigGroup: multisigGroupPk,
        productOperator: monaco.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
      .catch((e) => {
        throw e;
      });

    return productConfigPk;
  }
}

export class MonacoMarket {
  private monaco: Monaco;
  readonly pk: PublicKey;
  readonly escrowPk: PublicKey;
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

  constructor(
    monaco: Monaco,
    pk: PublicKey,
    escrowPk: PublicKey,
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
    this.pk = pk;
    this.escrowPk = escrowPk;
    this.outcomePks = outcomePks;
    this.matchingPools = matchingPools;
    this.eventPk = eventPk;
    this.mintPk = mintPk;
    this.mintInfo = mintInfo;
    this.marketAuthority = marketAuthority;
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
      purchaserTokenPk = await createAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        this.mintPk,
        purchaserPk,
      );
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

  async getTokenBalance(purchaser: Keypair) {
    const purchaserTokenPk = await this.cachePurchaserTokenPk(
      purchaser.publicKey,
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
    );
    await new Promise((e) => setTimeout(e, 1000));
    return result;
  }

  async againstOrder(
    outcome: number,
    stake: number,
    price: number,
    purchaser: Keypair,
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

    await this.monaco.program.methods
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
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });
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

  async settleOrder(orderPk: PublicKey) {
    const [order, authorisedOperatorsPk] = await Promise.all([
      this.monaco.fetchOrder(orderPk),
      await this.monaco.findCrankAuthorisedOperatorsPda(),
    ]);
    const purchaserTokenPk = await this.cachePurchaserTokenPk(order.purchaser);
    const marketPositionPk = await this.cacheMarketPositionPk(order.purchaser);
    await this.monaco.program.methods
      .settleOrder()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        order: orderPk,
        market: this.pk,
        purchaserTokenAccount: purchaserTokenPk,
        purchaser: order.purchaser,
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

  async readyToClose() {
    await this.monaco.program.methods
      .setMarketReadyToClose()
      .accounts({
        market: this.pk,
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
}
