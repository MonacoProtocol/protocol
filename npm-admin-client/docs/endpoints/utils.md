<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

### Table of Contents

*   [findPdaWithSeeds][1]
    *   [Parameters][2]
    *   [Examples][3]
*   [confirmTransaction][4]
    *   [Parameters][5]
    *   [Examples][6]
*   [signAndSendInstructions][7]
    *   [Parameters][8]
    *   [Examples][9]
*   [signAndSendInstructionsBatch][10]
    *   [Parameters][11]
    *   [Examples][12]

## findPdaWithSeeds

Helper function to return a pda from the supplied seeds

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `seeds` **[Array][13]<([Buffer][14] | [Uint8Array][15])>** {(Buffer | Uint8Array)\[]} list of seeds to generate the pda from

### Examples

```javascript
const seed1 = Buffer.from("seed2")
const seed2 = Buffer.from("seed2")
const pda = await findPdaWithSeeds(program.programId, [seed1, seed2])
```

Returns **publicKey** pda constructed from the supplied seeds for the given program

## confirmTransaction

For the provided transaction signature, confirm the transaction.

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `signature` **[string][16]** {string | void} signature of the transaction

### Examples

```javascript
const orderInstruction = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
const transaction = await signAndSendInstruction(program, orderInstruction.data.instruction)
const confirmation = await confirmTransaction(program, transaction.data.signature);
```

Returns **ClientResponse\<unknown>** empty client response containing no data, only success state and errors

## signAndSendInstructions

Sign and send, as the provider authority, the given transaction instructions.

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `instructions` **[Array][13]\<TransactionInstruction>** {TransactionInstruction\[]} list of instruction for the transaction
*   `options` **TransactionOptions?** {TransactionOptions} optional parameters:  <ul>
        <li> computeUnitLimit - number of compute units to limit the transaction to</li>
        <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
      </ul>

### Examples

```javascript
const orderInstruction = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
const computeUnitLimit = 1400000
const computeUnitPrice = 10000
const transaction = await signAndSendInstruction(program, [orderInstruction.data.instruction], {computeUnitLimit, computeUnitPrice})
```

Returns **SignAndSendInstructionsResponse** containing the signature of the transaction

## signAndSendInstructionsBatch

Sign and send, as the provider authority, the given transaction instructions in the provided batch sizes.

Note: batches can be optimised for size by ensuring that instructions have commonality among accounts (same walletPk, same marketPk, same marketMatchingPoolPk, etc.)

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `instructions` **[Array][13]\<TransactionInstruction>** {TransactionInstruction\[]} list of instruction for the transaction
*   `options` **TransactionOptionsBatch?** {TransactionOptionsBatch} optional parameters:  <ul>
        <li> batchSize - number of instructions to pass a single transaction (defaults to 2)</li>
        <li> confirmBatchSuccess - whether to confirm each batch transaction, if true and the current batch fails, the remaining batches will not be sent</li>
        <li> computeUnitLimit - number of compute units to limit the transaction to</li>
        <li> computeUnitPrice - price in micro lamports per compute unit for the transaction</li>
      </ul>

### Examples

```javascript
const orderInstruction1 = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
...
const orderInstruction20 = await buildOrderInstructionUIStake(program, marketPk, marketOutcomeIndex, forOutcome, price, stake, productPk)
const batchSize = 5
const confirmBatchSuccess = true
const computeUnitLimit = 1400000
const computeUnitPrice = 10000
const transactions = await signAndSendInstructionsBatch(program, [orderInstruction1.data.instruction, ..., orderInstruction20.data.instruction], {batchSize, confirmBatchSuccess, computeUnitLimit, computeUnitPrice})
```

Returns **SignAndSendInstructionsBatchResponse** containing the signature of the transaction

Returns **any**&#x20;

[1]: #findpdawithseeds

[2]: #parameters

[3]: #examples

[4]: #confirmtransaction

[5]: #parameters-1

[6]: #examples-1

[7]: #signandsendinstructions

[8]: #parameters-2

[9]: #examples-2

[10]: #signandsendinstructionsbatch

[11]: #parameters-3

[12]: #examples-3

[13]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array

[14]: https://nodejs.org/api/buffer.html

[15]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array

[16]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String
