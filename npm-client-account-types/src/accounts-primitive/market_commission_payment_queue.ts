import {CommissionPayment, CommissionPaymentQueue, MarketCommissionPaymentQueueAccount} from "../accounts";

export interface MarketCommissionPaymentQueuePrimitive extends Omit<MarketCommissionPaymentQueueAccount, 'market' | 'paymentQueue'> {
  market: string;
  paymentQueue: CommissionPaymentQueuePrimitive;
}

export interface CommissionPaymentQueuePrimitive extends Omit<CommissionPaymentQueue, 'items'> {
  items: CommissionPaymentPrimitive[];
}

export interface CommissionPaymentPrimitive extends Omit<CommissionPayment, 'from' | 'to' | 'amount'>{
  from: string;
  to: string;
  amount: number;
}
