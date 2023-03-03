import { PublicKey } from "@solana/web3.js";
import { BN } from "@project-serum/anchor";

export type CreateMarketResponse = {
  marketPk: PublicKey;
  tnxId: string;
  market: MarketAccount;
};

export type CreateMarketWithOutcomesAndPriceLadderResponse =
  CreateMarketResponse & {
    priceLadderResults: BatchAddPricesToOutcomes[];
  };

export type OutcomePdaResponse = {
  outcomeIndex: number;
  outcomePda: PublicKey;
};

export type OutcomeInitialisationResponse = OutcomePdaResponse & {
  tnxId: string | void;
};

export type OddsInitialisationResponse = OutcomePdaResponse & {
  tnxIds: string[];
};

export type OutcomePdasResponse = {
  outcomePdas: OutcomePdaResponse[];
};

export type OutcomeInitialisationsResponse = {
  outcomes: OutcomeInitialisationResponse[];
};

export type AddPricesToOutcomeResponse = {
  priceLadder: number[];
  tnxId: string;
};

export type BatchAddPricesToOutcomeResponse = {
  batches: AddPricesToOutcomeResponse[];
};

export type BatchAddPricesToOutcomes = {
  outcomeIndex: number;
  outcomePda: PublicKey;
  batches: AddPricesToOutcomeResponse[];
};

export type BatchAddPricesToOutcomesResponse = {
  results: BatchAddPricesToOutcomes[];
};

// Duplicates from primary client

export class MarketStatus {
  initializing?: Record<string, never>;
  open?: Record<string, never>;
  locked?: Record<string, never>;
  readyForSettlement?: Record<string, never>;
  settled?: Record<string, never>;
  readyToClose?: Record<string, never>;
}

export type MarketAccount = {
  authority: BN;
  decimalLimit: number;
  escrowAccountBump: number;
  eventAccount: PublicKey;
  marketLockTimestamp: BN;
  marketOutcomesCount: number;
  marketSettleTimestamp?: null;
  marketStatus: MarketStatus;
  marketType: string;
  marketWinningOutcomeIndex?: number;
  mintAccount: PublicKey;
  published: boolean;
  suspended: boolean;
  title: string;
};

export type EpochTimeStamp = number;
