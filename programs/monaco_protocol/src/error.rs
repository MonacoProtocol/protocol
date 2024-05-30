use anchor_lang::prelude::*;

#[error_code]
pub enum CoreError {
    #[msg("Generic: math operation has failed")]
    ArithmeticError,
    #[msg("MarketLiquidities: is full")]
    MarketLiquiditiesIsFull,
    #[msg("MarketLiquidities: update error")]
    MarketLiquiditiesUpdateError,

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
    #[msg("Order Creation: Failed to create Order, provided price ladder is invalid for outcome")]
    CreationInvalidPriceLadder,
    #[msg("Order Creation: Failed to create Order, selected price is invalid for outcome")]
    CreationInvalidPrice,
    #[msg("Order Creation: calculating payment/refund amount error")]
    CreationTransferAmountError,
    #[msg("Order Creation: market is already inplay")]
    CreationMarketAlreadyInplay,
    #[msg("Order Creation: market mismatch")]
    CreationMarketMismatch,
    #[msg("Order Creation: purchaser mismatch")]
    CreationPurchaserMismatch,
    #[msg("Order Creation: expired")]
    CreationExpired,

    #[msg("Order Request Creation: request queue is full")]
    OrderRequestCreationQueueFull,
    #[msg("Order Request Creation: duplicate request already queued")]
    OrderRequestCreationDuplicateRequest,
    #[msg("Order Request Creation: invalid payer token account")]
    OrderRequestCreationInvalidPayerTokenAccount,
    #[msg("Order Request Processing: request queue is empty")]
    OrderRequestQueueIsEmpty,
    #[msg("Order Request Processing: request queue is not empty")]
    OrderRequestQueueIsNotEmpty,

    /*
    Cancelation
     */
    #[msg("Order Cancelation: Order is not cancellable")]
    CancelOrderNotCancellable,
    #[msg("Core Cancelation: purchaser mismatch")]
    CancelationPurchaserMismatch,
    #[msg("Core Cancelation: payer mismatch")]
    CancelationPayerMismatch,
    #[msg("Core Cancelation: market mismatch")]
    CancelationMarketMismatch,
    #[msg("Core Cancelation: market liquidities mismatch")]
    CancelationMarketLiquiditiesMismatch,
    #[msg("Core Cancelation: market outcome mismatch")]
    CancelationMarketOutcomeMismatch,
    #[msg("Order Cancelation: market status invalid")]
    CancelationMarketStatusInvalid,
    #[msg("Order Cancelation: market not inplay")]
    CancelationMarketNotInplay,
    #[msg("Order Cancelation: market not locked")]
    CancelationMarketNotLocked,
    #[msg("Order Cancelation: market behaviour not valid for cancellation")]
    CancelationMarketOrderBehaviourInvalid,
    #[msg("Order Cancelation: order status invalid")]
    CancelationOrderStatusInvalid,
    #[msg("Order Cancelation: order created after market event started")]
    CancelationOrderCreatedAfterMarketEventStarted,
    #[msg("Order Cancelation: liquidity too low")]
    CancelationLowLiquidity,
    #[msg("Order Cancelation: cannot cancel preplay orders until all preplay order requests are processed")]
    CancelationPreplayOrderRequestsExist,

    /*
    Settlement
     */
    #[msg("Core Settlement: market outcome index is not valid for market")]
    SettlementInvalidMarketOutcomeIndex,
    #[msg("Core Settlement: payer mismatch")]
    SettlementPayerMismatch,
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
    #[msg("Core Settlement: market funding is non zero")]
    SettlementMarketFundingNonZero,
    #[msg("Core Settlement: market matching queue not empty")]
    SettlementMarketMatchingQueueNotEmpty,
    #[msg("Core Settlement: market payment queue not empty")]
    SettlementMarketPaymentsQueueNotEmpty,
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
    #[msg("Void: matching queue must be provided for non Initializing markets")]
    VoidMarketMatchingQueueNotProvided,
    #[msg("Void: request queue must be provided for non Initializing markets")]
    VoidMarketRequestQueueNotProvided,

    /*
    Account counts
     */
    #[msg("Some accounts are not yet settled/voided for this market")]
    MarketUnsettledAccountsCountNonZero,
    #[msg("Some accounts are not yet closed for this market")]
    MarketUnclosedAccountsCountNonZero,

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
    #[msg("Core Matching: purchaser mismatch")]
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
    #[msg("Core Matching: market matching pool mismatch")]
    MatchingMarketMatchingPoolMismatch,

    #[msg("Order Matching: status closed")]
    MatchingStatusClosed,
    #[msg("Order Matching: remaining stake too small")]
    MatchingRemainingStakeTooSmall,
    #[msg("Order Matching: remaining liquidity too small")]
    MatchingRemainingLiquidityTooSmall,
    #[msg(
        "There was an attempt to add an item from a matching pool queue, but the queue was full."
    )]
    MatchingQueueIsFull,
    #[msg("There was an attempt to dequeue an item from a matching pool queue, but the queue was empty.")]
    MatchingQueueIsEmpty,
    #[msg("Matching queue is not empty.")]
    MatchingQueueIsNotEmpty,
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
    #[msg("Matching: matched stake calculated incorrectly")]
    MatchingMatchedStakeCalculationError,
    // matching pool related errors
    #[msg("Matching: matching pool empty")]
    MatchingPoolIsEmpty,
    #[msg("Matching: matching pool head mismatch")]
    MatchingPoolHeadMismatch,

    /*
    Inplay
     */
    #[msg("The order is currently within the inplay delay period and the operation cannot be completed")]
    InplayDelay,
    #[msg("Operation cannot currently be completed - market matching queue is not yet empty for inplay transition")]
    InplayTransitionMarketMatchingQueueIsNotEmpty,

    /*
    Market Type
     */
    #[msg(format!("Market type name is too long, max length: {}", MarketType::NAME_MAX_LENGTH))]
    MarketTypeNameTooLong,
    #[msg("Market type discriminator usage is incorrect for this market type")]
    MarketTypeDiscriminatorUsageIncorrect,
    #[msg("Market type value usage is incorrect for this market type")]
    MarketTypeValueUsageIncorrect,
    #[msg("Market type discriminator contains seed separator character")]
    MarketTypeDiscriminatorContainsSeedSeparator,

    /*
    PriceLadder
     */
    #[msg("PriceLadder can only be increased in size")]
    PriceLadderSizeCanOnlyBeIncreased,
    #[msg("PriceLadder is full")]
    PriceLadderIsFull,
    #[msg("Price cannot be 1.0 or less")]
    PriceOneOrLess,
    #[msg("Price support up to 3 decimal places only")]
    PricePrecisionTooLarge,

    /*
    Markets
     */
    #[msg(format!("Market: title is too long, max length: {}", Market::TITLE_MAX_LENGTH))]
    MarketTitleTooLong,
    #[msg(format!("Market Outcome: title is too long, max length: {}", MarketOutcome::TITLE_MAX_LENGTH))]
    MarketOutcomeTitleTooLong,
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
    #[msg("Market: cannot open market, must have more than 1 outcome")]
    OpenMarketNotEnoughOutcomes,
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
    #[msg("Market: market not open to allow transition to inplay")]
    MarketNotOpenForInplay,

    #[msg("Market: cannot recreate market, provided event account does not match existing market")]
    MarketEventAccountMismatch,
    #[msg("Market: cannot recreate market, provided market type account does not match existing market")]
    MarketTypeMismatch,
    #[msg("Market: cannot recreate market, provided market type discriminator does not match existing market")]
    MarketTypeDiscriminatorMismatch,
    #[msg(
        "Market: cannot recreate market, provided market type value does not match existing market"
    )]
    MarketTypeValueMismatch,
    #[msg("Market: cannot recreate market, provided mint does not match existing market")]
    MarketMintMismatch,

    /*
    Close Account
     */
    #[msg("CloseAccount: Order not complete")]
    CloseAccountOrderNotComplete,
    #[msg("CloseAccount: MarketPosition not paid")]
    CloseAccountMarketPositionNotPaid,
    #[msg("CloseAccount: Market authority does not match")]
    CloseAccountMarketAuthorityMismatch,
    #[msg("CloseAccount: Payer does not match")]
    CloseAccountPayerMismatch,
    #[msg("CloseAccount: Market does not match")]
    CloseAccountMarketMismatch,
    #[msg("CloseAccount: Market payment queue is not empty")]
    CloseAccountMarketPaymentQueueNotEmpty,
    #[msg("CloseAccount: Market matching queue is not empty")]
    CloseAccountMarketMatchingQueueNotEmpty,
    #[msg("CloseAccount: Market order request queue is not empty")]
    CloseAccountOrderRequestQueueNotEmpty,
}
