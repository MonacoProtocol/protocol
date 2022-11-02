import { PublicKey } from "@solana/web3.js";

export enum Operator {
  MARKET = "MARKET",
  CRANK = "CRANK",
  ADMIN = "ADMIN",
}

export type AuthoriseOperatorResponse = {
  tnxId: string;
  authorisedOperatorsPk: PublicKey;
  operatorPk: PublicKey;
};

export type AuthorisedOperatorsAccount = {
  authority: PublicKey;
  operatorList: PublicKey[];
};

export type AuthorisedOperatorsAccountResponse = {
  publicKey: PublicKey;
  operatorsAccount: AuthorisedOperatorsAccount;
};

export type CheckOperatorRolesResponse = {
  operatorPk: PublicKey;
  admin: boolean;
  market: boolean;
  crank: boolean;
};
