<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

### Table of Contents

*   [OrderStatusFilter][1]
*   [Orders][2]
    *   [Parameters][3]
    *   [Examples][4]
*   [getOrdersByStatusForProviderWallet][5]
    *   [Parameters][6]
    *   [Examples][7]
*   [getOrdersByMarketForProviderWallet][8]
    *   [Parameters][9]
    *   [Examples][10]
*   [getCancellableOrdersByMarketForProviderWallet][11]
    *   [Parameters][12]
    *   [Examples][13]
*   [getOrdersByEventForProviderWallet][14]
    *   [Parameters][15]
    *   [Examples][16]

## OrderStatusFilter

## Orders

**Extends AccountQuery**

Base order query builder allowing to filter by set fields. Returns publicKeys or accounts mapped to those publicKeys; filtered to remove any accounts closed during the query process.

Some preset queries are available for convenience:

*   getOrdersByStatusForProviderWallet
*   getOrdersByMarketForProviderWallet
*   getOrdersByEventForProviderWallet

### Parameters

*   `program`  {program} anchor program initialized by the consuming client

### Examples

```javascript
const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
const purchaserPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
const orders = await Orders.orderQuery(program)
      .filterByMarket(marketPk)
      .filterByPurchaser(purchaserPk)
      .filterByStatus(OrderStatusFilter.Open)
      .fetch();

// Returns all open order accounts for the specified market and purchasing wallet.
```

## getOrdersByStatusForProviderWallet

Get all orders owned by the program provider wallet - by order status

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `status` **[OrderStatusFilter][1]** {orderStatus} status of the order, provided by the orderStatus enum

### Examples

```javascript
const status = OrderStatusFilter.Open
const orders = await getOrdersByStatusForProviderWallet(program, status)
```

Returns **OrderAccounts** fetched order accounts mapped to their publicKey

## getOrdersByMarketForProviderWallet

Get all orders owned by the program provider wallet - for the given market account

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `marketPk` **PublicKey** {PublicKey} publicKey of the market

### Examples

```javascript
const marketPk = new PublicKey("5m5RyK82FQKNzMg3eDT5GY5KpbJQJhD4RhBHSG2ux4sk")
const orders = await getOrdersByMarketForProviderWallet(program, marketPk)
```

Returns **OrderAccounts** fetched order accounts mapped to their publicKey

## getCancellableOrdersByMarketForProviderWallet

Get all cancellable orders owned by the program provider for the given market. Orders can be cancelled if they:

*   Have the status of OPEN
*   Are partially matched (only unmatched stake will be cancelled)

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `marketPk` **PublicKey** {PublicKey} publicKey of the market

### Examples

```javascript
const marketPk = new PublicKey("5m5RyK82FQKNzMg3eDT5GY5KpbJQJhD4RhBHSG2ux4sk")
const orders = await getCancellableOrdersByMarketForProviderWallet(program, marketPk)
```

Returns **OrderAccounts** fetched order accounts mapped to their publicKey

## getOrdersByEventForProviderWallet

Get all orders owned by the program provider wallet - for all markets associated with the given event account

### Parameters

*   `program` **Program** {program} anchor program initialized by the consuming client
*   `eventPk` **PublicKey** {PublicKey} publicKey of the event

### Examples

```javascript
const eventPk = new PublicKey("5gHfsqpTw6HQwQBc94mXEoFFrD9muKNmAnchJ376PRE4")
const orders = await getOrdersByEventForProviderWallet(program, eventPk)
```

Returns **OrderAccounts** fetched order accounts mapped to their publicKey

[1]: #orderstatusfilter

[2]: #orders

[3]: #parameters

[4]: #examples

[5]: #getordersbystatusforproviderwallet

[6]: #parameters-1

[7]: #examples-1

[8]: #getordersbymarketforproviderwallet

[9]: #parameters-2

[10]: #examples-2

[11]: #getcancellableordersbymarketforproviderwallet

[12]: #parameters-3

[13]: #examples-3

[14]: #getordersbyeventforproviderwallet

[15]: #parameters-4

[16]: #examples-4
