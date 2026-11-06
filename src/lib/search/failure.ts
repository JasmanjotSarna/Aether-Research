import { SearchProviderError, type SearchFailureReason } from "./types";

/** Turn an HTTP status into a short, human reason for a failed tool event. */
export function statusReason(status: number): SearchFailureReason {
  if (status === 429) return "rate limited";
  if (status === 401 || status === 403) return "blocked";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "server error";
  return `HTTP ${status}`;
}

export function providerFailure(provider: string, reason: SearchFailureReason): SearchProviderError {
  return new SearchProviderError(provider, reason);
}

/** Extract a human reason from anything a provider throws. */
export function failureReason(error: unknown): SearchFailureReason {
  if (error instanceof SearchProviderError) return error.reason;
  return "network failure";
}

export function isProviderAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) && error instanceof Error && error.name === "AbortError";
}
