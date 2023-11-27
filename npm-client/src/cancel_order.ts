import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { signAndSendInstructions } from "./utils";
import {
  ClientResponse,
  ResponseFactory,
  OrderTransactionResponse,
  CancelOrdersResponse,
} from "../types";
import {
  buildCancelOrderInstruction,
  buildCancelOrdersForMarketInstructions,
} from "./cancel_order_instruction";
import { MarketPosition, Order } from "../types";

/**
 * For the provided order publicKey, cancel the order if the program provider owns the order.Orders can be cancelled if they:
 *
 * - Have the status of OPEN
 * - Are partially matched (only unmatched stake will be cancelled)
 *
 * The transaction can then be optionally confirmed with the confirmTransaction() endpoint.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param orderPk {PublicKey} publicKey of the order to cancel
 * @param mintPk {PublicKey} Optional: publicKey of the mint account used for market entry (e.g. USDT), if not provided the market token account will be fetched from the market
 * @returns {OrderTransactionResponse} the provided order publicKey and the transactionId for the request, this ID can be used to confirm the success of the transaction
 *
 * @example
 *
 * const orderPk = new PublicKey('Fy7WiqBy6MuWfnVjiPE8HQqkeLnyaLwBsk8cyyJ5WD8X')
 * const cancelledOrder = await cancelOrder(program, orderPk)
 *
 * // optional
 * const confirmed = await (confirmTransaction(program, cancelledOrder.data.tnxID)).success
 */
export async function cancelOrder(
  program: Program,
  orderPk: PublicKey,
  mintPk?: PublicKey,
): Promise<ClientResponse<OrderTransactionResponse>> {
  const response = new ResponseFactory({} as OrderTransactionResponse);

  const instructionResponse = await buildCancelOrderInstruction(
    program,
    orderPk,
    mintPk,
  );
  const transaction = await signAndSendInstructions(program, [
    instructionResponse.data.instruction,
  ]);

  if (!transaction.success) {
    response.addErrors(transaction.errors);
    return response.body;
  }

  response.addResponseData({
    orderPk: orderPk,
    tnxID: transaction.data.signature,
  });

  return response.body;
}

/**
 * For the provided market publicKey, attempt to cancel all cancellable orders owned by the program provider wallet. Orders can be cancelled if they:
 *
 * - Have the status of OPEN
 * - Are partially matched (only unmatched stake will be cancelled)
 *
 * The transactions can then be optionally confirmed with the confirmTransaction() endpoint.
 *
 * @param program {program} anchor program initialized by the consuming client
 * @param marketPk {PublicKey} publicKey of a market
 * @returns {CancelOrdersResponse} list of all the successfully submitted transactionIDs, list of all the failed-to-cancel order publicKeys
 *
 * @example
 *
 * const marketPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D')
 * const cancelledOrders = await cancelOrdersForMarket(program, marketPk)
 */
export async function cancelOrdersForMarket(
  program: Program,
  marketPk: PublicKey,
): Promise<ClientResponse<CancelOrdersResponse>> {
  const response = new ResponseFactory({} as CancelOrdersResponse);

  const orderInstructions = await buildCancelOrdersForMarketInstructions(
    program,
    marketPk,
  );

  if (!orderInstructions.success) {
    response.addErrors(orderInstructions.errors);
    return response.body;
  }

  const failedCancellationOrders: PublicKey[] = [];
  const tnxIDs: string[] = [];
  orderInstructions.data.orderInstructions.forEach(async (orderInstruction) => {
    const transaction = await signAndSendInstructions(program, [
      orderInstruction.instruction,
    ]);
    if (!transaction.success) {
      failedCancellationOrders.push(orderInstruction.orderPk);
      response.addErrors(transaction.errors);
    } else {
      tnxIDs.push(transaction.data.signature);
    }
  });

  response.addResponseData({
    failedCancellationOrders,
    tnxIDs,
  });
  return response.body;
}

/**
 * For the provided order and market position calculate amount that will be refunded if order gets canceled.
 *
 * @param order {Order} order to be canceled
 * @param marketPosition {MarketPosition} market position of the order's owner
 * @returns the amount of the refund in raw form; this means it needs to be divided by the mint decimals before it can be dispalyed
 *
 * @example
 *
 * const orderPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D');
 * const order = await getOrder(program, orderPk);
 * const marketPositionPk = new PublicKey('7o1PXyYZtBBDFZf9cEhHopn2C9R4G6GaPwFAxaNWM33D');
 * const marketPosition = await getMarketPosition(program, marketPositionPk);
 * const refundAmount = await calculateOrderCancellationRefund(order, marketPosition);
 */
export function calculateOrderCancellationRefund(
  order: Order,
  marketPosition: MarketPosition,
): number {
  const unmatchedExposures = marketPosition.unmatchedExposures.map((value) =>
    value.toNumber(),
  );
  const matchedExposures = marketPosition.marketOutcomeSums.map(
    (value) => -Math.min(value.toNumber(), 0),
  );

  const totalExposureBefore = totalExposure(
    unmatchedExposures,
    matchedExposures,
  );

  if (order.forOutcome) {
    for (let i = 0; i < unmatchedExposures.length; i++) {
      if (i == order.marketOutcomeIndex) {
        continue;
      }
      unmatchedExposures[i] -= order.stakeUnmatched;
    }
  } else {
    const orderExposure =
      order.stakeUnmatched * order.expectedPrice - order.stakeUnmatched;
    unmatchedExposures[order.marketOutcomeIndex] -= orderExposure;
  }

  return (
    totalExposureBefore - totalExposure(unmatchedExposures, matchedExposures)
  );
}

function totalExposure(
  unmatchedExposures: number[],
  matchedExposures: number[],
): number {
  const minLength = Math.min(
    matchedExposures.length,
    unmatchedExposures.length,
  );

  const totalExposures = Array.from(
    { length: minLength },
    (_, index) => matchedExposures[index] + unmatchedExposures[index],
  );

  return Math.max(...totalExposures);
}
