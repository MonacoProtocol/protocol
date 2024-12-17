import { MarketMatchingPoolAccount } from "../types";
import {
  BooleanCriterion,
  PublicKeyCriterion,
  U16Criterion,
} from "./queries/filtering";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { AccountQuery } from "./queries/account_query";

export class MarketMatchingPools extends AccountQuery<MarketMatchingPoolAccount> {
  public static marketMatchingPoolQuery(program: Program) {
    return new MarketMatchingPools(program);
  }

  private market: PublicKeyCriterion = new PublicKeyCriterion(8);
  private marketOutcomeIndex: U16Criterion = new U16Criterion(8 + 32);
  private forOutcome: BooleanCriterion = new BooleanCriterion(8 + 32 + 2);

  constructor(program: Program) {
    super(program, "MarketMatchingPool");
    this.setFilterCriteria(
      this.market,
      this.marketOutcomeIndex,
      this.forOutcome,
    );
  }

  filterByMarket(market: PublicKey): MarketMatchingPools {
    this.market.setValue(market);
    return this;
  }

  filterByMarketOutcomeIndex(marketOutcomeIndex: number): MarketMatchingPools {
    this.marketOutcomeIndex.setValue(marketOutcomeIndex);
    return this;
  }

  filterByForOutcome(forOutcome: boolean): MarketMatchingPools {
    this.forOutcome.setValue(forOutcome);
    return this;
  }
}
