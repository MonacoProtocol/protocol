import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

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

export type ValidateMarketOutcomeTitles = {
  outcomesValid: boolean;
  missingOutcomes: string[];
  additionalOutcomes: string[];
};

export type ValidateMarketOutcomePriceLadder = {
  priceLadderValid: boolean;
  outcomePk: PublicKey;
  missingPrices: number[];
  additionalPrices: number[];
};

export type ValidateMarketResponse = {
  outcomesValid: boolean;
  priceLaddersValid: boolean;
  marketValid: boolean;
  missingOutcomes: string[];
  additionalOutcomes: string[];
  priceLadderValidation: ValidateMarketOutcomePriceLadder[];
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

export class MarketOrderBehaviour {
  none?: Record<string, never>;
  cancelUnmatched?: Record<string, never>;
}

export const MarketOrderBehaviourValue = {
  none: { none: {} } as MarketOrderBehaviour,
  cancelUnmatched: { cancelUnmatched: {} } as MarketOrderBehaviour,
};

export type MarketAccount = {
  authority: BN;
  decimalLimit: number;
  escrowAccountBump: number;
  eventAccount: PublicKey;
  eventStartTimestamp: BN;
  marketLockTimestamp: BN;
  marketOutcomesCount: number;
  marketSettleTimestamp?: BN;
  marketStatus: MarketStatus;
  marketType: string;
  marketWinningOutcomeIndex?: number;
  mintAccount: PublicKey;
  published: boolean;
  suspended: boolean;
  title: string;
  inplay: boolean;
  inplayEnabled: boolean;
  inplayDelay: number;
  eventStartOrderBehaviour: MarketOrderBehaviour;
  marketLockedOrderBehaviour: MarketOrderBehaviour;
};

export type EpochTimeStamp = number;
