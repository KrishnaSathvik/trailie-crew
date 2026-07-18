export type TravelProviderErrorCode =
  | "invalid_input"
  | "invalid_key"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable"
  | "malformed_response";

export type NormalizedTravelProviderError = Readonly<{
  code: TravelProviderErrorCode;
  retryable: boolean;
  httpStatus: number | null;
}>;

export class TravelProviderHttpError extends Error {
  constructor(
    readonly status: number,
    message = "travel_provider_http_error",
  ) {
    super(message);
    this.name = "TravelProviderHttpError";
  }
}

export function normalizeTravelProviderError(
  error: unknown,
): NormalizedTravelProviderError {
  if (error instanceof TravelProviderHttpError) {
    if (error.status === 400 || error.status === 422)
      return {
        code: "invalid_input",
        retryable: false,
        httpStatus: error.status,
      };
    if (error.status === 401 || error.status === 403)
      return {
        code: "invalid_key",
        retryable: false,
        httpStatus: error.status,
      };
    if (error.status === 404)
      return {
        code: "not_found",
        retryable: false,
        httpStatus: error.status,
      };
    if (error.status === 429)
      return {
        code: "rate_limited",
        retryable: true,
        httpStatus: error.status,
      };
    return {
      code: "provider_unavailable",
      retryable: error.status >= 500,
      httpStatus: error.status,
    };
  }
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  )
    return { code: "timeout", retryable: true, httpStatus: null };
  if (error instanceof SyntaxError)
    return {
      code: "malformed_response",
      retryable: false,
      httpStatus: null,
    };
  return {
    code: "provider_unavailable",
    retryable: true,
    httpStatus: null,
  };
}
