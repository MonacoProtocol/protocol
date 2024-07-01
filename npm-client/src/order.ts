import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  ClientResponse,
  GetAccount,
  Order,
  OrderAccounts,
  orderPdaResponse,
  PendingOrders,
  ResponseFactory,
} from "../types";
import { Orders, OrderStatusFilter } from "./order_query";
import { randomSeed16 } from "./utils";

/**
 * For the provided market publicKey and wallet publicKey: add a date seed and return a Program Derived Address (PDA) and the seed used. This PDA is used for order creation.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @param purchaserPk {PublicKey} publicKey of the purchasing wallet
 * @param existingOrderSeed {Uint8Array} Optional: distinctSeed of an existing order
 * @returns {orderPdaResponse} publicKey (PDA) and the seed used to generate it
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const purchaserPk = new PublicKey('5BZWY6XWPxuWFxs2jagkmUkCoBWmJ6c4YEArr83hYBWk')
 * const OrderPda = await findOrderPda(program, marketPK, purchaserPk)
 */
export async function findOrderPda(
  program: Program,
  marketPk: PublicKey,
  purchaserPk: PublicKey,
  existingOrderSeed?: Uint8Array,
): Promise<ClientResponse<orderPdaResponse>> {
  const response = new ResponseFactory({} as orderPdaResponse);

  const distinctSeed = existingOrderSeed ? existingOrderSeed : randomSeed16();

  try {
    const [orderPk, _] = PublicKey.findProgramAddressSync(
      [marketPk.toBuffer(), purchaserPk.toBuffer(), distinctSeed],
      program.programId,
    );

    response.addResponseData({
      orderPk: orderPk,
      distinctSeed: distinctSeed,
    });
  } catch (e) {
    response.addError(e);
  }

  return response.body;
}

/**
 * For the provided order publicKey, get the order account.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param orderPk {PublicKey} publicKey of an order
 * @returns {Order} order account details
 *
 * @example
 *
 * const orderPk = new PublicKey('Fy7WiqBy6MuWfnVjiPE8HQqkeLnyaLwBsk8cyyJ5WD8X')
 * const Order = await getOrder(program, orderPk)
 */
export async function getOrder(
  program: Program,
  orderPk: PublicKey,
): Promise<ClientResponse<GetAccount<Order>>> {
  const response = new ResponseFactory({} as GetAccount<Order>);
  try {
    const order = (await program.account.order.fetch(orderPk)) as Order;
    response.addResponseData({
      publicKey: orderPk,
      account: order,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

/**
 * For the provided order publicKeys, get the order accounts.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param orderPks {PublicKey[]} a list of publicKeys of orders
 * @returns {OrderAccounts} order account details
 *
 * @example
 *
 * const orderPk1 = new PublicKey('Fy7WiqBy6MuWfnVjiPE8HQqkeLnyaLwBsk8cyyJ5WD8X')
 * const orderPk2 = new PublicKey('add5d312e671e3fd961b0210b6d8a0b444170f6b39ab')
 * const orderPks = [orderPk1, orderPk2]
 * const Order = await getOrder(program, orderPks)
 */
export async function getOrders(
  program: Program,
  orderPks: PublicKey[],
): Promise<ClientResponse<OrderAccounts>> {
  const response = new ResponseFactory({} as OrderAccounts);
  try {
    const orders = (await program.account.order.fetchMultiple(
      orderPks,
    )) as Order[];

    const result = orderPks
      .map((orderPk, i) => {
        return { publicKey: orderPk, account: orders[i] };
      })
      .filter((o) => o.account);

    response.addResponseData({
      orderAccounts: result,
    });
  } catch (e) {
    response.addError(e);
  }
  return response.body;
}

/**
 * For the provided market publicKey, return all pending orders for that market. Pending orders are classed as open orders or matched orders that have only been partially matched.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {PendingOrders} a list of all pending order accounts
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const pendingOrders = await getPendingOrdersForMarket(program, marketPK)
 */
export async function getPendingOrdersForMarket(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<PendingOrders>> {
  const response = new ResponseFactory({} as PendingOrders);

  const [matchedOrdersResponse, openOrdersResponse] = await Promise.all([
    await new Orders(program)
      .filterByMarket(marketPk)
      .filterByStatus(OrderStatusFilter.Matched)
      .fetch(),
    await new Orders(program)
      .filterByMarket(marketPk)
      .filterByStatus(OrderStatusFilter.Open)
      .fetch(),
  ]);

  return constructPendingOrdersResponse(
    response,
    matchedOrdersResponse,
    openOrdersResponse,
  ).body;
}

/**
 * For the provided market publicKey and outcome index, return all pending orders matching the criteria. Pending orders are classed as open orders or matched orders that have only been partially matched.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {PendingOrders} a list of all pending order accounts
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const outcomeIndex = 2
 * const pendingOrders = await getPendingOrdersForMarketByOutcomeIndex(program, marketPK, outcomeIndex)
 */
export async function getPendingOrdersForMarketByOutcomeIndex(
  program: Program,
  marketPk: PublicKey,
  outcomeIndex: number,
): Promise<ClientResponse<PendingOrders>> {
  const response = new ResponseFactory({} as PendingOrders);

  const [matchedOrdersResponse, openOrdersResponse] = await Promise.all([
    await new Orders(program)
      .filterByMarket(marketPk)
      .filterByMarketOutcomeIndex(outcomeIndex)
      .filterByStatus(OrderStatusFilter.Matched)
      .fetch(),
    await new Orders(program)
      .filterByMarket(marketPk)
      .filterByMarketOutcomeIndex(outcomeIndex)
      .filterByStatus(OrderStatusFilter.Open)
      .fetch(),
  ]);

  return constructPendingOrdersResponse(
    response,
    matchedOrdersResponse,
    openOrdersResponse,
  ).body;
}

/**
 * For the provided market publicKey, outcome index and forOrder bool, return all pending orders matching the criteria. Pending orders are classed as open orders or matched orders that have only been partially matched.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @param forOutcome {boolean} filter for orders that are for or against the outcome
 * @returns {PendingOrders} a list of all pending order accounts
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const outcomeIndex = 2
 * const forOutcome = false
 * const pendingOrders = await filterByMarketAndMarketOutcomeIndexAndStatusAndForOutcome(program, marketPK, outcomeIndex, forOutcome)
 */
export async function filterByMarketAndMarketOutcomeIndexAndStatusAndForOutcome(
  program: Program,
  marketPk: PublicKey,
  outcomeIndex: number,
  forOutcome: boolean,
): Promise<ClientResponse<PendingOrders>> {
  const response = new ResponseFactory({} as PendingOrders);

  const [matchedOrdersResponse, openOrdersResponse] = await Promise.all([
    await new Orders(program)
      .filterByMarket(marketPk)
      .filterByMarketOutcomeIndex(outcomeIndex)
      .filterByForOutcome(forOutcome)
      .filterByStatus(OrderStatusFilter.Matched)
      .fetch(),
    await new Orders(program)
      .filterByMarket(marketPk)
      .filterByMarketOutcomeIndex(outcomeIndex)
      .filterByForOutcome(forOutcome)
      .filterByStatus(OrderStatusFilter.Open)
      .fetch(),
  ]);

  return constructPendingOrdersResponse(
    response,
    matchedOrdersResponse,
    openOrdersResponse,
  ).body;
}

/**
 * Internal helper to construct a pending order response, returning a ResponseFactory object with pending orders or relevant errors.
 *
 * @param response {ResponseFactory} the primary response factory object for the pending orders endpoint
 * @param matchedOrders {ClientResponse<OrderAccounts>} full client response from an Orders query for matched orders
 * @param openOrders {ClientResponse<OrderAccounts>} full client response from an Orders query for open orders
 * @returns {ResponseFactory} pending orders filtered from successful matchedOrders and openOrders response objects
 *
 * @example
 *
 * const response = new ResponseFactory({} as PendingOrders)
 * const matchedOrders = await new Orders(program).filterByMarket(marketPk).filterByStatus(OrderStatus.Matched).fetch(),
 * const openOrders = await new Orders(program).filterByMarket(marketPk).filterByStatus(OrderStatus.Open).fetch(),
 * return constructPendingOrdersResponse(matchedOrders, openOrders).body
 */
function constructPendingOrdersResponse(
  response: ResponseFactory,
  matchedOrders: ClientResponse<OrderAccounts>,
  openOrders: ClientResponse<OrderAccounts>,
): ResponseFactory {
  if (!matchedOrders.success || !openOrders.success) {
    response.addErrors(matchedOrders.errors);
    response.addErrors(openOrders.errors);
    return response;
  }

  const pendingOrders = filterPendingOrders(
    matchedOrders.data.orderAccounts,
    openOrders.data.orderAccounts,
  );

  response.addResponseData({
    pendingOrders: pendingOrders,
  });

  return response;
}

/**
 * Internal helper function to filter out fully matched orders and combine the remaining with open orders in order to return pending orders.
 *
 * @param matchedOrders {GetAccount<Order>[]} list of matched orders obtained through an Orders query
 * @param openOrders {GetAccount<Order>[]} list of open orders obtained through an Orders query
 * @returns {GetAccount<Order>[]} list of pending orders
 *
 * @example
 *
 * const matchedOrders = await new Orders(program).filterByMarket(marketPk).filterByStatus(OrderStatus.Matched).fetch(),
 * const openOrders = await new Orders(program).filterByMarket(marketPk).filterByStatus(OrderStatus.Open).fetch(),
 * const pendingOrders = filterPendingOrders(matchedOrders.data.orderAccounts, openOrders.data.orderAccounts)
 */
function filterPendingOrders(
  matchedOrders: GetAccount<Order>[],
  openOrders: GetAccount<Order>[],
): GetAccount<Order>[] {
  const partiallyMatchedOrders = matchedOrders.filter(
    (order) => order.account.stakeUnmatched.toNumber() > 0,
  );

  const pendingOrders = partiallyMatchedOrders.concat(openOrders);

  return pendingOrders;
}
