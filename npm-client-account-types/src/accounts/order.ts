import { PublicKey } from "@solana/web3.js";
import { default as BN } from "bn.js";

export interface OrderStatus {
  readonly open?: Record<string, never>;
  readonly matched?: Record<string, never>;
  readonly settledWin?: Record<string, never>;
  readonly settledLose?: Record<string, never>;
  readonly cancelled?: Record<string, never>;
  readonly voided?: Record<string, never>;
}

export interface OrderAccount {
  purchaser: PublicKey;
  market: PublicKey;
  marketOutcomeIndex: number;
  forOutcome: boolean;
  orderStatus: OrderStatus;
  product: PublicKey | null;
  stake: BN;
  voidedStake: BN;
  expectedPrice: number;
  creationTimestamp: BN;
  stakeUnmatched: BN;
  payout: BN;
  payer: PublicKey;
  productCommissionRate: number;
}
