import {MarketMatchingQueueAccount, MatchingQueue, OrderMatch} from "../accounts";

export interface MarketMatchingQueuePrimitive extends Omit<MarketMatchingQueueAccount, 'market' | 'matches'> {
  market: string;
  matches: MatchingQueuePrimitive;
}

export interface MatchingQueuePrimitive extends Omit<MatchingQueue, 'items'> {
  items: OrderMatchPrimitive[];
}

export interface OrderMatchPrimitive extends Omit<OrderMatch, 'pk' | 'purchaser' | 'stake'> {
  pk: string;
  purchaser: string;
  stake: number;
}
