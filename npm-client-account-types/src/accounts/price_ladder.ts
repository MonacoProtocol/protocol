import {PublicKey} from "@solana/web3.js";

export interface PriceLadderAccount {
    authority: PublicKey;
    maxNumberOfPrices: number;
    prices: number[];
}
