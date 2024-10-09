import { MarketLiquiditiesAccount, MarketLiquidity} from "../accounts";

export interface MarketLiquiditiesPrimitive extends Omit<MarketLiquiditiesAccount, 'market' | 'stakeMatchedTotal' | 'liquiditiesFor' | 'liquiditiesAgainst'> {
  market: string;
  stakeMatchedTotal: number;
  liquiditiesFor: MarketLiquidityPrimitive[];
  liquiditiesAgainst: MarketLiquidityPrimitive[];
}

export interface MarketLiquidityPrimitive extends Omit<MarketLiquidity, 'liquidity'>{
  liquidity: number;
}
