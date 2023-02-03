import { PublicKey } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import {
  findOrderPda,
  findEscrowPda,
  findMarketMatchingPoolPda,
  findMarketOutcomePda,
  findMarketPositionPda,
  getMarket,
  getMintInfo,
  MarketAccount,
} from "../../npm-client/src";

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
}> {
  const marketResponse = await getMarket(program, marketPk);
  const market = marketResponse.data.account;

  const [
    marketMintInfoResponse,
    marketEscrowPkResponse,
    marketOutcomePkResponse,
    marketMatchingPoolPkResponse,
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
  ]);

  const marketMintInfo = marketMintInfoResponse.data;
  const marketEscrowPk = marketEscrowPkResponse.data.pda;
  const marketOutcomePk = marketOutcomePkResponse.data.pda;
  const marketMatchingPoolPk = marketMatchingPoolPkResponse.data.pda;

  const uiAmountToAmount = (uiAmount: number) =>
    uiAmount * 10 ** marketMintInfo.decimals;

  return {
    market,
    uiAmountToAmount,
    marketEscrowPk,
    marketOutcomePk,
    marketMatchingPoolPk,
  };
}

export async function findProductConfigPda(title: string, program: Program) {
  const [productConfigPk] = await PublicKey.findProgramAddress(
    [Buffer.from("product_config"), Buffer.from(title)],
    program.programId,
  );
  return productConfigPk;
}
