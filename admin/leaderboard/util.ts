import axios from "axios";
import { CLUSTER, TOKEN_MINT } from "./data";

export async function fetchTokenHolderData(
  cluster: string = CLUSTER,
  tokenMint: string = TOKEN_MINT,
) {
  const response = await axios.get(`/token/holders`, {
    baseURL: `https://api-${cluster}.solscan.io/`,
    params: {
      token: tokenMint,
      offset: 0,
      size: 20,
    },
    headers: {
      Accept: "application/json",
    },
  });

  return response.data.data.result;
}

export async function fetchTokenData(
  cluster: string = CLUSTER,
  tokenMint: string = TOKEN_MINT,
) {
  const response = await axios.get(`/account`, {
    baseURL: `https://api-${cluster}.solscan.io/`,
    params: {
      address: tokenMint,
    },
    headers: {
      Accept: "application/json",
    },
  });

  return response.data.data.tokenInfo;
}

export function numberAsPnlString(value: number) {
  if (value == 0) {
    return "0.00";
  }
  return value > 0 ? `+${value.toFixed(2)}` : `${value.toFixed(2)}`;
}

export function checkEnumValue(value: any, jsonKey: string) {
  return Object.prototype.hasOwnProperty.call(value, jsonKey);
}
