import {MarketAccount} from "../accounts";

export interface MarketPrimitive extends Omit<MarketAccount, 'authority' | 'eventAccount' | 'marketLockTimestamp' | 'marketSettleTimestamp' | 'marketType' | 'mintAccount' | 'eventStartTimestamp'> {
  authority: string;
  eventAccount: string;
  marketLockTimestamp: Date;
  marketSettleTimestamp?: Date;
  marketType: string;
  mintAccount: string;
  eventStartTimestamp: Date;
}
