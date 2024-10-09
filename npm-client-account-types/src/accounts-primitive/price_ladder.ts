import {PriceLadderAccount} from "../accounts/price_ladder";

export interface PriceLadderPrimitive extends Omit<PriceLadderAccount, "authority"> {
    authority: string;
}
