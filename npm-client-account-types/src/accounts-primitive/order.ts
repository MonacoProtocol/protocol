import {OrderAccount} from "../accounts";
export interface OrderPrimitive extends Omit<OrderAccount, 'purchaser' | 'market' | 'product' | 'stake' | 'voidedStake' | 'creationTimestamp' | 'stakeUnmatched' | 'payout' | 'payer' | 'orderStatus'> {
  purchaser: string;
  market: string;
  product: string | null;
  stake: number;
  voidedStake: number;
  creationTimestamp: Date;
  stakeUnmatched: number;
  payout: number;
  payer: string;
  orderStatus: string;
}
