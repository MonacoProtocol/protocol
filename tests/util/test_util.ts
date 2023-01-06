import { Keypair, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getMint,
} from "@solana/spl-token";
import * as anchor from "@project-serum/anchor";
import {
  AnchorProvider,
  BN,
  getProvider,
  Program,
  Provider,
} from "@project-serum/anchor";
import { Wallet } from "@project-serum/anchor/dist/cjs/provider";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { MonacoProtocol } from "../../target/types/monaco_protocol";
import {
  findEscrowPda,
  findMarketPda,
  findMarketMatchingPoolPda,
  findMarketPositionPda,
  findMarketOutcomePda,
  findTradePda,
  MarketType,
} from "../../npm-client/src";
import { findUserPdas, findMarketPdas } from "../util/pdas";
import * as assert from "assert";
import { AssertionError } from "assert";

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

  await protocolProgram.methods
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
    .rpc()
    .catch((e) => {
      console.error(e);
      throw e;
    });
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
  priceLadder: number[] = [4.2],
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
    "confirmed",
  );

  const eventAccount = anchor.web3.Keypair.generate();
  const marketType = MarketType.EventResultWinner;
  const wallet = provider.wallet as NodeWallet;

  if (mintPk == null) {
    mintPk = await createNewMint(provider, wallet, mint_decimals);
  }

  const marketPda = (
    await findMarketPda(
      protocolProgram as Program,
      eventAccount.publicKey,
      marketType,
      mintPk,
    )
  ).data.pda;

  const escrowPda = (await findEscrowPda(protocolProgram as Program, marketPda))
    .data.pda;

  await protocolProgram.methods
    .createMarket(
      eventAccount.publicKey,
      marketType,
      "SOME TITLE",
      new anchor.BN(1924254038),
      max_decimals,
    )
    .accounts({
      market: marketPda,
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
        .initializeMarketOutcome(outcomes[index], priceLadder)
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
      "confirmed",
    );
  }

  let matchingPools: { against: PublicKey; forOutcome: PublicKey }[][] = [];
  if (initialisePools) {
    matchingPools = await Promise.all(
      outcomePdas.map(async (outcomePda, index) => {
        return await getMarketMatchingPoolsPks(
          marketPda,
          index,
          outcomePda,
          priceLadder,
        );
      }),
    );
  }

  await protocolProgram.methods
    .openMarket()
    .accounts({
      market: marketPda,
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
    "confirmed",
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
    "confirmed",
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
) {
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
) {
  const protocolProgram = anchor.workspace
    .MonacoProtocol as Program<MonacoProtocol>;

  const {
    uiAmountToAmount,
    marketEscrowPk,
    marketOutcomePk,
    marketMatchingPoolPk,
  } = await findMarketPdas(
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

  await protocolProgram.methods
    .createOrder(orderDistinctSeed, {
      marketOutcomeIndex: marketOutcomeIndex,
      forOutcome: forOutcome,
      stake: new BN(stakeInteger),
      price: marketOutcomePrice,
    })
    .accounts({
      purchaser: purchaser.publicKey,
      order: orderPk,
      marketPosition: marketPositionPk.data.pda,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      market: marketPk,
      marketMatchingPool: marketMatchingPoolPk,
      marketOutcome: marketOutcomePk,
      purchaserToken: purchaserTokenAccount,
      marketEscrow: marketEscrowPk,
    })
    .signers(purchaser instanceof Keypair ? [purchaser] : [])
    .rpc()
    .catch((e) => {
      console.error(e);
      throw e;
    });

  return orderPk;
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
