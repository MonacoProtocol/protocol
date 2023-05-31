use anchor_lang::prelude::*;

#[error_code]
pub enum CoreError {
    #[msg("Generic: math operation has failed")]
    ArithmeticError,

    /*
    Order Creation
     */
    #[msg("Order Creation: stake zero or less")]
    CreationStakeZeroOrLess,
    #[msg("Order Creation: price cannot be 1.0 or less")]
    CreationPriceOneOrLess,
    #[msg("Order Creation: decimal limit breached for market")]
    CreationStakePrecisionIsTooHigh,
    #[msg("Order Creation: market is not in a state to create Order")]
    CreationMarketNotOpen,
    #[msg("Order Creation: winning outcome already selected for market")]
    CreationMarketHasWinningOutcome,
    #[msg("Order Creation: Failed to create Order, market has locked")]
    CreationMarketLocked,
    #[msg("Order Creation: Failed to create Order, market is currently suspended")]
    CreationMarketSuspended,
    #[msg("Order Creation: Failed to create Order, selected price is invalid for outcome")]
    CreationInvalidPrice,
    #[msg("Order Creation: calculating payment/refund amount error")]
    CreationPaymentAmountError,
    #[msg("Order Creation: market is already inplay")]
    CreationMarketAlreadyInplay,

    /*
    Cancelation
     */
    #[msg("Order Cancelation: Order is not cancellable")]
    CancelOrderNotCancellable,
    #[msg("Core Cancelation: purchaser mismatch")]
    CancelationPurchaserMismatch,
    #[msg("Core Cancelation: market mismatch")]
    CancelationMarketMismatch,
    #[msg("Order Cancelation: market status invalid")]
    CancelationMarketStatusInvalid,
    #[msg("Order Cancelation: market not inplay")]
    CancelationMarketNotInplay,
    #[msg("Order Cancelation: market behaviour not valid for cancellation")]
    CancelationMarketOrderBehaviourInvalid,
    #[msg("Order Cancelation: order status invalid")]
    CancelationOrderStatusInvalid,
    #[msg("Order Cancelation: order created after market event started")]
    CancelationOrderCreatedAfterMarketEventStarted,

    /*
    Settlement
     */
    #[msg("Core Settlement: market outcome index is not valid for market")]
    SettlementInvalidMarketOutcomeIndex,
    #[msg("Core Settlement: purchaser mismatch")]
    SettlementPurchaserMismatch,
    #[msg("Core Settlement: market mismatch")]
    SettlementMarketMismatch,
    #[msg("Core Settlement: market not open")]
    SettlementMarketNotOpen,
    #[msg("Core Settlement: market not settled")]
    SettlementMarketNotSettled,
    #[msg("Core Settlement: market not ready for settlement")]
    SettlementMarketNotReadyForSettlement,
    #[msg("Core Settlement: market escrow is non zero")]
    SettlementMarketEscrowNonZero,
    #[msg("Core Settlement: error calculating settlement payment.")]
    SettlementPaymentCalculation,
    #[msg("Core Settlement: failed to enqueue payment - queue full.")]
    SettlementPaymentQueueFull,
    #[msg("Core Settlement: from/to address incorrect when processing payment.")]
    SettlementPaymentAddressMismatch,
    #[msg("Core Settlement: failed to dequeue payment as queue was empty.")]
    SettlementPaymentDequeueEmptyQueue,
    #[msg("Core Settlement: failed to process payment, escrow product mismatch")]
    SettlementPaymentEscrowProductMismatch,

    /*
    Void Markets
    */
    #[msg("Void: purchaser mismatch")]
    VoidPurchaserMismatch,
    #[msg("Void: market mismatch")]
    VoidMarketMismatch,
    #[msg("Void: market not ready for void")]
    VoidMarketNotReadyForVoid,
    #[msg("Void: error calculating void payment.")]
    VoidPaymentCalculation,
    #[msg("Void: order is already voided.")]
    VoidOrderIsVoided,

    /*
    Authorised Operator
     */
    #[msg("Authorised operator list is full")]
    AuthorisedOperatorListFull,
    #[msg("Failed to authorise operator, operator type invalid.")]
    InvalidOperatorType,
    #[msg("Unauthorised operator")]
    UnauthorisedOperator,
    #[msg("Unsupported operation")]
    UnsupportedOperation,

    /*
    Matching
     */
    #[msg("Core Settlement: purchaser mismatch")]
    MatchingPurchaserMismatch,
    #[msg("Core Matching: market mismatch")]
    MatchingMarketMismatch,
    #[msg("Core Matching: market-outcome mismatch")]
    MatchingMarketOutcomeMismatch,
    #[msg("Core Matching: expected for order")]
    MatchingExpectedAForOrder,
    #[msg("Core Matching: expected against order")]
    MatchingExpectedAnAgainstOrder,
    #[msg("Core Matching: for and against order should not be identical")]
    MatchingOrdersForAndAgainstAreIdentical,
    #[msg("Core Matching: market price mismatch")]
    MatchingMarketPriceMismatch,

    #[msg("Order Matching: status closed")]
    MatchingStatusClosed,
    #[msg("Order Matching: remaining stake too small")]
    MatchingRemainingStakeTooSmall,
    #[msg("Failed to update market: invalid arguments provided.")]
    MarketDoesNotMatch,
    #[msg(
        "There was an attempt to add an item from a matching pool queue, but the queue was full."
    )]
    MatchingQueueIsFull,
    #[msg("There was an attempt to dequeue an item from a matching pool queue, but the queue was empty.")]
    MatchingQueueIsEmpty,
    #[msg("There was an attempt to dequeue an item from a matching pool queue, but the item at the front of the queue was incorrect.")]
    IncorrectOrderDequeueAttempt,
    #[msg("The order to be matched is not at the front of the matching pool queue")]
    OrderNotAtFrontOfQueue,
    #[msg("Failed to update market: invalid arguments provided.")]
    LockTimeInvalid,
    #[msg("Failed to update market: invalid arguments provided.")]
    EventStartTimeInvalid,

    #[msg("matching: market is not in a state to match orders")]
    MarketNotOpen,
    #[msg("matching: market locked")]
    MarketLocked,
    #[msg("matching: status closed")]
    StatusClosed,
    #[msg("matching: liquidity amount update failed")]
    MatchingLiquidityAmountUpdateError,
    #[msg("matching: matched amount update failed")]
    MatchingMatchedAmountUpdateError,
    #[msg("Order Matching: calculating refund amount error")]
    MatchingRefundAmountError,
    #[msg("Order Matching: calculating payout amount error")]
    MatchingPayoutAmountError,
    #[msg("Matching: market matching pool is already inplay")]
    MatchingMarketMatchingPoolAlreadyInplay,
    #[msg("Matching: market does not have inplay enabled")]
    MatchingMarketInplayNotEnabled,
    #[msg("Matching: market is not yet inplay")]
    MatchingMarketNotYetInplay,
    #[msg("Matching: invalid market status for operation")]
    MatchingMarketInvalidStatus,
    #[msg("matching: unknown")]
    Unknown,

    /*
    Inplay
     */
    #[msg("The order is currently within the inplay delay period and the operation cannot be completed")]
    InplayDelay,

    /*
    Markets
     */
    #[msg(format!("Market: title is too long, max length: {}", Market::TITLE_MAX_LENGTH))]
    MarketTitleTooLong,
    #[msg("Market: type is invalid")]
    MarketTypeInvalid,
    #[msg("Market: lock time must be in the future")]
    MarketLockTimeNotInTheFuture,
    #[msg("Market: event start time must be in the future")]
    MarketEventStartTimeNotInTheFuture,
    #[msg(
        "Market: lock time must not be later than the event start time unless inplay is enabled"
    )]
    MarketLockTimeAfterEventStartTime,
    #[msg("Market: invalid market status for operation")]
    MarketInvalidStatus,
    #[msg("Market: price list is full")]
    MarketPriceListIsFull,
    #[msg("Market: price cannot be 1.0 or less")]
    MarketPriceOneOrLess,
    #[msg("Market: price support up to 3 decimal places only")]
    MarketPricePrecisionTooLarge,
    #[msg("mint.decimals must be >= PRICE_SCALE (3)")]
    MintDecimalsUnsupported,
    #[msg("max_decimals is too large, must be <= mint.decimals-PRICE_SCALE (3)")]
    MaxDecimalsTooLarge,
    #[msg("MarketOutcome: initialization failed")]
    MarketOutcomeInitError,
    #[msg("MarketOutcome: market status is not Initializing")]
    MarketOutcomeMarketInvalidStatus,
    #[msg("Market: cannot open market, market not initializing")]
    OpenMarketNotInitializing,
    #[msg("Market: cannot void market, market not open or initializing")]
    VoidMarketNotInitializingOrOpen,
    #[msg("Market: market is not settled or voided")]
    MarketNotSettledOrVoided,
    #[msg("Market: market is not ready to close")]
    MarketNotReadyToClose,
    #[msg("Market: market authority does not match operator")]
    MarketAuthorityMismatch,
    #[msg("Market: market inplay not enabled")]
    MarketInplayNotEnabled,
    #[msg("Market: market is already inplay")]
    MarketAlreadyInplay,
    #[msg("Market: market event not started")]
    MarketEventNotStarted,

    /*
    Close Account
     */
    #[msg("CloseAccount: Order not complete")]
    CloseAccountOrderNotComplete,
    #[msg("CloseAccount: Purchaser does not match")]
    CloseAccountPurchaserMismatch,
    #[msg("CloseAccount: Market does not match")]
    CloseAccountMarketMismatch,
    #[msg("CloseAccount: Market payment queue is not empty.")]
    CloseAccountMarketPaymentQueueNotEmpty,
}
