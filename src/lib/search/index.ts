/**
 * Multi-source search. Tavily is optional; the keyless path always queries
 * Wikipedia + arXiv + OpenAlex. Results are deduplicated by normalised URL and
 * ranked by publisher credibility and topical relevance.
 *
 * Every query is shortened to 3–6 keywords. A zero-result query is rewritten
 * and retried up to twice, and every provider failure carries a human reason
 * so the agent can emit truthful `tool` events.
 */

import type { Mode, ToolName } from "../contract";
import { modeConfig } from "../config";
import { assessSource } from "../credibility";
import { cleanSourceText } from "../security/content";
import type { LLMProvider } from "../llm/provider";
import type { FailoverInfo } from "../llm/client";
import { looksLikeHttpUrl } from "../security/url";
import { searchArxiv } from "./arxiv";
import { failureReason } from "./failure";
import { searchOpenAlex } from "./openalex";
import { keywordQuery, rewriteQuery } from "./query";
import { filterRelevantHits } from "./relevance";
import { searchTavily } from "./tavily";
import { searchWikipedia } from "./wikipedia";
import type {
  ProviderCount,
  ResearchSource,
  SearchHit,
  SearchStats,
} from "./types";

export interface SearchToolProgress {
  id: string;
  name: Extract<ToolName, "web_search" | "academic_search">;
  input: string;
  status: "running" | "done" | "error";
  summary?: string;
}

export interface SearchRetryInfo {
  query: string;
  nextQuery: string;
  attempt: number;
  reason: string;
}

export interface SearchOptions {
  mode: Mode;
  /** Research topic used for the deterministic and optional LLM relevance gates. */
  topic?: string;
  /** When present, a cheap LLM pass rejects off-topic hits. */
  providers?: LLMProvider[];
  tavilyKey?: string;
  signal?: AbortSignal;
  onProgress?: (progress: SearchToolProgress) => void;
  /** Called before a zero-result query is retried with a rewrite. */
  onRetry?: (info: SearchRetryInfo) => void;
  /** Per-provider hit/failure counts for the Methodology and PDF appendix. */
  onStats?: (stats: SearchStats) => void;
  onFailover?: (info: FailoverInfo) => void;
}

const MAX_QUERY_ATTEMPTS = 3;
const PROVIDERS = ["wikipedia", "arxiv", "openalex", "tavily"] as const;

interface ProviderCall {
  provider: (typeof PROVIDERS)[number];
  run: (query: string) => Promise<SearchHit[]>;
}

interface GroupResult {
  hits: SearchHit[];
  failures: number;
  reasons: string[];
  counts: Array<{ provider: string; hits: number; reason?: string }>;
}

function emptyStats(): SearchStats {
  return Object.fromEntries(
    PROVIDERS.map((provider) => [
      provider,
      { provider, queries: 0, hits: 0, failures: 0, reasons: [] } satisfies ProviderCount,
    ])
  );
}

function record(stats: SearchStats, provider: string, hits: number, reason?: string): void {
  const entry = stats[provider] ?? {
    provider,
    queries: 0,
    hits: 0,
    failures: 0,
    reasons: [],
  };
  entry.queries += 1;
  entry.hits += hits;
  if (reason) {
    entry.failures += 1;
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
  }
  stats[provider] = entry;
}

async function runGroup(
  groupName: Extract<ToolName, "web_search" | "academic_search">,
  id: string,
  query: string,
  calls: ProviderCall[],
  stats: SearchStats,
  options: SearchOptions
): Promise<GroupResult> {
  options.onProgress?.({ id, name: groupName, input: query, status: "running" });

  const settled = await Promise.allSettled(calls.map((call) => call.run(query)));
  const hits: SearchHit[] = [];
  const reasons: string[] = [];
  const counts: GroupResult["counts"] = [];
  let failures = 0;

  settled.forEach((result, index) => {
    const call = calls[index];
    if (!call) return;

    if (result.status === "fulfilled") {
      hits.push(...result.value);
      if (result.value.length === 0) {
        failures += 1;
        reasons.push(`${call.provider}: no results`);
        record(stats, call.provider, 0, "no results");
        counts.push({ provider: call.provider, hits: 0, reason: "no results" });
      } else {
        record(stats, call.provider, result.value.length);
        counts.push({ provider: call.provider, hits: result.value.length });
      }
      return;
    }

    const reason = failureReason(result.reason);
    failures += 1;
    reasons.push(`${call.provider}: ${reason}`);
    record(stats, call.provider, 0, reason);
    counts.push({ provider: call.provider, hits: 0, reason });
  });

  const detail = counts
    .map((item) => (item.reason ? `${item.provider} ${item.reason}` : `${item.provider} ${item.hits}`))
    .join("; ");
  const summary =
    hits.length > 0
      ? `${hits.length} result${hits.length === 1 ? "" : "s"} (${detail})`
      : `No results (${detail || "no providers queried"})`;

  options.onProgress?.({
    id,
    name: groupName,
    input: query,
    status: hits.length > 0 ? "done" : "error",
    summary,
  });

  return { hits, failures, reasons, counts };
}

export async function searchAll(queries: string[], options: SearchOptions): Promise<SearchHit[]> {
  const config = modeConfig(options.mode);
  const uniqueQueries = Array.from(new Set(queries.map((q) => q.trim()).filter(Boolean))).slice(
    0,
    config.queryCount
  );
  const stats = emptyStats();
  if (uniqueQueries.length === 0) {
    options.onStats?.(stats);
    return [];
  }

  const wikiLimit = config.mode === "quick" ? 2 : 3;
  const all: SearchHit[] = [];

  const webCalls: ProviderCall[] = [
    {
      provider: "wikipedia",
      run: (query) => searchWikipedia(query, wikiLimit, options.signal),
    },
  ];
  if (options.tavilyKey) {
    webCalls.push({
      provider: "tavily",
      run: (query) => searchTavily(query, options.tavilyKey as string, 4, options.signal),
    });
  }

  const academicCalls: ProviderCall[] = [
    { provider: "arxiv", run: (query) => searchArxiv(query, 3, options.signal) },
    { provider: "openalex", run: (query) => searchOpenAlex(query, 3, options.signal) },
  ];

  for (let index = 0; index < uniqueQueries.length; index++) {
    const original = uniqueQueries[index] ?? "";
    if (!original) continue;
    let query = keywordQuery(original);

    for (let attempt = 0; attempt < MAX_QUERY_ATTEMPTS; attempt++) {
      if (options.signal?.aborted) break;
      if (!query) break;

      const suffix = attempt === 0 ? "" : `-retry-${attempt}`;
      const [web, academic] = await Promise.all([
        runGroup("web_search", `web-${index + 1}${suffix}`, query, webCalls, stats, options),
        runGroup(
          "academic_search",
          `academic-${index + 1}${suffix}`,
          query,
          academicCalls,
          stats,
          options
        ),
      ]);

      const got = [...web.hits, ...academic.hits];
      if (got.length > 0) {
        all.push(...got);
        break;
      }

      if (attempt < MAX_QUERY_ATTEMPTS - 1) {
        const nextQuery = rewriteQuery(query, attempt + 1);
        if (nextQuery && nextQuery !== query) {
          options.onRetry?.({
            query,
            nextQuery,
            attempt: attempt + 1,
            reason: [...web.reasons, ...academic.reasons].slice(0, 3).join("; ") || "no results",
          });
          query = nextQuery;
          continue;
        }
      }
      break;
    }
  }

  options.onStats?.(stats);

  const seen = new Set<string>();
  const deduped: SearchHit[] = [];
  for (const hit of all) {
    if (!hit.title || !hit.url || !looksLikeHttpUrl(hit.url)) continue;
    const key = normalizeUrlKey(hit.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(hit);
  }

  // Deterministic relevance first, then the optional cheap LLM check. This is
  // the same gate `selectSources` applies, so off-topic pages never reach the
  // reader or the writer.
  const topic = options.topic?.trim() ?? "";
  const relevant = topic ? deduped.filter((hit) => isRelevantHit(hit, topic)) : deduped;
  return filterRelevantHits(
    options.providers ?? [],
    relevant,
    topic,
    options.signal,
    options.onFailover
  );
}

export function normalizeUrlKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    let path = url.pathname.replace(/\/+$/, "") || "/";
    const params = Array.from(url.searchParams.entries())
      .filter(
        ([key]) =>
          !/^utm_/i.test(key) && !["ref", "source", "fbclid", "gclid"].includes(key.toLowerCase())
      )
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length
      ? `?${params.map(([key, value]) => `${key}=${value}`).join("&")}`
      : "";
    return `${host}${path}${query}`;
  } catch {
    return null;
  }
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "about",
  "over",
  "under",
  "between",
  "what",
  "which",
  "when",
  "where",
  "why",
  "how",
  "are",
  "was",
  "were",
  "does",
  "did",
  "can",
  "could",
  "should",
  "would",
  "will",
  "your",
  "you",
  "its",
  "their",
  "than",
  "then",
  "also",
  "more",
  "most",
  "some",
  "such",
  "have",
  "has",
  "had",
  "not",
  "but",
  "all",
  "any",
  "use",
  "using",
  "研究",
]);

function topicTerms(topic: string): string[] {
  return Array.from(
    new Set(
      topic
        .toLowerCase()
        .split(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff]+/i)
        .map((term) => term.trim())
        .filter((term) => term.length > 2 && !STOPWORDS.has(term))
    )
  ).slice(0, 14);
}

function relevance(hit: SearchHit, topic: string, terms: string[]): number {
  const title = hit.title.toLowerCase();
  const blob = `${hit.title} ${hit.snippet}`.toLowerCase();
  if (terms.length === 0) return 0.5;
  let matches = 0;
  for (const term of terms) if (blob.includes(term)) matches += 1;
  let score = matches / terms.length;
  if (title.includes(topic.toLowerCase().slice(0, 60))) score += 0.2;
  if (hit.content.length > 800) score += 0.05;
  return Math.min(1, score);
}

const GENERIC_TITLE =
  /^(?:glossary|dictionary|encyclopedia|wiktionary|list\s+of|index\s+of|outline\s+of|timeline\s+of|bibliography|portal\s*:|category\s*:)/i;

/** Generic whole-page titles that rarely contain topic-specific evidence. */
const GENERIC_SUBJECT =
  /^(?:large\s+language\s+models?|language\s+models?|machine\s+learning|artificial\s+intelligence|deep\s+learning|natural\s+language\s+processing|data\s+science)\s*$/i;

/**
 * Known off-topic families that keyword overlap can let through. Each pattern
 * is ignored when the user's own topic includes the guarded term, so a paper
 * about privacy or Databricks is still allowed.
 */
const OFF_TOPIC_PATTERNS: Array<{ pattern: RegExp; guard: RegExp }> = [
  { pattern: /\b(?:data|consumer|information|patient|user|digital)\s+privacy\b/i, guard: /\bprivacy\b/i },
  { pattern: /\bprivacy\s+(?:law|policy|regulation|preserving|enhancing)\b/i, guard: /\bprivacy\b/i },
  { pattern: /\btopic\s+model(?:l)?ing\b/i, guard: /\btopic\s+model/i },
  { pattern: /\btensor\s+manifold/i, guard: /\btensor\s+manifold/i },
  { pattern: /\bdatabricks\b/i, guard: /\bdatabricks\b/i },
  { pattern: /\b(home|property|auto|life)\s+insurance\b/i, guard: /\binsurance\b/i },
  { pattern: /\bcelebrity|entertainment\s+news|sports\s+scores\b/i, guard: /\b(celebrity|entertainment|sports)\b/i },
];

/** True for a page that is clearly about a different subject. */
export function isOffTopicPage(hit: SearchHit, topic: string): boolean {
  const text = `${hit.title} ${hit.snippet} ${hit.content}`.toLowerCase();
  const subject = topic.toLowerCase();
  if (GENERIC_SUBJECT.test(hit.title.trim()) && !GENERIC_SUBJECT.test(subject)) return true;
  for (const { pattern, guard } of OFF_TOPIC_PATTERNS) {
    if (guard.test(subject)) continue;
    if (pattern.test(text)) return true;
  }
  return false;
}

/** True for pages that are indexes/definitions rather than evidence. */
export function isGenericPage(hit: SearchHit, topic: string): boolean {
  if (!GENERIC_TITLE.test(hit.title.trim())) return false;
  // A user explicitly asking for a glossary may get one.
  return !/\b(?:glossary|dictionary|list\s+of|index\s+of|timeline)\b/i.test(topic);
}

/**
 * Deterministic relevance gate: keyword overlap must be real, at least one
 * topic term must appear in the title/snippet (not only deep in the body), and
 * known off-topic families are rejected unless the user asked about them.
 */
export function isRelevantHit(hit: SearchHit, topic: string): boolean {
  if (isGenericPage(hit, topic)) return false;
  if (isOffTopicPage(hit, topic)) return false;
  const terms = topicTerms(topic);
  if (terms.length === 0) return true;

  const visible = `${hit.title} ${hit.snippet}`.toLowerCase();
  const blob = `${visible} ${hit.content}`.toLowerCase();
  const title = hit.title.toLowerCase();
  const matches = terms.filter((term) => blob.includes(term)).length;
  const visibleMatches = terms.filter((term) => visible.includes(term)).length;
  const phrase = topic.trim().toLowerCase();
  if (phrase.length >= 4 && title.includes(phrase.slice(0, 60))) return true;
  if (matches === 0) return false;
  // A match buried only in a long page body is not evidence of topicality.
  if (visibleMatches === 0) return false;
  return matches / terms.length >= 0.15;
}

/** Rank candidates and assign stable citation ids. */
export function selectSources(hits: SearchHit[], topic: string, mode: Mode): ResearchSource[] {
  const config = modeConfig(mode);
  const terms = topicTerms(topic);

  const ranked = hits
    .filter((hit) => isRelevantHit(hit, topic))
    .map((hit) => {
      const credibility = assessSource(hit.url, {
        title: hit.title,
        kind: hit.kind,
        publishedAt: hit.publishedAt,
      });
      const relevanceScore = relevance(hit, topic, terms);
      const academicBonus = mode === "deep" && credibility.kind === "academic" ? 0.02 : 0;
      const encyclopedicPenalty = credibility.kind === "encyclopedia" ? -0.01 : 0;
      const score =
        credibility.score * 0.65 + relevanceScore * 0.35 + academicBonus + encyclopedicPenalty;
      return { hit, credibility, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, config.targetSources);

  return ranked.map(({ hit, credibility }, index) => ({
    id: `S${index + 1}`,
    title: hit.title.slice(0, 300),
    url: hit.url,
    domain: hit.domain,
    kind: credibility.kind,
    snippet: cleanSourceText(hit.snippet || hit.content || hit.title, 420),
    credibility: credibility.score,
    credibilityReason: credibility.reason,
    publishedAt: hit.publishedAt,
    content: cleanSourceText(hit.content || hit.snippet || "", 12_000),
    query: hit.query,
  }));
}
