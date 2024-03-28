import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  findOrderPda,
  findEscrowPda,
  findMarketLiquiditiesPda,
  findMarketMatchingPoolPda,
  findMarketMatchingQueuePda,
  findMarketOutcomePda,
  findMarketPositionPda,
  getMarket,
  getMintInfo,
  MarketAccount,
} from "../../npm-client";
import { findMarketFundingPda } from "../../npm-admin-client";

export async function findAuthorisedOperatorsPda(
  operatorType: string,
  program: Program,
) {
  const [pk] = await PublicKey.findProgramAddress(
    [Buffer.from("authorised_operators"), Buffer.from(operatorType)],
    program.programId,
  );
  return pk;
}

export async function findUserPdas(
  marketPK: PublicKey,
  purchaserPK: PublicKey,
  program: Program,
) {
  const [order, marketPositionPk] = await Promise.all([
    findOrderPda(program, marketPK, purchaserPK),
    findMarketPositionPda(program, marketPK, purchaserPK),
  ]);

  const orderPk = order.data.orderPk;
  const distinctSeed = order.data.distinctSeed;

  return { orderPk, orderDistinctSeed: distinctSeed, marketPositionPk };
}

export async function findMarketPdas(
  marketPk: PublicKey,
  forOutcome: boolean,
  marketOutcomeIndex: number,
  price: number,
  program: Program,
): Promise<{
  market: MarketAccount;
  uiAmountToAmount: (uiAmount: number) => number;
  marketEscrowPk: PublicKey;
  marketOutcomePk: PublicKey;
  marketMatchingPoolPk: PublicKey;
  marketMatchingQueuePk: PublicKey;
  marketLiquiditiesPk: PublicKey;
  marketFundingPk: PublicKey;
}> {
  const marketResponse = await getMarket(program, marketPk);
  const market = marketResponse.data.account;

  const [
    marketMintInfoResponse,
    marketEscrowPkResponse,
    marketOutcomePkResponse,
    marketMatchingPoolPkResponse,
    marketMatchingQueuePkResponse,
    marketLiquiditiesPkResponse,
    marketFundingPkResponse,
  ] = await Promise.all([
    getMintInfo(program, market.mintAccount),
    findEscrowPda(program, marketPk),
    findMarketOutcomePda(program, marketPk, marketOutcomeIndex),
    findMarketMatchingPoolPda(
      program,
      marketPk,
      marketOutcomeIndex,
      price,
      forOutcome,
    ),
    findMarketMatchingQueuePda(program, marketPk),
    findMarketLiquiditiesPda(program, marketPk),
    findMarketFundingPda(program, marketPk),
  ]);

  const marketMintInfo = marketMintInfoResponse.data;
  const marketEscrowPk = marketEscrowPkResponse.data.pda;
  const marketOutcomePk = marketOutcomePkResponse.data.pda;
  const marketMatchingPoolPk = marketMatchingPoolPkResponse.data.pda;
  const marketMatchingQueuePk = marketMatchingQueuePkResponse.data.pda;
  const marketLiquiditiesPk = marketLiquiditiesPkResponse.data.pda;
  const marketFundingPk = marketFundingPkResponse.data.pda;

  const uiAmountToAmount = (uiAmount: number) =>
    uiAmount * 10 ** marketMintInfo.decimals;

  return {
    market,
    uiAmountToAmount,
    marketEscrowPk,
    marketOutcomePk,
    marketMatchingPoolPk,
    marketMatchingQueuePk,
    marketLiquiditiesPk,
    marketFundingPk,
  };
}

export async function findProductPda(title: string, program: Program) {
  const [productPk] = PublicKey.findProgramAddressSync(
    [Buffer.from("product"), Buffer.from(title)],
    program.programId,
  );
  return productPk;
}
