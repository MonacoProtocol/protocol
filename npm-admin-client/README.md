# Monaco Protocol Admin Client

NPM package to interface with admin functionality for the Monaco Protocol program on the [Solana network](https://solana.com/developers). The Monaco Protocol provides a decentralized liquidity network for wagering on binary-outcome events.

The package opens up admin-facing interactions with the protocol including:

- Create markets
- Manage markets
- Manage admin permissions

# Documentation

All endpoints exported by the library contain detailed doc strings and examples confirming to the JSDoc format. These doc strings can be viewed separately in the [docs](./docs/) directory.

## Generating Docs

Docs are generated using [documentationjs](https://github.com/documentationjs/documentation). 

```
npm run generateDocs
```

# Client Response Format

All endpoints in the client return the same response format:

```
export type ClientResponse<T> = {
  success: boolean;
  errors: object[];
  data: T;
};
```

Each endpoint defines its own data type used in the response, for example: `createOrderUiStake` returns `Promise<ClientResponse<CreateOrderResponse>>`

```
export type CreateOrderResponse = {
  orderPk: PublicKey;
  tnxID: string | void;
};
```

## Errors

Errors are purposely left loosely typed as an `object[]` so that the client can remain as agnostic as possible and pass through unfiltered errors regardless of origin.

If any error is encountered during a request, the client will return `success: false` and data may come back `undefined`.
