import {MarketOutcomeAccount} from "../accounts";

export interface MarketOutcomePrimitive extends Omit<MarketOutcomeAccount, 'market' | 'prices'> {
  market: string;
  prices: string | null;
}
