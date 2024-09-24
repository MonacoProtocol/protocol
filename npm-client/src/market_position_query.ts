import { Program } from "@coral-xyz/anchor";
import { MemcmpFilter, PublicKey } from "@solana/web3.js";
import { MarketPosition } from "../types";
import { AccountQuery } from "./queries/account_query";
import { BooleanCriterion, PublicKeyCriterion } from "./queries/filtering";
/**
 * Base market position query builder allowing to filter by set fields. Returns publicKeys or accounts mapped to those publicKeys; filtered to remove any accounts closed during the query process.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @returns {GetPublicKeys || MarketPositionAccounts} publicKeys or accounts meeting query requirements filtered to remove any accounts closed during the query process
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const marketPositions = await MarketPositions.marketPositionQuery(program)
 *      .filterByMarket(marketPk)
 *      .filterByPaid(false)
 *      .fetch();
 *
 * Returns all market positions created for the given market that have not yet been paid out.
 */
export class MarketPositions extends AccountQuery<MarketPosition> {
  public static marketPositionQuery(program: Program) {
    return new MarketPositions(program);
  }

  private purchaser = new PublicKeyCriterion(8);
  private market = new PublicKeyCriterion(8 + 32);
  private paid = new BooleanCriterion(8 + 32 + 32);

  constructor(program: Program) {
    super(program, "MarketPosition");
    this.setFilterCriteria(this.purchaser, this.market, this.paid);
  }

  private toFilter(offset: number, bytes: string): MemcmpFilter {
    return { memcmp: { offset: offset, bytes: bytes } };
  }

  filterByPurchaser(purchaser: PublicKey): MarketPositions {
    this.purchaser.setValue(purchaser);
    return this;
  }

  filterByMarket(market: PublicKey): MarketPositions {
    this.market.setValue(market);
    return this;
  }
  filterByPaid(paid: boolean): MarketPositions {
    this.paid.setValue(paid);
    return this;
  }
}
