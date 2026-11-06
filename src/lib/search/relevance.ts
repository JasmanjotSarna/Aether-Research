/**
 * Optional cheap relevance pass. The deterministic keyword filter runs first;
 * when a language model is available it rejects obviously generic or
 * off-topic pages that keyword overlap alone can miss.
 *
 * Failures are ignored: the deterministic result is always a safe fallback.
 */

import type { LLMProvider } from "../llm/provider";
import { completeJsonWithFallback, type ChatMessage, type FailoverInfo } from "../llm/client";
import type { SearchHit } from "./types";

function messages(topic: string, hits: SearchHit[]): ChatMessage[] {
  const system = [
    "You filter search results for a research paper.",
    "The result must be directly about the TOPIC and contain usable evidence for it.",
    "Reject: generic glossary/index pages; generic 'Large language model' or 'machine learning' overviews;",
    "data privacy, consumer privacy, topic modelling, tensor manifold and Databricks pages that do not",
    "discuss the topic itself; unrelated encyclopedia entries; pages with no usable evidence.",
    'Return ONLY JSON: {"keep":[0,2,3]} using the result numbers supplied.',
    "It is correct to keep zero results when none are genuinely about the topic.",
  ].join("\n");

  const list = hits
    .slice(0, 18)
    .map((hit, index) => `${index}. ${hit.title} — ${hit.snippet.slice(0, 180)}`)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: `TOPIC: ${topic}\n\nRESULTS:\n${list}\n\nReturn JSON now.` },
  ];
}

function validate(value: unknown): number[] | null {
  if (!value || typeof value !== "object") return null;
  const keep = (value as { keep?: unknown }).keep;
  if (!Array.isArray(keep)) return null;
  const indexes = Array.from(
    new Set(
      keep.filter(
        (item): item is number =>
          typeof item === "number" && Number.isInteger(item) && item >= 0 && item < 18
      )
    )
  );
  // An empty keep list is a valid, honest answer.
  return indexes;
}

export async function filterRelevantHits(
  providers: LLMProvider[],
  hits: SearchHit[],
  topic: string,
  signal?: AbortSignal,
  onFailover?: (info: FailoverInfo) => void
): Promise<SearchHit[]> {
  if (providers.length === 0 || hits.length < 4 || signal?.aborted) return hits;

  try {
    const result = await completeJsonWithFallback(
      providers,
      () => messages(topic, hits),
      validate,
      {
        signal,
        temperature: 0.1,
        maxTokens: 300,
        timeoutMs: 60_000,
        onFailover,
      }
    );
    if (!result) return hits;
    const kept = result.data.filter((index) => index < hits.length);
    return kept.map((index) => hits[index]).filter((hit): hit is SearchHit => Boolean(hit));
  } catch {
    return hits;
  }
}
