import { SEARCH_TIMEOUT_MS } from "../config";
import { decodeHtmlEntities } from "../security/content";
import { fetchWithTimeout, isAbort } from "../net";
import { failureReason, providerFailure, statusReason } from "./failure";
import type { SearchHit } from "./types";

function cleanXml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function tag(entry: string, name: string): string {
  const match = entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match?.[1] ? cleanXml(match[1]) : "";
}

export async function searchArxiv(
  query: string,
  limit = 3,
  signal?: AbortSignal
): Promise<SearchHit[]> {
  try {
    const cleanQuery = query.replace(/[^\w\s-]/gi, " ").replace(/\s+/g, " ").trim();
    if (!cleanQuery) return [];
    const url =
      `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(cleanQuery)}` +
      `&start=0&max_results=${Math.max(1, limit)}&sortBy=relevance&sortOrder=descending`;

    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": "AetherResearch/3.0 (arXiv academic harvester)",
          Accept: "application/atom+xml,application/xml,text/xml",
        },
      },
      SEARCH_TIMEOUT_MS,
      signal
    );
    if (!response.ok) {
      throw providerFailure("arxiv", statusReason(response.status));
    }

    const xml = await response.text();
    const entries = xml.split(/<entry[\s>]/i).slice(1);
    const hits: SearchHit[] = [];

    for (const entry of entries) {
      const title = tag(entry, "title");
      const summary = tag(entry, "summary");
      const id = tag(entry, "id");
      if (!title || !id) continue;

      const pageUrl = id.replace("http://", "https://");
      const published = tag(entry, "published");
      hits.push({
        title: `[arXiv] ${title}`,
        url: pageUrl,
        domain: "arxiv.org",
        snippet: summary.slice(0, 420) || "Academic preprint abstract.",
        content: summary ? `arXiv abstract: ${summary}` : `Academic preprint: ${title}`,
        kind: "academic",
        publishedAt: published || undefined,
        query,
      });
    }

    return hits;
  } catch (error) {
    if (isAbort(error) && signal?.aborted) return [];
    if (isAbort(error)) throw providerFailure("arxiv", "timeout");
    throw providerFailure("arxiv", failureReason(error));
  }
}
