import {MarketOrderRequestQueueAccount, OrderRequest, OrderRequestQueue} from "../accounts";

export interface MarketOrderRequestQueuePrimitive extends Omit<MarketOrderRequestQueueAccount, 'market' | 'orderRequests'> {
  market: string;
  orderRequests: OrderRequestQueuePrimitive;
}

export interface OrderRequestQueuePrimitive extends Omit<OrderRequestQueue, 'items'> {
  items: OrderRequestPrimitive[];
}

export interface OrderRequestPrimitive extends Omit<OrderRequest, 'purchaser' | 'product' | 'stake' | 'delayExpirationTimestamp' | 'creationTimestamp' | 'expiresOn'> {
  purchaser: string;
  product: string | null;
  stake: number;
  delayExpirationTimestamp: Date;
  creationTimestamp: Date;
  expiresOn: Date;
}
