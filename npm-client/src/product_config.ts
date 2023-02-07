import { PublicKey, Signer, SystemProgram } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import { ClientResponse, ResponseFactory } from "../types";
import { CreateProductConfigResponse } from "../types/product_config";
import { findProductConfigPda } from "./utils";

/**
 * Register a new product config account on the Monaco Protocol, this will contain the wallet that commission will be paid into
 * for orders which are placed using this product.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param productTitle {string} title of product
 * @param commissionRate {number} rate of commission to be deducted on order settlement
 * @param commissionEscrow {PublicKey} address of wallet commission will be paid to on order settlement
 * @param authorityPk {PublicKey} address wallet with ownership over this product
 *
 * @example
 *
 * const authorityPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33B');
 * const productTitle = "EXAMPLE_BETTING_EXCHANGE";
 * const commissionRate = 1.23 // 1.23% commission rate
 * const productConfig = await createProductConfig(program, productTitle, commissionRate, authority);
 */
export async function createProductConfig(
  program: Program,
  productTitle: string,
  commissionRate: number,
  commissionEscrow: PublicKey,
  authorityPk: PublicKey,
): Promise<ClientResponse<CreateProductConfigResponse>> {
  const response = new ResponseFactory({} as CreateProductConfigResponse);

  const productConfigPk = await findProductConfigPda(program, productTitle);
  const tnxID = await program.methods
    .createProductConfig(productTitle, commissionRate)
    .accounts({
      productConfig: productConfigPk,
      commissionEscrow: commissionEscrow,
      authority: authorityPk,
      payer: program.provider.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" })
    .catch((e) => {
      response.addError(e);
    });

  response.addResponseData({
    productConfigPk: productConfigPk,
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
 * const productConfig = await updateProductCommissionRate(program, productTitle, commissionRate, authority);
 */
export async function updateProductCommissionRate(
  program: Program,
  productTitle: string,
  commissionRate: number,
  authorityPk: PublicKey,
): Promise<ClientResponse<CreateProductConfigResponse>> {
  const response = new ResponseFactory({} as CreateProductConfigResponse);

  const productConfigPk = await findProductConfigPda(program, productTitle);
  const tnxID = await program.methods
    .updateProductCommissionRate(productTitle, commissionRate)
    .accounts({
      productConfig: productConfigPk,
      authority: authorityPk,
    })
    .rpc({ commitment: "confirmed" })
    .catch((e) => {
      response.addError(e);
    });

  response.addResponseData({
    productConfigPk: productConfigPk,
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
 * const productConfig = await updateProductCommissionEscrow(program, productTitle, commissionRate, authority);
 */
export async function updateProductCommissionEscrow(
  program: Program,
  productTitle: string,
  updatedEscrowPk: PublicKey,
  authorityPk: PublicKey,
): Promise<ClientResponse<CreateProductConfigResponse>> {
  const response = new ResponseFactory({} as CreateProductConfigResponse);

  const productConfigPk = await findProductConfigPda(program, productTitle);
  const tnxID = await program.methods
    .updateProductCommissionEscrow(productTitle, updatedEscrowPk)
    .accounts({
      productConfig: productConfigPk,
      authority: authorityPk,
    })
    .rpc({ commitment: "confirmed" })
    .catch((e) => {
      response.addError(e);
    });

  response.addResponseData({
    productConfigPk: productConfigPk,
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
 * const productConfig = await updateProductAuthority(program, productTitle, commissionRate, authority);
 */
export async function updateProductAuthority(
  program: Program,
  productTitle: string,
  updatedAuthoritySigner: Signer,
  authorityPk: PublicKey,
): Promise<ClientResponse<CreateProductConfigResponse>> {
  const response = new ResponseFactory({} as CreateProductConfigResponse);

  const productConfigPk = await findProductConfigPda(program, productTitle);
  const tnxID = await program.methods
    .updateProductAuthority(productTitle)
    .accounts({
      productConfig: productConfigPk,
      authority: authorityPk,
      updatedAuthority: updatedAuthoritySigner.publicKey,
    })
    .signers([updatedAuthoritySigner])
    .rpc({ commitment: "confirmed" })
    .catch((e) => {
      response.addError(e);
    });

  response.addResponseData({
    productConfigPk: productConfigPk,
    tnxID: tnxID,
  });

  return response.body;
}
