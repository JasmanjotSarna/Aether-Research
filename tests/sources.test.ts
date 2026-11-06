import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRelevantHit, selectSources } from "@/lib/search";
import { filterRelevantHits } from "@/lib/search/relevance";
import type { SearchHit } from "@/lib/search/types";
import type { LLMProvider } from "@/lib/llm/provider";

const llmState = vi.hoisted(() => ({ keep: [] as number[] }));

vi.mock("@/lib/llm/client", () => ({
  completeJsonWithFallback: vi.fn(async () => ({
    data: llmState.keep,
    provider: {} as LLMProvider,
  })),
}));

const TOPIC = "RAG vs fine-tuning";

/**
 * The twelve results a real run returned for "RAG vs fine-tuning".
 * Six are genuinely about the comparison; six are the privacy, topic-modelling,
 * tensor-manifold, Databricks and generic-subject pages that slipped through
 * keyword search.
 */
const REPORTED_RESULTS: SearchHit[] = [
  {
    title: "Data privacy in AI systems",
    url: "https://example.com/data-privacy",
    domain: "example.com",
    snippet: "Data privacy law and consumer privacy rules for AI systems.",
    content:
      "Data privacy regulation governs how organisations collect and process personal data.",
    kind: "web",
  },
  {
    title: "Topic modelling with latent Dirichlet allocation",
    url: "https://example.com/topic-modelling",
    domain: "example.com",
    snippet: "Topic modelling finds latent themes in a document collection.",
    content:
      "Topic modelling with LDA estimates latent themes and is unrelated to retrieval or fine-tuning.",
    kind: "academic",
  },
  {
    title: "Tensor manifold learning for dimensionality reduction",
    url: "https://example.com/tensor-manifold",
    domain: "example.com",
    snippet: "Tensor manifold methods reduce high-dimensional data.",
    content:
      "Tensor manifold learning decomposes high-dimensional tensors for dimensionality reduction.",
    kind: "academic",
  },
  {
    title: "Databricks RAG and fine-tuning demo",
    url: "https://example.com/databricks-demo",
    domain: "example.com",
    snippet: "A Databricks notebook showing a RAG and fine-tuning demo.",
    content:
      "This Databricks notebook walks through product setup rather than comparing the methods.",
    kind: "web",
  },
  {
    title: "Large language models",
    url: "https://example.com/large-language-models",
    domain: "example.com",
    snippet: "An overview of large language models, RAG and fine-tuning.",
    content:
      "Large language models are neural networks trained on text. The page lists many techniques including RAG and fine-tuning.",
    kind: "encyclopedia",
  },
  {
    title: "Machine learning",
    url: "https://example.com/machine-learning",
    domain: "example.com",
    snippet: "A general introduction to machine learning, RAG and fine-tuning.",
    content:
      "Machine learning is a broad field. It mentions RAG and fine-tuning only as examples.",
    kind: "encyclopedia",
  },
  {
    title: "RAG versus fine-tuning for enterprise search",
    url: "https://arxiv.org/abs/2402.00002",
    domain: "arxiv.org",
    snippet: "The study compares RAG and fine-tuning on enterprise search workloads.",
    content:
      "RAG keeps answers grounded in the current document index, while fine-tuning improves style and domain vocabulary. RAG handled corpus updates better at a higher query latency.",
    kind: "academic",
    publishedAt: "2025-02-04",
  },
  {
    title: "Fine-tuning large language models for domain accuracy",
    url: "https://arxiv.org/abs/2402.00003",
    domain: "arxiv.org",
    snippet: "Fine-tuning improves domain accuracy but becomes stale as documents change.",
    content:
      "Fine-tuning large language models improves domain accuracy and answer style. The benchmark finds that fine-tuned models become stale, so teams often add RAG retrieval on top.",
    kind: "academic",
    publishedAt: "2024-12-11",
  },
  {
    title: "Retrieval-augmented generation: accuracy and grounding",
    url: "https://openalex.org/works/W2403",
    domain: "openalex.org",
    snippet: "RAG improves answer accuracy and grounding compared with fine-tuning baselines.",
    content:
      "RAG improves answer accuracy by grounding each response in retrieved evidence. The comparison with fine-tuning finds higher citation faithfulness for RAG.",
    kind: "academic",
    publishedAt: "2025-04-02",
  },
  {
    title: "Cost and latency trade-offs of RAG versus fine-tuning",
    url: "https://arxiv.org/abs/2402.00004",
    domain: "arxiv.org",
    snippet: "Fine-tuning has higher upfront cost but lower per-query latency than RAG.",
    content:
      "The cost study finds that fine-tuning has higher upfront training cost but lower per-query latency, while RAG shifts cost to the index and inference path.",
    kind: "academic",
    publishedAt: "2025-03-18",
  },
  {
    title: "A survey of retrieval augmentation and fine-tuning",
    url: "https://openalex.org/works/W2404",
    domain: "openalex.org",
    snippet: "The survey compares RAG with fine-tuning for knowledge-intensive tasks.",
    content:
      "The survey compares RAG with fine-tuning for knowledge-intensive tasks, covering accuracy, cost, maintenance and data freshness.",
    kind: "academic",
    publishedAt: "2025-01-20",
  },
  {
    title: "Evaluating RAG hallucination and citation accuracy",
    url: "https://arxiv.org/abs/2402.00005",
    domain: "arxiv.org",
    snippet: "RAG reduces hallucination and improves citation accuracy relative to fine-tuning.",
    content:
      "RAG reduces hallucination and improves citation accuracy when retrieval quality is high. Fine-tuning alone did not prevent fabricated citations.",
    kind: "academic",
    publishedAt: "2025-05-11",
  },
];

const OFF_TOPIC_TITLES = [
  "Data privacy in AI systems",
  "Topic modelling with latent Dirichlet allocation",
  "Tensor manifold learning for dimensionality reduction",
  "Databricks RAG and fine-tuning demo",
  "Large language models",
  "Machine learning",
];

const RELEVANT_TITLES = [
  "RAG versus fine-tuning for enterprise search",
  "Fine-tuning large language models for domain accuracy",
  "Retrieval-augmented generation: accuracy and grounding",
  "Cost and latency trade-offs of RAG versus fine-tuning",
  "A survey of retrieval augmentation and fine-tuning",
  "Evaluating RAG hallucination and citation accuracy",
];

const provider: LLMProvider = {
  name: "groq",
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  apiKey: "test",
  model: "test-model",
  charBudget: 14_000,
  maxOutputTokens: 2048,
  jsonModel: "test-model",
};

beforeEach(() => {
  llmState.keep = [];
});

describe("off-topic source rejection", () => {
  it("rejects every reported off-topic page", () => {
    for (const hit of REPORTED_RESULTS.filter((item) => OFF_TOPIC_TITLES.includes(item.title))) {
      expect(isRelevantHit(hit, TOPIC), hit.title).toBe(false);
    }
  });

  it("keeps the six genuinely comparative sources and drops the rest", () => {
    const selected = selectSources(REPORTED_RESULTS, TOPIC, "standard");
    expect(selected).toHaveLength(6);
    expect(selected.map((source) => source.title)).toEqual(expect.arrayContaining(RELEVANT_TITLES));
    for (const title of OFF_TOPIC_TITLES) {
      expect(selected.some((source) => source.title === title), title).toBe(false);
    }
    expect(selected.map((source) => source.id)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
  });

  it("lets the cheap model filter drop everything with an empty keep list", async () => {
    llmState.keep = [];
    const kept = await filterRelevantHits([provider], REPORTED_RESULTS, TOPIC);
    expect(kept).toEqual([]);
  });

  it("honours the indexes the cheap model approves", async () => {
    llmState.keep = [6, 8, 9];
    const kept = await filterRelevantHits([provider], REPORTED_RESULTS, TOPIC);
    expect(kept.map((hit) => hit.title)).toEqual([
      "RAG versus fine-tuning for enterprise search",
      "Retrieval-augmented generation: accuracy and grounding",
      "Cost and latency trade-offs of RAG versus fine-tuning",
    ]);
  });
});
