import { describe, expect, it, vi } from "vitest";
import type { AgentEvent, AgentRequest, ResearchSpec } from "@/lib/contract";
import { runAgent, type AgentContext } from "@/lib/agent/runner";
import type { LLMProvider } from "@/lib/llm/provider";

const provider: LLMProvider = {
  name: "groq",
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  apiKey: "test-key",
  model: "fake-model",
  charBudget: 14_000,
  maxOutputTokens: 4096,
  jsonModel: "fake-model",
};

vi.mock("@/lib/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search")>();
  const hits = [
    {
      title: "RAG versus fine-tuning for enterprise search",
      url: "https://arxiv.org/abs/2402.00002",
      domain: "arxiv.org",
      snippet: "The study compares RAG and fine-tuning on enterprise search workloads.",
      content:
        "The study compares RAG and fine-tuning on enterprise search workloads. RAG achieves higher answer accuracy because retrieval grounds each response in the current document index. RAG has lower upfront cost but pays a per-query retrieval and inference cost. Fine-tuning has high upfront training cost but lower per-query latency once deployed. RAG keeps data current because the index can be refreshed without retraining.",
      kind: "academic" as const,
      publishedAt: "2025-02-04",
    },
    {
      title: "Fine-tuning large language models for domain accuracy",
      url: "https://arxiv.org/abs/2402.00003",
      domain: "arxiv.org",
      snippet: "Fine-tuning improves domain accuracy but becomes stale as documents change.",
      content:
        "Fine-tuning large language models improves answer accuracy and answer style. Fine-tuning becomes stale when the underlying documents change and needs periodic retraining. The benchmark finds that teams often add RAG retrieval on top of a fine-tuned model.",
      kind: "academic" as const,
      publishedAt: "2024-12-11",
    },
    {
      title: "Retrieval-augmented generation: accuracy and grounding",
      url: "https://openalex.org/works/W2403",
      domain: "openalex.org",
      snippet: "RAG improves answer accuracy and grounding compared with fine-tuning baselines.",
      content:
        "RAG improves answer accuracy by grounding each response in retrieved evidence. The comparison with fine-tuning finds higher citation faithfulness for RAG and lower hallucination risk. RAG maintenance depends on keeping the index fresh.",
      kind: "academic" as const,
      publishedAt: "2025-04-02",
    },
    {
      title: "Cost and latency trade-offs of RAG versus fine-tuning",
      url: "https://arxiv.org/abs/2402.00004",
      domain: "arxiv.org",
      snippet: "Fine-tuning has higher upfront cost but lower per-query latency than RAG.",
      content:
        "The cost study finds that fine-tuning has higher upfront training cost but lower per-query latency, while RAG shifts cost to the index and inference path. RAG privacy depends on where the index and documents are hosted.",
      kind: "academic" as const,
      publishedAt: "2025-03-18",
    },
    {
      title: "A survey of retrieval augmentation and fine-tuning",
      url: "https://openalex.org/works/W2404",
      domain: "openalex.org",
      snippet: "The survey compares RAG with fine-tuning for knowledge-intensive tasks.",
      content:
        "The survey compares RAG with fine-tuning for knowledge-intensive tasks, covering accuracy, cost, maintenance and data freshness. It recommends RAG when documents change often and fine-tuning when style consistency matters most.",
      kind: "academic" as const,
      publishedAt: "2025-01-20",
    },
    {
      title: "Evaluating RAG hallucination and citation accuracy",
      url: "https://arxiv.org/abs/2402.00005",
      domain: "arxiv.org",
      snippet: "RAG reduces hallucination and improves citation accuracy relative to fine-tuning.",
      content:
        "RAG reduces hallucination and improves citation accuracy when retrieval quality is high. Fine-tuning alone did not prevent fabricated citations. The best use case is a changing corpus with strict citation requirements.",
      kind: "academic" as const,
      publishedAt: "2025-05-11",
    },
  ];

  return {
    ...actual,
    searchAll: vi.fn(async () => hits),
  };
});

vi.mock("@/lib/reader", () => ({
  readSources: vi.fn(async (sources: unknown[]) => ({
    attempted: sources.length,
    read: sources.length,
    failures: 0,
  })),
}));

vi.mock("@/lib/llm/client", () => {
  function prose(tag: string, words: number): string {
    const sentences: string[] = [];
    let total = 0;
    let index = 0;
    while (total < words) {
      const sentence =
        `For ${tag} point ${tag}${index}a, retrieval grounding ${tag}${index}b and corpus ` +
        `freshness ${tag}${index}c trade against fine-tuning style ${tag}${index}d, latency ` +
        `${tag}${index}e, maintenance ${tag}${index}f, cost ${tag}${index}g and measured ` +
        `accuracy ${tag}${index}h in RAG versus fine-tuning studies [S1].`;
      sentences.push(sentence);
      total += sentence.split(/\s+/).length;
      index += 1;
    }
    return sentences.join(" ");
  }

  function sectionText(system: string): string {
    const block = system.slice(system.indexOf("SECTION TO WRITE:"));
    const budget = Number(block.match(/write about (\d+) words/i)?.[1] ?? 300);

    if (block.includes("## 1. Introduction")) {
      const abstract = prose("opening", 200);
      const intro = prose("introduction", Math.max(80, budget - 200));
      return `# RAG vs fine-tuning\n\n## Abstract\n\n${abstract}\n\n## 1. Introduction\n\n${intro}`;
    }
    if (block.includes("## 2. Methodology")) {
      return [
        "## 2. Methodology",
        "",
        prose("methodology", Math.max(80, budget - 30)),
        "",
        "Language model providers used: OpenRouter (should-not-appear)",
      ].join("\n");
    }
    if (block.includes("## 3. Findings")) {
      return `## 3. Findings\n\n${prose("findings", budget)}`;
    }
    if (block.includes("## 4. Discussion")) {
      return `## 4. Discussion\n\n${prose("discussion", budget)}`;
    }
    if (block.includes("## 5. Limitations")) {
      return `## 5. Limitations\n\n${prose("limitations", budget)}`;
    }
    return `## 6. Conclusion & future directions\n\n${prose("conclusion", budget)}`;
  }

  return {
    streamWithFallback: vi.fn(
      async (
        providers: LLMProvider[],
        build: (provider: LLMProvider) => Array<{ role: string; content: string }>,
        options: { onToken?: (text: string) => void }
      ) => {
        const messages = build(providers[0]!);
        const text = sectionText(messages[0]?.content ?? "");
        options.onToken?.(text);
        return { text, provider: providers[0], partial: false };
      }
    ),
    completeJsonWithFallback: vi.fn(
      async (
        providers: LLMProvider[],
        build: (provider: LLMProvider) => Array<{ role: string; content: string }>
      ) => {
        const system = build(providers[0]!)[0]?.content ?? "";
        if (/Research Planner/.test(system)) {
          return {
            data: {
              objective: "Compare RAG and fine-tuning with evidence.",
              subtopics: [
                "Background: RAG and fine-tuning",
                "Accuracy and grounding",
                "Cost and latency",
                "Maintenance and limitations",
              ],
              queries: [
                "RAG fine-tuning comparison",
                "RAG accuracy grounding",
                "fine-tuning cost latency",
                "RAG maintenance limitations",
              ],
              comparison: true,
            },
            provider: providers[0],
          };
        }
        return {
          data: {
            score: 8,
            notes: ["Cited and on topic."],
            followups: ["Which is cheaper at scale?", "How often should the index change?", "What about privacy?"],
          },
          provider: providers[0],
        };
      }
    ),
  };
});

const spec: ResearchSpec = {
  topic: "RAG vs fine-tuning",
  mode: "deep",
  pages: 6,
  audience: "technical experts",
  purpose: "research briefing",
  tone: "technical, balanced",
  citationStyle: "numbered",
  language: "English",
  outline: [
    { heading: "Foundations", pages: 1 },
    { heading: "Evidence and benchmarks", pages: 3 },
    { heading: "Limitations and open questions", pages: 1 },
  ],
};

function collect(): { events: AgentEvent[]; emit: (event: AgentEvent) => void } {
  const events: AgentEvent[] = [];
  return { events, emit: (event) => events.push(event) };
}

function context(): AgentContext {
  return { providers: [provider] };
}

describe("section-by-section deep writer", () => {
  it("reaches the requested content pages with synthesised, cited prose", async () => {
    const request: AgentRequest = {
      chatId: "chat-sectioned",
      messages: [{ role: "user", content: "go ahead" }],
      mode: "deep",
      spec,
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    const report = events.find(
      (event): event is Extract<AgentEvent, { type: "report" }> => event.type === "report"
    );
    expect(report).toBeDefined();
    expect(report?.pagesRequested).toBe(6);
    expect(report?.pagesDelivered).toBeGreaterThanOrEqual(5.5);
    expect(report?.pagesDelivered).toBeLessThanOrEqual(8);
    expect(report?.sources).toHaveLength(6);

    const markdown = report?.markdown ?? "";
    expect(markdown).toMatch(/^# RAG vs fine-tuning/m);
    expect(markdown).toMatch(/## Abstract/);
    expect(markdown).toMatch(/## 1\. Introduction/);
    expect(markdown).toMatch(/## 2\. Methodology/);
    expect(markdown).toMatch(/## 3\. Findings/);
    expect(markdown).toMatch(/## 4\. Discussion/);
    expect(markdown).toMatch(/## 5\. Limitations/);
    expect(markdown).toMatch(/## 6\. Conclusion & future directions/);
    expect(markdown).toMatch(/\[S\d+\]/);

    // Section-by-section calls, not one giant completion.
    expect(events.filter((event) => event.type === "report_token").length).toBeGreaterThan(1);

    // The comparison table was rebuilt from evidence, so the two sides differ.
    expect(markdown).toMatch(/### Head-to-head comparison/);
    const accuracy = markdown
      .split("\n")
      .find((line) => line.startsWith("| Accuracy |")) ?? "";
    const cells = accuracy.split("|").slice(1, -1).map((cell) => cell.trim());
    expect(cells).toHaveLength(3);
    expect(cells[1]).not.toBe(cells[2]);

    // Methodology lists only the provider that actually returned text.
    expect(markdown).toMatch(/Language model providers used: Groq \(fake-model\)/);
    expect(markdown).not.toMatch(/should-not-appear/);

    // The page-repair loop is not needed when every section meets its budget.
    const thinking = events
      .filter((event): event is Extract<AgentEvent, { type: "thinking" }> => event.type === "thinking")
      .map((event) => event.text)
      .join("\n");
    expect(thinking).toMatch(/write about 2700 words section by section/i);
    expect(thinking).not.toMatch(/Page check:/);
  });

  it("delivers about fifteen content pages for a fifteen-page comparison", async () => {
    const request: AgentRequest = {
      chatId: "chat-sectioned-15",
      messages: [{ role: "user", content: "go ahead" }],
      mode: "deep",
      spec: { ...spec, pages: 15 },
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    const report = events.find(
      (event): event is Extract<AgentEvent, { type: "report" }> => event.type === "report"
    );
    expect(report).toBeDefined();
    expect(report?.pagesRequested).toBe(15);
    expect(report?.pagesDelivered).toBeGreaterThanOrEqual(14);
    expect(report?.pagesDelivered).toBeLessThanOrEqual(17);
    expect(report?.markdown).toMatch(/### Head-to-head comparison/);
    expect(report?.markdown).toMatch(/Language model providers used: Groq \(fake-model\)/);
  });
});
