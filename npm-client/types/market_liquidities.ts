import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

export type MarketLiquidities = {
  market: PublicKey;
  stakeMatchedTotal: BN;
  liquiditiesFor: MarketLiquidity[];
  liquiditiesAgainst: MarketLiquidity[];
};

export type MarketLiquidity = {
  outcome: number;
  price: number;
  liquidity: BN;
};
