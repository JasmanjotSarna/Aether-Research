/**
 * Safe web reader. Every fetch goes through the SSRF guard, follows at most
 * three redirects (each re-validated), times out after eight seconds, caps the
 * response size, strips markup and sanitises prompt-injection bait.
 *
 * Per-source progress is reported so the agent can emit a truthful `tool`
 * event for every `read_page` call, including failures.
 */

import { READ_TIMEOUT_MS } from "../config";
import type { ResearchSource } from "../search/types";
import { cleanSourceText, extractPublishedAt, htmlToText } from "../security/content";
import { safeFetchText } from "../security/url";

export interface ReadResult {
  attempted: number;
  read: number;
  failures: number;
}

export interface ReadProgress {
  sourceId: string;
  url: string;
  status: "running" | "done" | "error";
  summary?: string;
}

const READ_CONCURRENCY = 4;
const MAX_CONTENT_CHARS = 7000;

export async function readSources(
  sources: ResearchSource[],
  maxPages: number,
  signal?: AbortSignal,
  onProgress?: (progress: ReadProgress) => void
): Promise<ReadResult> {
  if (maxPages <= 0 || sources.length === 0) {
    return { attempted: 0, read: 0, failures: 0 };
  }

  const candidates = sources
    .filter((source) => source.kind !== "encyclopedia" || source.content.length < 900)
    .sort((a, b) => b.credibility - a.credibility)
    .slice(0, maxPages);

  let cursor = 0;
  let read = 0;
  let failures = 0;

  const worker = async () => {
    while (true) {
      if (signal?.aborted) return;
      const index = cursor++;
      const source = candidates[index];
      if (!source) return;

      onProgress?.({
        sourceId: source.id,
        url: source.url,
        status: "running",
      });

      try {
        const result = await safeFetchText(source.url, {
          timeoutMs: READ_TIMEOUT_MS,
          maxRedirects: 3,
          maxBytes: 2_000_000,
          requireHtml: false,
          signal,
        });

        const isPlain =
          result.contentType.includes("text/plain") || result.contentType.includes("json");
        const text = isPlain ? result.text : htmlToText(result.text, 20_000);
        const cleaned = cleanSourceText(text, MAX_CONTENT_CHARS);
        if (cleaned.length < 200) {
          failures += 1;
          onProgress?.({
            sourceId: source.id,
            url: source.url,
            status: "error",
            summary: "Page was too thin to use",
          });
          continue;
        }

        source.content = cleaned;
        if (!source.publishedAt && !isPlain) {
          source.publishedAt = extractPublishedAt(result.text);
        }
        read += 1;
        onProgress?.({
          sourceId: source.id,
          url: source.url,
          status: "done",
          summary: `Read ${cleaned.length.toLocaleString("en-US")} chars`,
        });
      } catch {
        failures += 1;
        onProgress?.({
          sourceId: source.id,
          url: source.url,
          status: "error",
          summary: "Fetch blocked or failed",
        });
      }
    }
  };

  const workers = Array.from({ length: Math.min(READ_CONCURRENCY, candidates.length) }, () =>
    worker()
  );
  await Promise.all(workers);

  return { attempted: candidates.length, read, failures };
}
