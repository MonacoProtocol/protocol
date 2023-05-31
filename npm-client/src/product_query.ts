import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { ClientResponse, ResponseFactory, GetPublicKeys } from "../types";
import { PublicKeyCriterion, toFilters } from "./queries";
import { Product, ProductAccounts } from "../types/product";

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
export class Products {
  public static productQuery(program: Program) {
    return new Products(program);
  }

  private program: Program;

  private authority: PublicKeyCriterion = new PublicKeyCriterion(8);
  private payer: PublicKeyCriterion = new PublicKeyCriterion(8 + 32);

  constructor(program: Program) {
    this.program = program;
  }

  filterByAuthority(authority: PublicKey): Products {
    this.authority.setValue(authority);
    return this;
  }

  filterByPayer(payer: PublicKey): Products {
    this.payer.setValue(payer);
    return this;
  }

  /**
   *
   * @returns {GetPublicKeys} list of all fetched product publicKeys
   */
  async fetchPublicKeys(): Promise<ClientResponse<GetPublicKeys>> {
    const response = new ResponseFactory({} as GetPublicKeys);
    const connection = this.program.provider.connection;

    try {
      const accounts = await connection.getProgramAccounts(
        this.program.programId,
        {
          dataSlice: { offset: 0, length: 0 }, // fetch without any data.
          filters: toFilters("product", this.authority, this.payer),
        },
      );
      const publicKeys = accounts.map((account) => account.pubkey);
      response.addResponseData({
        publicKeys: publicKeys,
      });
    } catch (e) {
      response.addError(e);
    }

    return response.body;
  }

  /**
   *
   * @returns {ProductAccounts} fetched product accounts mapped to their publicKey
   */
  async fetch(): Promise<ClientResponse<ProductAccounts>> {
    const response = new ResponseFactory({} as ProductAccounts);
    const accountPublicKeys = await this.fetchPublicKeys();

    if (!accountPublicKeys.success) {
      response.addErrors(accountPublicKeys.errors);
      return response.body;
    }

    try {
      const accountsWithData =
        (await this.program.account.product.fetchMultiple(
          accountPublicKeys.data.publicKeys,
        )) as Product[];

      const result = accountPublicKeys.data.publicKeys
        .map((accountPublicKey, i) => {
          return { publicKey: accountPublicKey, account: accountsWithData[i] };
        })
        .filter((o) => o.account);

      response.addResponseData({
        productAccounts: result,
      });
    } catch (e) {
      response.addError(e);
    }

    return response.body;
  }
}
