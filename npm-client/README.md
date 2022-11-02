# Monaco Protocol Client

NPM package to interface with the Monaco Protocol program on the [Solana network](https://solana.com/developers). The Monaco Protocol provides a decentralized liquidity network for wagering on binary-outcome events.

The package opens up the consumer-facing interactions with the protocol to facilitate exchanged-based applications including:

- Get markets by status/event/wagering token
- Place orders for markets
- Cancel orders
- Get market position for wallets
- Get wallet token balances

The package does not contain functionality to administer markets on the protocol. Admin functionality will be exposed through a separate package - coming soon.

# Getting Started

Examples for working with the client can be found in the [Monaco Protocol SDK Examples](https://github.com/MonacoProtocol/sdk/tree/main/examples) repository.

# Documentation

All endpoints exported by the library contain detailed doc strings and examples confirming to the JSDoc format. These doc strings can be viewed separately in the [docs](./docs/) directory.

Supplementary documentation can be accessed from the [Monaco Protocol SDK](https://github.com/MonacoProtocol/sdk/tree/main/examples).

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
