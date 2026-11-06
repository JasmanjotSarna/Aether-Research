import { describe, expect, it } from "vitest";
import {
  isGenericPage,
  isRelevantHit,
  normalizeUrlKey,
  selectSources,
} from "@/lib/search";
import { keywordQuery, isKeywordQuery, rewriteQuery } from "@/lib/search/query";
import type { SearchHit } from "@/lib/search/types";

function hit(overrides: Partial<SearchHit> & Pick<SearchHit, "title" | "url">): SearchHit {
  return {
    domain: new URL(overrides.url).hostname,
    snippet: overrides.snippet ?? overrides.title,
    content: overrides.content ?? overrides.snippet ?? overrides.title,
    kind: overrides.kind ?? "web",
    ...overrides,
  };
}

function words(query: string): number {
  return query.split(/\s+/).filter(Boolean).length;
}

describe("search query shaping", () => {
  it("shortens a conversational request to a 3–6 word keyword query", () => {
    const query = keywordQuery(
      "How do I compare retrieval augmented generation versus fine tuning for enterprise search?"
    );
    expect(words(query)).toBeGreaterThanOrEqual(3);
    expect(words(query)).toBeLessThanOrEqual(6);
    expect(query).not.toMatch(/\b(?:how|do|for|the)\b/i);
    expect(query).toMatch(/retrieval/i);
    expect(query).toMatch(/generation/i);
  });

  it("pads very short topics without duplicating words", () => {
    const query = keywordQuery("AI");
    expect(words(query)).toBeGreaterThanOrEqual(3);
    expect(new Set(query.toLowerCase().split(/\s+/)).size).toBe(words(query));
    expect(isKeywordQuery(query)).toBe(true);
  });

  it("rewrites a failed query into a different 3–6 word query", () => {
    const original = "quantum computing overview research";
    const rewritten = rewriteQuery(original, 1);
    expect(rewritten).not.toBe(original);
    expect(words(rewritten)).toBeGreaterThanOrEqual(3);
    expect(words(rewritten)).toBeLessThanOrEqual(6);

    const short = "RAG fine tuning";
    const retried = rewriteQuery(short, 1);
    expect(retried).not.toBe(short);
    expect(words(retried)).toBeGreaterThanOrEqual(3);
    expect(words(retried)).toBeLessThanOrEqual(6);
  });
});

describe("relevance filtering", () => {
  it("rejects a glossary page even when it mentions the topic", () => {
    const glossary = hit({
      title: "Glossary of artificial intelligence",
      url: "https://example.com/glossary-ai",
      snippet: "Definitions of artificial intelligence, machine learning and neural networks.",
      content:
        "This glossary defines artificial intelligence, machine learning, neural networks and related terms.",
    });
    expect(isGenericPage(glossary, "artificial intelligence")).toBe(true);
    expect(isRelevantHit(glossary, "artificial intelligence")).toBe(false);
  });

  it("keeps a glossary only when the user asked for one", () => {
    const glossary = hit({
      title: "Glossary of artificial intelligence",
      url: "https://example.com/glossary-ai",
      snippet: "Definitions of artificial intelligence terms.",
    });
    expect(isRelevantHit(glossary, "glossary of artificial intelligence terms")).toBe(true);
  });

  it("rejects unrelated pages and keeps topical evidence", () => {
    const unrelated = hit({
      title: "A guide to training puppies",
      url: "https://example.com/puppies",
      snippet: "House training, feeding and exercise for young dogs.",
    });
    const relevant = hit({
      title: "Quantum error correction with surface codes",
      url: "https://arxiv.org/abs/2401.00001",
      snippet: "Surface codes reduce logical error rates in quantum computing hardware.",
      content:
        "The experiment shows how surface codes reduce logical error rates in quantum computing hardware.",
      kind: "academic",
    });
    expect(isRelevantHit(unrelated, "quantum computing")).toBe(false);
    expect(isRelevantHit(relevant, "quantum computing")).toBe(true);
  });

  it("drops generic pages when selecting sources and keeps stable ids", () => {
    const hits = [
      hit({
        title: "Glossary of artificial intelligence",
        url: "https://example.com/glossary-ai",
        snippet: "Definitions of artificial intelligence terms.",
      }),
      hit({
        title: "Artificial intelligence safety research",
        url: "https://arxiv.org/abs/2401.00002",
        snippet: "A study of artificial intelligence safety evaluation.",
        content:
          "The study evaluates artificial intelligence safety methods, benchmarks and limitations.",
        kind: "academic",
      }),
      hit({
        title: "Artificial intelligence in medicine",
        url: "https://openalex.org/works/W1",
        snippet: "Clinical artificial intelligence systems and their evidence base.",
        content: "Clinical artificial intelligence systems, their evaluation and evidence base.",
        kind: "academic",
      }),
    ];
    const selected = selectSources(hits, "artificial intelligence", "standard");
    expect(selected.map((source) => source.id)).toEqual(["S1", "S2"]);
    expect(selected.some((source) => /Glossary/i.test(source.title))).toBe(false);
  });

  it("canonicalises URLs for deduplication", () => {
    expect(normalizeUrlKey("https://www.Example.com/path/?utm_source=x&b=2&a=1")).toBe(
      "example.com/path?a=1&b=2"
    );
    expect(normalizeUrlKey("ftp://example.com/file")).toBeNull();
  });
});
