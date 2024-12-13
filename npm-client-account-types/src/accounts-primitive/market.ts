import {MarketAccount} from "../accounts";

export interface MarketPrimitive extends Omit<MarketAccount, 'authority' | 'eventAccount' | 'marketLockTimestamp' | 'marketSettleTimestamp' | 'marketStatus' | 'marketType' | 'mintAccount' | 'eventStartTimestamp' | 'eventStartOrderBehaviour' | 'marketLockOrderBehaviour'> {
  authority: string;
  eventAccount: string;
  marketLockTimestamp: Date;
  marketSettleTimestamp?: Date;
  marketStatus: string;
  marketType: string;
  mintAccount: string;
  eventStartTimestamp: Date;
  eventStartOrderBehaviour: string;
  marketLockOrderBehaviour: string;
}
