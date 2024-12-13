import {MarketMatchingPoolAccount} from "../accounts";

export interface MarketMatchingPoolPrimitive extends Omit<MarketMatchingPoolAccount, 'market' | 'orders' | 'liquidityAmount' | 'matchedAmount' | 'payer'> {
  market: string;
  orders: {
    front: number;
    len: number;
    items: string[];
  }
  liquidityAmount: number;
  matchedAmount: number;
  payer: string;
}
