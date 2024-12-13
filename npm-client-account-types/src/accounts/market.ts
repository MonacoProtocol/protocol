import { default as BN } from "bn.js";
import { PublicKey } from "@solana/web3.js";

export interface MarketStatus {
  readonly initializing?: Record<string, never>;
  readonly open?: Record<string, never>;
  readonly locked?: Record<string, never>;
  readonly readyForSettlement?: Record<string, never>;
  readonly settled?: Record<string, never>;
  readonly readyToClose?: Record<string, never>;
  readonly readyToVoid?: Record<string, never>;
  readonly voided?: Record<string, never>;
}

export interface MarketOrderBehaviour {
  none?: Record<string, never>;
  cancelUnmatched?: Record<string, never>;
}

export interface MarketAccount {
  authority: PublicKey;
  decimalLimit: number;
  escrowAccountBump: number;
  fundingAccountBump: number;
  eventAccount: PublicKey;
  marketLockTimestamp: BN;
  marketOutcomesCount: number;
  marketSettleTimestamp?: BN;
  marketStatus: MarketStatus;
  marketType: PublicKey;
  marketTypeDiscriminator: string;
  marketTypeValue: string;
  marketWinningOutcomeIndex?: number;
  mintAccount: PublicKey;
  published: boolean;
  suspended: boolean;
  title: string;
  inplay: boolean;
  inplayEnabled: boolean;
  inplayOrderDelay: number;
  eventStartOrderBehaviour: MarketOrderBehaviour;
  marketLockOrderBehaviour: MarketOrderBehaviour;
  eventStartTimestamp: BN;
  unsettledAccountsCount: number;
  unclosedAccountsCount: number;
  version: number;
}
