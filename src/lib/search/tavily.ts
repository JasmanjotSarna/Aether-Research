import { SEARCH_TIMEOUT_MS } from "../config";
import { assessSource } from "../credibility";
import { looksLikeHttpUrl } from "../security/url";
import { fetchWithTimeout, isAbort } from "../net";
import { failureReason, providerFailure, statusReason } from "./failure";
import type { SearchHit } from "./types";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

export async function searchTavily(
  query: string,
  apiKey: string,
  limit = 4,
  signal?: AbortSignal
): Promise<SearchHit[]> {
  if (!apiKey) return [];
  try {
    const response = await fetchWithTimeout(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          search_depth: "basic",
          include_answer: false,
          include_raw_content: false,
          max_results: Math.max(1, Math.min(10, limit)),
        }),
      },
      SEARCH_TIMEOUT_MS,
      signal
    );
    if (!response.ok) {
      throw providerFailure("tavily", statusReason(response.status));
    }

    const data = (await response.json()) as TavilyResponse;
    const results = data.results ?? [];
    const hits: SearchHit[] = [];

    for (const item of results) {
      if (!item.url || !item.title || !looksLikeHttpUrl(item.url)) continue;
      let domain = "unknown";
      try {
        domain = new URL(item.url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      const credibility = assessSource(item.url, {
        title: item.title,
        publishedAt: item.published_date,
      });
      const content = (item.content ?? "").replace(/\s+/g, " ").trim();
      hits.push({
        title: item.title,
        url: item.url,
        domain,
        snippet: content.slice(0, 420) || item.title,
        content: content.slice(0, 8000),
        kind: credibility.kind,
        publishedAt: item.published_date,
        query,
      });
    }

    return hits;
  } catch (error) {
    if (isAbort(error) && signal?.aborted) return [];
    if (isAbort(error)) throw providerFailure("tavily", "timeout");
    throw providerFailure("tavily", failureReason(error));
  }
}
