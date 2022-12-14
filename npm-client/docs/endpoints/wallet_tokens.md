<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

### Table of Contents

*   [getWalletTokenAccount][1]
    *   [Parameters][2]
    *   [Examples][3]
*   [getWalletTokenAccounts][4]
    *   [Parameters][5]
    *   [Examples][6]
*   [getWalletTokenBalancesWithSol][7]
    *   [Parameters][8]
    *   [Examples][9]

## getWalletTokenAccount

For the provided spl-token publicKey, get the token account for the program provider wallet.

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `tokenMint` **PublicKey** {PublicKey} publicKey of the spl-token

### Examples

```javascript
const mintPk = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
const walletTokenAccount = await getWalletTokenAccount(program, mintPk)
```

Returns **GetWalletTokenAccountResponse** token account publicKey for the provided wallet and the provided tokenAccountPK

## getWalletTokenAccounts

For the provided list of spl-token publicKeys, get the associated spl-token account for the program provider wallet.

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `tokenMints` **[Array][10]\<PublicKey>** {PublicKey\[]} publicKeys of spl-tokens

### Examples

```javascript
const mintPk1 = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
const mintPk2 = new PublicKey('DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ')
const mintPks = [mintPk1, mintPk2]
const walletTokenAccounts = await getWalletTokenAccounts(program, mintPks)
```

Returns **GetWalletTokenAccountsResponse** token account publicKeys for the provided wallet and the provided tokenAccountPKs

## getWalletTokenBalancesWithSol

For the provided token publicKeys, return their balances and SOL balance of the program provider wallet; if no account is found, returns zero amounts.

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `tokenMints` **[Array][10]\<PublicKey>** {PublicKey\[]} publicKeys of spl-tokens

### Examples

```javascript
const mintPk1 = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
const mintPk2 = new PublicKey('DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ')
const mintPks = [mintPk1, mintPk2]
const walletBalances = await getWalletTokenBalancesWithSol(program, mintPks)
```

Returns **GetWalletBalancesResponse** balances of the supplied token accounts and SOL account; if no account is found, returns zero amounts

[1]: #getwallettokenaccount

[2]: #parameters

[3]: #examples

[4]: #getwallettokenaccounts

[5]: #parameters-1

[6]: #examples-1

[7]: #getwallettokenbalanceswithsol

[8]: #parameters-2

[9]: #examples-2

[10]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array
