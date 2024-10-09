import {TradeAccount} from "../accounts";

export interface TradePrimitive extends Omit<TradeAccount, 'purchaser' | 'market' | 'order' | 'stake' | 'creationTimestamp' | 'payer'> {
  purchaser: string;
  market: string;
  order: string;
  stake: number;
  creationTimestamp: Date
  payer: string;
}
