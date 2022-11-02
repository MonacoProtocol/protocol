enum ClientErrors {
  M001 = "No cancellable orders found.",
}

export type ClientError = {
  errorCode: string;
  errorMessage: ClientErrors;
};

export const NoCancellableOrdersFound: ClientError = {
  errorCode: "M001",
  errorMessage: ClientErrors.M001,
};
