import type { Source, SourceKind } from "../contract";

export interface SearchHit {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  content: string;
  kind: SourceKind;
  publishedAt?: string;
  query?: string;
}

export interface ResearchSource extends Source {
  /** Full cleaned text used only inside the server pipeline. */
  content: string;
  query?: string;
}

/** Human-readable reason a provider returned no usable result. */
export type SearchFailureReason =
  | "no results"
  | "timeout"
  | "rate limited"
  | "blocked"
  | "server error"
  | "network failure"
  | `HTTP ${number}`;

/** A provider failure that the search orchestrator can report honestly. */
export class SearchProviderError extends Error {
  readonly provider: string;
  readonly reason: SearchFailureReason;

  constructor(provider: string, reason: SearchFailureReason) {
    super(`${provider}: ${reason}`);
    this.name = "SearchProviderError";
    this.provider = provider;
    this.reason = reason;
  }
}

/** Per-provider counts included in the Methodology and PDF research log. */
export interface ProviderCount {
  provider: string;
  queries: number;
  hits: number;
  failures: number;
  reasons: string[];
}

export type SearchStats = Record<string, ProviderCount>;
