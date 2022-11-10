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

export enum MarketStatus {
  Open = 0x00,
  Locked = 0x01,
  ReadyForSettlement = 0x02,
  Settled = 0x03,
  Complete = 0x04,
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
