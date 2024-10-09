import {MarketPositionAccount, ProductMatchedRiskAndRate} from "../accounts";

export interface MarketPositionPrimitive extends Omit<MarketPositionAccount, 'purchaser' | 'market' | 'marketOutcomeSums' | 'unmatchedExposures' | 'outcomePositions' | 'payer' | 'matchedRisk' | 'matchedRiskPerProduct'> {
  purchaser: string;
  market: string;
  marketOutcomeSums: number[];
  unmatchedExposures: number[];
  outcomePositions: Map<string, number>;
  payer: string;
  matchedRisk: number;
  matchedRiskPerProduct: ProductMatchedRiskAndRatePrimitive[];
}

export interface ProductMatchedRiskAndRatePrimitive extends Omit<ProductMatchedRiskAndRate, 'product' | 'risk'>{
  product: string;
  risk: number;
}
