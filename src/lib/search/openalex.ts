import { SEARCH_TIMEOUT_MS } from "../config";
import { fetchWithTimeout, isAbort } from "../net";
import { failureReason, providerFailure, statusReason } from "./failure";
import type { SearchHit } from "./types";

interface OpenAlexWork {
  id?: string;
  title?: string;
  doi?: string;
  display_name?: string;
  publication_date?: string;
  abstract_inverted_index?: Record<string, number[]>;
  primary_location?: {
    landing_page_url?: string;
    source?: { display_name?: string };
  };
}

interface OpenAlexResponse {
  results?: OpenAlexWork[];
}

function reconstructAbstract(index: Record<string, number[]> | undefined): string {
  if (!index) return "";
  const words: Array<{ position: number; word: string }> = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (typeof position === "number") words.push({ position, word });
    }
  }
  words.sort((a, b) => a.position - b.position);
  return words.map((item) => item.word).join(" ");
}

export async function searchOpenAlex(
  query: string,
  limit = 2,
  signal?: AbortSignal
): Promise<SearchHit[]> {
  try {
    const url =
      `https://api.openalex.org/works?search=${encodeURIComponent(query)}` +
      `&per-page=${Math.max(1, limit)}&sort=relevance_score:desc&mailto=research@aether.example`;

    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": "AetherResearch/3.0 (mailto:research@aether.example)",
          Accept: "application/json",
        },
      },
      SEARCH_TIMEOUT_MS,
      signal
    );
    if (!response.ok) {
      throw providerFailure("openalex", statusReason(response.status));
    }

    const data = (await response.json()) as OpenAlexResponse;
    const results = data.results ?? [];
    const hits: SearchHit[] = [];

    for (const work of results) {
      const title = work.title ?? work.display_name;
      if (!title) continue;

      const abstract = reconstructAbstract(work.abstract_inverted_index);
      const landing =
        work.doi ??
        work.primary_location?.landing_page_url ??
        (work.id ? `https://openalex.org/${work.id.split("/").pop()}` : "");
      if (!landing) continue;

      let domain = "openalex.org";
      try {
        domain = new URL(landing).hostname.replace(/^www\./, "");
      } catch {
        // keep default
      }

      hits.push({
        title,
        url: landing,
        domain,
        snippet: abstract.slice(0, 420) || `Academic work: ${title}`,
        content: abstract ? `Abstract: ${abstract}` : `Academic work: ${title}`,
        kind: "academic",
        publishedAt: work.publication_date || undefined,
        query,
      });
    }

    return hits;
  } catch (error) {
    if (isAbort(error) && signal?.aborted) return [];
    if (isAbort(error)) throw providerFailure("openalex", "timeout");
    throw providerFailure("openalex", failureReason(error));
  }
}
