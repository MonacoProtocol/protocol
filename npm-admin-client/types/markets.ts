import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { BN, web3 } from "@coral-xyz/anchor";
import { TransactionOptionsBatch } from "./transactions";

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
    signatures: web3.TransactionSignature[];
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
  inplayDelay: number;
  eventStartOrderBehaviour: MarketOrderBehaviour;
  marketLockedOrderBehaviour: MarketOrderBehaviour;
  unsettledAccountsCount: number;
  unclosedAccountsCount: number;
  version: number;
};

export type EpochTimeStamp = number;

export type PaymentInfo = {
  from: PublicKey;
  to: PublicKey;
  amount: BN;
};

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
