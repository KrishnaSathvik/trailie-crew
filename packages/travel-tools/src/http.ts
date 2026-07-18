import { TravelProviderHttpError } from "./errors";

export type TravelFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchTravelJson(
  input: URL,
  configuration: {
    allowedHosts: ReadonlySet<string>;
    fetcher?: TravelFetcher;
    headers?: HeadersInit;
    signal?: AbortSignal;
    timeoutMs?: number;
    maximumBytes?: number;
  },
): Promise<unknown> {
  if (
    input.protocol !== "https:" ||
    !configuration.allowedHosts.has(input.hostname)
  )
    throw new TravelProviderHttpError(400);
  const timeout = AbortSignal.timeout(configuration.timeoutMs ?? 10_000);
  const signal = configuration.signal
    ? AbortSignal.any([configuration.signal, timeout])
    : timeout;
  const response = await (configuration.fetcher ?? fetch)(input, {
    headers: configuration.headers,
    signal,
  });
  if (!response.ok) throw new TravelProviderHttpError(response.status);
  const text = await response.text();
  if (text.length > (configuration.maximumBytes ?? 1_000_000))
    throw new SyntaxError("travel_provider_response_too_large");
  return JSON.parse(text) as unknown;
}
