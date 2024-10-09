import { AccountInfo, PublicKey, RpcResponseAndContext } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { ClientResponse, GetPublicKeys, ResponseFactory } from "../../types";
import { AccountQueryResult, AccountResult } from "../../types/account_query";
import { Criterion, toFilters } from "./filtering";

export abstract class AccountQuery<T> {
  private program: Program;
  private readonly accountName: string;
  private readonly sortFunc?: (a: T, b: T) => number;

  private filterCriteria: Criterion<unknown>[] = [];

  protected constructor(
    program: Program,
    accountName: string,
    sortFunc?: (a: T, b: T) => number,
  ) {
    this.program = program;
    this.accountName = accountName;
    this.sortFunc = sortFunc;
  }

  protected setFilterCriteria(...filterCriteria: Criterion<unknown>[]) {
    this.filterCriteria = filterCriteria;
  }

  public async fetchPublicKeys(): Promise<ClientResponse<GetPublicKeys>> {
    const response = new ResponseFactory({} as GetPublicKeys);
    const connection = this.program.provider.connection;
    try {
      const accounts = await connection.getProgramAccounts(
        this.program.programId,
        {
          dataSlice: { offset: 0, length: 0 }, // fetch without any data.
          filters: toFilters(this.accountName, ...this.filterCriteria),
        },
      );
      response.addResponseData({
        publicKeys: accounts.map((account) => account.pubkey),
      });
    } catch (e) {
      response.addError(e);
    }
    return response.body;
  }

  public async fetch(): Promise<ClientResponse<AccountQueryResult<T>>> {
    const response = new ResponseFactory({} as AccountQueryResult<T>);
    const publicKeys = await this.fetchPublicKeys();

    if (!publicKeys.success) {
      response.addErrors(publicKeys.errors);
      return response.body;
    }

    try {
      const batches = this.chunk(publicKeys.data.publicKeys, 99);
      const rpcResponseAndContexts = await Promise.all(
        batches.map((batch) =>
          this.program.provider.connection.getMultipleAccountsInfoAndContext(
            batch,
          ),
        ),
      );

      let slot = 0;
      const accountInfos = rpcResponseAndContexts
        .map(
          (
            rpcResponseAndContext: RpcResponseAndContext<
              (AccountInfo<Buffer> | null)[]
            >,
          ) => {
            slot =
              slot == 0
                ? rpcResponseAndContext.context.slot
                : Math.min(slot, rpcResponseAndContext.context.slot);
            return rpcResponseAndContext.value;
          },
        )
        .flat();

      const decodedAccounts = accountInfos.map((accountInfo) =>
        accountInfo
          ? (this.program.coder.accounts.decode(
              this.accountName,
              accountInfo.data,
            ) as T)
          : null,
      );

      const accounts = publicKeys.data.publicKeys
        .map((publicKey, i) => {
          return {
            publicKey,
            accountInfo: accountInfos[i],
            account: decodedAccounts[i],
          };
        })
        .filter((o) => o.account) as AccountResult<T>[];

      if (this.sortFunc) {
        const comparator = this.sortFunc; //error TS2722: Cannot invoke an object which is possibly 'undefined'.
        accounts.sort((a, b) => comparator(a.account, b.account));
      }

      response.addResponseData({ accounts, slot });
    } catch (e) {
      response.addError(e);
    }
    return response.body;
  }

  private chunk(input: PublicKey[], chunkSize: number): PublicKey[][] {
    const result: PublicKey[][] = [];
    for (let i = 0; i < input.length; i += chunkSize) {
      result.push(input.slice(i, i + chunkSize));
    }
    return result;
  }
}
