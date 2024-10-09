import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { PublicKeyCriterion } from "./queries/filtering";
import { Product } from "../types/product";
import { AccountQuery } from "./queries/account_query";

/**
 * Base product query builder allowing to filter by set fields. Returns publicKeys or accounts mapped to those publicKeys; filtered to remove any accounts closed during the query process.
 *
 * @param program {program} protocol_product program initialized by the consuming client
 * @returns {GetPublicKeys || ProductAccounts} publicKeys or accounts meeting query requirements
 *
 * @example
 *
 * const authority = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const payer = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
 * const products = await Products.productQuery(program)
 *       .filterByPayer(marketPk)
 *       .filterByAuthority(purchaserPk)
 *       .fetch();
 *
 * // Returns all open product accounts for the specified payer and authority.
 */
export class Products extends AccountQuery<Product> {
  public static productQuery(program: Program) {
    return new Products(program);
  }

  private authority: PublicKeyCriterion = new PublicKeyCriterion(8);
  private payer: PublicKeyCriterion = new PublicKeyCriterion(8 + 32);

  constructor(program: Program) {
    super(program, "Product");
    this.setFilterCriteria(this.authority, this.payer);
  }

  filterByAuthority(authority: PublicKey): Products {
    this.authority.setValue(authority);
    return this;
  }

  filterByPayer(payer: PublicKey): Products {
    this.payer.setValue(payer);
    return this;
  }
}
