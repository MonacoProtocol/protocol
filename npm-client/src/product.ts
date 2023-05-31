import { Keypair, PublicKey, Signer, SystemProgram } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { ClientResponse, ResponseFactory } from "../types";
import { CreateProductResponse } from "../types/product";
import { findProductPda } from "./utils";

/**
 * Register a new product config account on the Monaco Protocol, this will contain the wallet that commission will be paid into
 * for orders which are placed using this product.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param productTitle {string} title of product
 * @param commissionRate {number} rate of commission to be deducted on order settlement
 * @param commissionEscrow {PublicKey} address of wallet commission will be paid to on order settlement
 * @param authority {Keypair | undefined} address of wallet with ownership over this product, if not provided will default to the current provider
 *
 * @example
 *
 * const authorityPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33B');
 * const productTitle = "EXAMPLE_BETTING_EXCHANGE";
 * const commissionRate = 1.23 // 1.23% commission rate
 * const product = await createproduct(program, productTitle, commissionRate, authority);
 */
export async function createProduct(
  program: Program,
  productTitle: string,
  commissionRate: number,
  commissionEscrow: PublicKey,
  authority?: Keypair,
): Promise<ClientResponse<CreateProductResponse>> {
  const response = new ResponseFactory({} as CreateProductResponse);

  const defaultAuthority = authority == undefined;
  const productPk = await findProductPda(program, productTitle);
  const tnxID = await program.methods
    .createProduct(productTitle, commissionRate)
    .accounts({
      product: productPk,
      commissionEscrow: commissionEscrow,
      authority: defaultAuthority
        ? program.provider.publicKey
        : authority.publicKey,
      payer: program.provider.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers(defaultAuthority ? [] : [authority])
    .rpc()
    .catch((e) => {
      response.addError(e);
    });

  response.addResponseData({
    productPk: productPk,
    tnxID: tnxID,
  });

  return response.body;
}

/**
 * Update commission rate for an existing product config
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param productTitle {string} title of product
 * @param commissionRate {number} rate of commission to be deducted on order settlement
 * @param authorityPk {PublicKey} address wallet with ownership over this product
 *
 * @example
 *
 * const authorityPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33B');
 * const productTitle = "EXAMPLE_BETTING_EXCHANGE";
 * const commissionRate = 1.23 // 1.23% commission rate
 * const product = await updateProductCommissionRate(program, productTitle, commissionRate, authority);
 */
export async function updateProductCommissionRate(
  program: Program,
  productTitle: string,
  commissionRate: number,
  authorityPk: PublicKey,
): Promise<ClientResponse<CreateProductResponse>> {
  const response = new ResponseFactory({} as CreateProductResponse);

  const productPk = await findProductPda(program, productTitle);
  const tnxID = await program.methods
    .updateProductCommissionRate(productTitle, commissionRate)
    .accounts({
      product: productPk,
      authority: authorityPk,
    })
    .rpc()
    .catch((e) => {
      response.addError(e);
    });

  response.addResponseData({
    productPk: productPk,
    tnxID: tnxID,
  });

  return response.body;
}

/**
 * Update address of commission escrow account for an existing product config
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param productTitle {string} title of product
 * @param updatedEscrowPk {PublicKey} address of wallet commission will be paid to on order settlement
 * @param authorityPk {PublicKey} address wallet with ownership over this product
 *
 * @example
 *
 * const authorityPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33B');
 * const productTitle = "EXAMPLE_BETTING_EXCHANGE";
 * const updatedEscrowPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33B');
 * const product = await updateProductCommissionEscrow(program, productTitle, commissionRate, authority);
 */
export async function updateProductCommissionEscrow(
  program: Program,
  productTitle: string,
  updatedEscrowPk: PublicKey,
  authorityPk: PublicKey,
): Promise<ClientResponse<CreateProductResponse>> {
  const response = new ResponseFactory({} as CreateProductResponse);

  const productPk = await findProductPda(program, productTitle);
  const tnxID = await program.methods
    .updateProductCommissionEscrow(productTitle, updatedEscrowPk)
    .accounts({
      product: productPk,
      authority: authorityPk,
    })
    .rpc()
    .catch((e) => {
      response.addError(e);
    });

  response.addResponseData({
    productPk: productPk,
    tnxID: tnxID,
  });

  return response.body;
}

/**
 * Update authority of product config account
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param productTitle {string} title of product
 * @param updatedAuthoritySigner {Signer}  signing keypair of new authority
 * @param authorityPk {PublicKey} address wallet with ownership over this product
 *
 * @example
 *
 * const authorityPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33B');
 * const updatedAuthorityPk = new PublicKey('8o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33B');
 * const productTitle = "EXAMPLE_BETTING_EXCHANGE";
 * const product = await updateProductAuthority(program, productTitle, commissionRate, authority);
 */
export async function updateProductAuthority(
  program: Program,
  productTitle: string,
  updatedAuthoritySigner: Signer,
  authorityPk: PublicKey,
): Promise<ClientResponse<CreateProductResponse>> {
  const response = new ResponseFactory({} as CreateProductResponse);

  const productPk = await findProductPda(program, productTitle);
  const tnxID = await program.methods
    .updateProductAuthority(productTitle)
    .accounts({
      product: productPk,
      authority: authorityPk,
      updatedAuthority: updatedAuthoritySigner.publicKey,
    })
    .signers([updatedAuthoritySigner])
    .rpc()
    .catch((e) => {
      response.addError(e);
    });

  response.addResponseData({
    productPk: productPk,
    tnxID: tnxID,
  });

  return response.body;
}
