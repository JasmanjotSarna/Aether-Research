import { fetchWithTimeout, isAbort } from "../net";
import { decodeHtmlEntities } from "../security/content";
import { SEARCH_TIMEOUT_MS } from "../config";
import { failureReason, providerFailure, statusReason } from "./failure";
import type { SearchHit } from "./types";

interface WikiSearchResult {
  title?: string;
  snippet?: string;
  timestamp?: string;
}

interface WikiResponse {
  query?: { search?: WikiSearchResult[] };
}

function plain(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Wikipedia's standard `list=search` endpoint. We deliberately avoid
 * `generator=search` because it is easy to mistake a generator failure for an
 * empty result set.
 */
export async function searchWikipedia(
  query: string,
  limit = 2,
  signal?: AbortSignal
): Promise<SearchHit[]> {
  try {
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
      encodeURIComponent(query) +
      `&srlimit=${Math.max(1, limit)}&srprop=snippet%7Ctimestamp&format=json&formatversion=2&origin=*`;

    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent":
            "AetherResearch/3.0 (free research agent; +https://github.com/aether-research)",
          Accept: "application/json",
        },
      },
      SEARCH_TIMEOUT_MS,
      signal
    );
    if (!response.ok) {
      throw providerFailure("wikipedia", statusReason(response.status));
    }

    const data = (await response.json()) as WikiResponse;
    const pages = data.query?.search ?? [];
    const hits: SearchHit[] = [];

    for (const page of pages) {
      if (!page.title) continue;
      const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(
        page.title.replace(/\s+/g, "_")
      )}`;
      const snippet = plain(page.snippet ?? "");
      hits.push({
        title: page.title,
        url: pageUrl,
        domain: "en.wikipedia.org",
        snippet: snippet.slice(0, 420) || `Wikipedia article: ${page.title}`,
        content: snippet.slice(0, 2000) || `Wikipedia article: ${page.title}`,
        kind: "encyclopedia",
        publishedAt: page.timestamp || undefined,
        query,
      });
    }

    return hits;
  } catch (error) {
    if (isAbort(error) && signal?.aborted) return [];
    if (isAbort(error)) throw providerFailure("wikipedia", "timeout");
    throw providerFailure("wikipedia", failureReason(error));
  }
}
