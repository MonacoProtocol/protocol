import {ProductAccount} from "../accounts";

export interface ProductPrimitive extends Omit<ProductAccount, 'authority' | 'payer' | 'commissionEscrow'> {
  authority: string;
  payer: string;
  commissionEscrow: string;
}
