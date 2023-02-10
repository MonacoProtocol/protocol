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

    /*
    Cancelation
     */
    #[msg("Order Cancelation: Order is not cancellable")]
    CancelOrderNotCancellable,
    #[msg("Core Cancelation: purchaser mismatch")]
    CancelationPurchaserMismatch,
    #[msg("Core Cancelation: market mismatch")]
    CancelationMarketMismatch,
    #[msg("Order Cancelation: calculating payment/refund amount error")]
    CancelationPaymentAmountError,

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
    #[msg("Core Settlement: error calculating settlement payment.")]
    SettlementPaymentCalculation,

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
    #[msg("Failed to update market: invalid arguments provided.")]
    LockTimeInvalid,
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
    #[msg("matching: unknown")]
    Unknown,

    /*
    Markets
     */
    #[msg(format!("Market: title is too long, max length: {}", Market::TITLE_MAX_LENGTH))]
    MarketTitleTooLong,
    #[msg("Market: type is invalid")]
    MarketTypeInvalid,
    #[msg("Market: lock time must be in the future")]
    MarketLockTimeNotInTheFuture,
    #[msg("Market: invalid market status for operation")]
    MarketInvalidStatus,
    #[msg("Market: price list is full")]
    MarketPriceListIsFull,
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
    #[msg("Market: market is not settled")]
    MarketNotSettled,
    #[msg("Market: market is not ready to close")]
    MarketNotReadyToClose,
    #[msg("Market: market authority does not match operator")]
    MarketAuthorityMismatch,

    /*
    Product Config
     */
    #[msg(ProductConfig: commission rate must be >= 0 and <= 100.)]
    InvalidCommissionRate,
    #[msg(ProductConfig: title length must be between 1 and 50 characters.)]
    ProductConfigTitleLen,
    #[msg(ProductConfig: Commission supports up to 3 decimal places.)]
    CommissionPrecisionTooLarge,

    /*
    Close Account
     */
    #[msg("CloseAccount: Purchaser does not match")]
    CloseAccountPurchaserMismatch,
    #[msg("CloseAccount: Market does not match")]
    CloseAccountMarketMismatch,
}
