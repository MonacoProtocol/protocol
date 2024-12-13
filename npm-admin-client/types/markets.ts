import {
  PublicKey,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";
import { TransactionOptionsBatch } from "./transactions";
import {
  MarketAccount,
  MarketOrderBehaviour,
} from "@monaco-protocol/client-account-types";

export type GetOrCreateAccountResponse<T> = {
  account: T;
  publicKey: PublicKey;
  txId?: string;
};

export type CreateMarketResponse = {
  marketPk: PublicKey;
  tnxId: string;
  market: MarketAccount;
};

export type CreateMarketWithOutcomesAndPriceLadderResponse =
  CreateMarketResponse & {
    priceLadderResults: BatchAddPricesToOutcomes[];
    signatures: TransactionSignature[];
    failedInstructions: TransactionInstruction[];
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

export const MarketOrderBehaviourValue = {
  none: { none: {} } as MarketOrderBehaviour,
  cancelUnmatched: { cancelUnmatched: {} } as MarketOrderBehaviour,
};

export type EpochTimeStamp = number;

export type MarketInstructionOptions = {
  marketTypeDiscriminator?: string;
  marketTypeValue?: string;
  existingMarketPk?: PublicKey;
  existingMarket?: MarketAccount;
  eventStartTimestamp?: EpochTimeStamp;
  inplayEnabled?: boolean;
  inplayOrderDelay?: number;
  eventStartOrderBehaviour?: MarketOrderBehaviour;
  marketLockOrderBehaviour?: MarketOrderBehaviour;
};

export type MarketCreateOptions = MarketInstructionOptions &
  TransactionOptionsBatch;
