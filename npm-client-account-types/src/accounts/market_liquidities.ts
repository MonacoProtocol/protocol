import { PublicKey } from "@solana/web3.js";
import { default as BN } from "bn.js";

export interface MarketLiquiditiesAccount {
  market: PublicKey;
  enableCrossMatching: boolean;
  stakeMatchedTotal: BN;
  liquiditiesFor: MarketLiquidity[];
  liquiditiesAgainst: MarketLiquidity[];
}

export interface MarketLiquidity {
  outcome: number;
  price: number;
  sources: LiquiditySource[];
  liquidity: BN;
}

export interface LiquiditySource {
  outcome: number;
  price: number;
}
