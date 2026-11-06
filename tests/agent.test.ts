import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent, AgentRequest, ResearchSpec, Source } from "@/lib/contract";
import { runAgent, type AgentContext } from "@/lib/agent/runner";

const source: Source = {
  id: "S1",
  title: "Cost report",
  url: "https://example.com/cost",
  domain: "example.com",
  kind: "web",
  snippet: "The total cost of ownership is lower.",
  credibility: 0.7,
  credibilityReason: "Test source",
};

const spec: ResearchSpec = {
  topic: "quantum computing",
  mode: "standard",
  pages: 5,
  audience: "general readers",
  purpose: "research briefing",
  tone: "neutral, analytical",
  citationStyle: "numbered",
  language: "English",
  outline: [
    { heading: "Foundations", pages: 1 },
    { heading: "Evidence and benchmarks", pages: 2 },
    { heading: "Limitations and open questions", pages: 1 },
  ],
};

const comparisonSpec: ResearchSpec = {
  ...spec,
  topic: "RAG vs fine-tuning",
  pages: 10,
  audience: "technical experts",
  tone: "technical",
};

const searchState = vi.hoisted(() => ({ scarce: false }));

vi.mock("@/lib/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search")>();
  const quantumHits = [
    {
      title: "Quantum computing overview",
      url: "https://en.wikipedia.org/wiki/Quantum_computing",
      domain: "en.wikipedia.org",
      snippet:
        "Quantum computing uses quantum-mechanical phenomena such as superposition and entanglement to perform computation.",
      content:
        "Quantum computing is a type of computation that harnesses quantum mechanical phenomena. Quantum computers use qubits, which can exist in a superposition of states. Entanglement allows qubits to be correlated in ways classical bits cannot. Practical quantum computers remain limited by error rates and decoherence, although research groups report steady progress on error correction.",
      kind: "encyclopedia" as const,
    },
    {
      title: "[arXiv] Advances in quantum error correction",
      url: "https://arxiv.org/abs/2401.00001",
      domain: "arxiv.org",
      snippet: "Recent experiments show improved logical qubit lifetimes.",
      content:
        "Recent experiments demonstrate improved logical qubit lifetimes using surface codes. The study reports a reduction in logical error rates by a factor of three compared with previous devices. However, the overhead remains substantial and fault-tolerant operation at scale is still an open problem. These results are preliminary and have not yet been independently replicated.",
      kind: "academic" as const,
      publishedAt: "2025-01-10",
    },
    {
      title: "[OpenAlex] Quantum computing hardware benchmarks",
      url: "https://openalex.org/works/W2401",
      domain: "openalex.org",
      snippet: "Benchmarks compare gate fidelity and coherence across quantum hardware.",
      content:
        "The benchmark study compares gate fidelity, coherence time and error rates across superconducting and trapped-ion quantum computers. It finds that hardware progress is real but uneven, and that application-level advantage remains unproven for most workloads.",
      kind: "academic" as const,
      publishedAt: "2024-11-02",
    },
  ];
  const comparisonHits = [
    {
      title: "Retrieval-augmented generation",
      url: "https://en.wikipedia.org/wiki/Retrieval-augmented_generation",
      domain: "en.wikipedia.org",
      snippet: "RAG retrieves documents at query time and conditions a language model on them.",
      content:
        "Retrieval-augmented generation (RAG) retrieves documents at query time and conditions a language model on them. It avoids retraining when the underlying corpus changes, but adds retrieval latency and depends on index quality.",
      kind: "encyclopedia" as const,
    },
    {
      title: "[arXiv] RAG versus fine-tuning for enterprise search",
      url: "https://arxiv.org/abs/2402.00002",
      domain: "arxiv.org",
      snippet: "The study compares RAG and fine-tuning on enterprise search workloads.",
      content:
        "The study compares RAG and fine-tuning on enterprise search workloads. Fine-tuning improves style and domain vocabulary, while RAG keeps answers grounded in the current document index. The authors report that RAG handled corpus updates better than fine-tuning, at the cost of higher query latency.",
      kind: "academic" as const,
      publishedAt: "2025-02-04",
    },
    {
      title: "[OpenAlex] Fine-tuning large language models for retrieval",
      url: "https://openalex.org/works/W2402",
      domain: "openalex.org",
      snippet: "Fine-tuning improves domain vocabulary but can stale quickly.",
      content:
        "Fine-tuning large language models improves domain vocabulary and answer style. The benchmark finds that models fine-tuned on a static corpus become stale as documents change, so teams often combine fine-tuning with retrieval.",
      kind: "academic" as const,
      publishedAt: "2024-12-11",
    },
    {
      title: "Evaluating RAG pipelines in production",
      url: "https://example.com/rag-pipelines",
      domain: "example.com",
      snippet: "RAG pipelines need evaluation for retrieval quality and answer grounding.",
      content:
        "Production RAG pipelines need evaluation for retrieval quality and answer grounding. The report compares latency, cost and update cadence against a fine-tuning baseline.",
      kind: "web" as const,
    },
    {
      title: "[arXiv] Cost trade-offs of fine-tuning versus retrieval augmentation",
      url: "https://arxiv.org/abs/2402.00003",
      domain: "arxiv.org",
      snippet: "Fine-tuning has higher upfront cost but lower per-query latency.",
      content:
        "The cost study finds that fine-tuning has higher upfront training cost but lower per-query latency, while retrieval augmentation shifts cost to the index and inference path. It compares RAG and fine-tuning under realistic update rates.",
      kind: "academic" as const,
      publishedAt: "2025-03-18",
    },
    {
      title: "[OpenAlex] Benchmarking retrieval-augmented generation systems",
      url: "https://openalex.org/works/W2403",
      domain: "openalex.org",
      snippet: "Benchmarks compare RAG configurations and fine-tuned baselines.",
      content:
        "The benchmark compares retrieval-augmented generation configurations with fine-tuned baselines. RAG scored higher on citation faithfulness, while fine-tuning scored higher on style consistency.",
      kind: "academic" as const,
      publishedAt: "2025-04-02",
    },
  ];

  return {
    ...actual,
    searchAll: vi.fn(
      async (
        queries: string[],
        options: { onProgress?: (progress: Record<string, unknown>) => void } = {}
      ) => {
        options.onProgress?.({
          id: "web-1",
          name: "web_search",
          input: queries[0] ?? "query",
          status: "running",
        });
        options.onProgress?.({
          id: "web-1",
          name: "web_search",
          input: queries[0] ?? "query",
          status: "done",
          summary: "results",
        });
        const comparison = /rag|fine-tun/i.test(queries.join(" "));
        const hits = comparison ? comparisonHits : quantumHits;
        return searchState.scarce ? hits.slice(0, 2) : hits;
      }
    ),
  };
});

vi.mock("@/lib/reader", () => ({
  readSources: vi.fn(
    async (
      sources: unknown[],
      _maxPages: number,
      _signal?: AbortSignal,
      onProgress?: (progress: Record<string, unknown>) => void
    ) => {
      onProgress?.({
        sourceId: "S1",
        url: "https://example.com/cost",
        status: "done",
        summary: "Read 1,200 chars",
      });
      return { attempted: sources.length, read: sources.length, failures: 0 };
    }
  ),
}));

function collect(): { events: AgentEvent[]; emit: (event: AgentEvent) => void } {
  const events: AgentEvent[] = [];
  return { events, emit: (event) => events.push(event) };
}

function context(): AgentContext {
  return { providers: [] };
}

function reportEvent(events: AgentEvent[]): Extract<AgentEvent, { type: "report" }> | undefined {
  return events.find((event): event is Extract<AgentEvent, { type: "report" }> => {
    return event.type === "report";
  });
}

function tokenText(events: AgentEvent[]): string {
  return events
    .filter((event): event is Extract<AgentEvent, { type: "token" }> => event.type === "token")
    .map((event) => event.text)
    .join("");
}

function proposalEvent(
  events: AgentEvent[]
): Extract<AgentEvent, { type: "proposal" }> | undefined {
  return events.find((event): event is Extract<AgentEvent, { type: "proposal" }> => {
    return event.type === "proposal";
  });
}

function clarifyEvent(
  events: AgentEvent[]
): Extract<AgentEvent, { type: "clarify" }> | undefined {
  return events.find((event): event is Extract<AgentEvent, { type: "clarify" }> => {
    return event.type === "clarify";
  });
}

function index(
  events: AgentEvent[],
  type: AgentEvent["type"],
  predicate?: (event: AgentEvent) => boolean
): number {
  return events.findIndex((event) => event.type === type && (!predicate || predicate(event)));
}

beforeEach(() => {
  vi.clearAllMocks();
  searchState.scarce = false;
});

describe("zero-key agent", () => {
  it("streams an approved research run, then shows a source digest instead of a paper", async () => {
    const request: AgentRequest = {
      chatId: "chat-approved",
      messages: [{ role: "user", content: "go ahead" }],
      mode: "standard",
      spec,
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    const types = events.map((event) => event.type);
    expect(types.slice(0, 2)).toEqual(["title", "intent"]);
    expect(types.at(-1)).toBe("done");

    const run = index(events, "run");
    const firstTodo = index(events, "todo");
    const firstThinking = index(events, "thinking");
    const plan = index(events, "plan");
    const searchRunning = index(
      events,
      "step",
      (event) => event.type === "step" && event.id === "search" && event.status === "running"
    );
    const firstTool = index(events, "tool");
    const firstSource = index(events, "source");
    const readRunning = index(
      events,
      "step",
      (event) => event.type === "step" && event.id === "read" && event.status === "running"
    );
    const analyze = index(
      events,
      "step",
      (event) => event.type === "step" && event.id === "analyze" && event.status === "running"
    );
    const write = index(
      events,
      "step",
      (event) => event.type === "step" && event.id === "write" && event.status === "running"
    );

    expect(run).toBeGreaterThan(-1);
    expect(firstTodo).toBeGreaterThan(run);
    expect(firstThinking).toBeGreaterThan(firstTodo);
    expect(plan).toBeGreaterThan(firstThinking);
    expect(searchRunning).toBeLessThan(firstTool);
    expect(firstTool).toBeLessThan(firstSource);
    expect(firstSource).toBeLessThan(readRunning);
    expect(readRunning).toBeLessThan(analyze);
    expect(analyze).toBeLessThan(write);

    const runEvent = events.find((event) => event.type === "run");
    expect(runEvent).toMatchObject({ type: "run", mode: "standard", topic: "quantum computing" });
    expect(events.filter((event) => event.type === "done")).toHaveLength(1);

    // Real tool invocations, not fabricated ones.
    const searchTools = events.filter(
      (event) => event.type === "tool" && event.name === "web_search"
    );
    expect(searchTools.length).toBeGreaterThanOrEqual(2);
    const readTools = events.filter((event) => event.type === "tool" && event.name === "read_page");
    expect(readTools.length).toBeGreaterThanOrEqual(1);

    const sources = events.filter((event) => event.type === "source");
    expect(sources).toHaveLength(3);

    // No language model means no paper, no report event and no fake prose.
    expect(events.some((event) => event.type === "report")).toBe(false);
    expect(events.some((event) => event.type === "report_token")).toBe(false);
    expect(
      events.some((event) => event.type === "step" && event.id === "review")
    ).toBe(false);

    const error = events.find(
      (event) => event.type === "error" && /No LLM key is configured/i.test(event.message)
    );
    expect(error).toBeDefined();

    const digest = tokenText(events);
    expect(digest).toMatch(/source digest/i);
    expect(digest).toMatch(/not a research paper/i);
    expect(digest).toMatch(/\[S1\]/);
    expect(digest).not.toMatch(/## Abstract/);

    const lastTodo = events.filter((event) => event.type === "todo").at(-1);
    if (lastTodo?.type === "todo") {
      expect(lastTodo.items.some((item) => item.id === "write" && item.status === "error")).toBe(
        true
      );
      expect(lastTodo.items.some((item) => item.id === "review" && item.status === "error")).toBe(
        true
      );
    }
  });

  it("echoes chatId and one stable runId on every event", async () => {
    const request: AgentRequest = {
      chatId: "chat-meta",
      messages: [{ role: "user", content: "go ahead" }],
      spec,
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    const run = events.find((event) => event.type === "run");
    expect(run).toBeDefined();
    const runId = run?.runId;
    expect(typeof runId).toBe("string");
    expect(runId?.length).toBeGreaterThan(0);

    for (const event of events) {
      expect(event.chatId, event.type).toBe("chat-meta");
      expect(event.runId, event.type).toBe(runId);
    }
  });

  it("uses the run id supplied by the API route", async () => {
    const request: AgentRequest = {
      chatId: "chat-shared-run",
      messages: [{ role: "user", content: "go ahead" }],
      spec,
    };
    const { events, emit } = collect();

    await runAgent(
      request,
      { providers: [], runId: "server-run-id" },
      emit,
      new AbortController().signal
    );

    expect(events.every((event) => event.runId === "server-run-id")).toBe(true);
  });

  it("asks one clarify batch when the brief is open, then stops", async () => {
    const request: AgentRequest = {
      chatId: "chat-open",
      messages: [{ role: "user", content: "Research quantum computing" }],
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    expect(events.find((event) => event.type === "intent")).toMatchObject({
      type: "intent",
      intent: "clarify",
    });
    const clarify = clarifyEvent(events);
    expect(clarify).toBeDefined();
    expect(clarify?.questions.length).toBeGreaterThan(0);
    expect(clarify?.questions.length).toBeLessThanOrEqual(4);
    expect(new Set(clarify?.questions.map((question) => question.id)).size).toBe(
      clarify?.questions.length
    );
    expect(clarify?.question).toBe(clarify?.questions[0]?.question);
    expect(events.some((event) => event.type === "run")).toBe(false);
    expect(events.some((event) => event.type === "proposal")).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("skips scoping and the proposal when length and audience are already given", async () => {
    const request: AgentRequest = {
      chatId: "chat-specified",
      messages: [
        { role: "user", content: "Research quantum computing for general readers in a 5-page report" },
      ],
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    expect(events.find((event) => event.type === "intent")).toMatchObject({
      type: "intent",
      intent: "research",
    });
    expect(events.some((event) => event.type === "clarify")).toBe(false);
    expect(events.some((event) => event.type === "proposal")).toBe(false);
    expect(events.some((event) => event.type === "run")).toBe(true);
    // Without a key the run ends with a labelled digest, never a fake report.
    expect(events.some((event) => event.type === "report")).toBe(false);
    expect(tokenText(events)).toMatch(/source digest/i);
  });

  it("emits a proposal after scoping answers and waits for approval", async () => {
    const request: AgentRequest = {
      chatId: "chat-proposal",
      messages: [
        { role: "user", content: "Research quantum computing" },
        { role: "user", content: "5 pages, for general readers" },
      ],
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    expect(events.find((event) => event.type === "intent")).toMatchObject({
      type: "intent",
      intent: "research",
    });
    const proposal = proposalEvent(events);
    expect(proposal).toBeDefined();
    expect(proposal?.spec.pages).toBe(5);
    expect(proposal?.spec.audience).toBe("general readers");
    expect(proposal?.summary).toContain("5-page");
    expect(index(events, "proposal")).toBeLessThan(index(events, "done"));
    expect(events.some((event) => event.type === "run")).toBe(false);
    expect(events.some((event) => event.type === "report")).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("turns structured clarify answers into a proposal without re-asking", async () => {
    const request: AgentRequest = {
      chatId: "chat-answers",
      messages: [{ role: "user", content: "Research quantum computing" }],
      answers: [
        { questionId: "length", answer: "5 pages" },
        { questionId: "audience", answer: "for general readers" },
      ],
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    expect(events.some((event) => event.type === "clarify")).toBe(false);
    const proposal = proposalEvent(events);
    expect(proposal?.spec.pages).toBe(5);
    expect(proposal?.spec.audience).toBe("general readers");
    expect(events.some((event) => event.type === "run")).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("skips questions that were already answered in a clarify batch", async () => {
    const request: AgentRequest = {
      chatId: "chat-partial-answers",
      messages: [{ role: "user", content: "Write 100 pages on deepfake detection with LLMs" }],
      answers: [{ questionId: "audience", answer: "for executives" }],
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    const clarify = clarifyEvent(events);
    expect(clarify).toBeDefined();
    expect(clarify?.questions.length).toBeLessThanOrEqual(4);
    expect(clarify?.questions[0]?.id).toBe("feasibility");
    expect(clarify?.questions.some((question) => question.id === "audience")).toBe(false);
    expect(events.some((event) => event.type === "run")).toBe(false);
  });

  it("marks an oversized page request honestly and offers concrete choices", async () => {
    const request: AgentRequest = {
      chatId: "chat-oversized",
      messages: [{ role: "user", content: "100 pages on deepfake detection with LLMs" }],
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    expect(events.find((event) => event.type === "intent")).toMatchObject({
      type: "intent",
      intent: "clarify",
    });
    const clarify = clarifyEvent(events);
    expect(clarify?.notice).toContain("100 pages");
    expect(clarify?.notice).toContain("18");
    expect(clarify?.questions[0]).toMatchObject({ id: "feasibility" });
    const options = clarify?.questions[0]?.options ?? [];
    expect(options).toEqual(
      expect.arrayContaining([
        "~15 pages comprehensive",
        "Full 100-page outline now, then write it volume by volume",
        "A 4-page executive version",
      ])
    );
    expect(events.some((event) => event.type === "run")).toBe(false);
    expect(events.some((event) => event.type === "report")).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("shows the chosen 100-page outline on a proposal before running", async () => {
    const request: AgentRequest = {
      chatId: "chat-outline-choice",
      messages: [
        { role: "user", content: "100 pages on deepfake detection with LLMs" },
        {
          role: "user",
          content: "Full 100-page outline now, then write it volume by volume",
        },
      ],
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    const proposal = proposalEvent(events);
    expect(proposal).toBeDefined();
    expect(proposal?.spec.pages).toBe(100);
    expect(proposal?.spec.mode).toBe("deep");
    expect(proposal?.summary).toContain("100-page");
    expect(events.some((event) => event.type === "run")).toBe(false);
    expect(events.some((event) => event.type === "report")).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("includes the academic search todo in standard mode too", async () => {
    const request: AgentRequest = {
      chatId: "chat-academic-standard",
      messages: [{ role: "user", content: "go ahead" }],
      mode: "standard",
      spec,
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    const todos = events.filter((event) => event.type === "todo");
    const first = todos[0];
    expect(first?.type).toBe("todo");
    if (first?.type === "todo") {
      expect(first.items.some((item) => item.id === "search_academic")).toBe(true);
      expect(first.items.length).toBe(7);
    }

    const digest = tokenText(events);
    expect(digest).toMatch(/source digest/i);
    expect(digest).toMatch(/arXiv/);
    expect(digest).toMatch(/OpenAlex/);
    expect(events.some((event) => event.type === "report")).toBe(false);
  });

  it("finds six relevant sources for a RAG vs fine-tuning comparison and offers a labelled digest", async () => {
    const request: AgentRequest = {
      chatId: "chat-comparison",
      messages: [{ role: "user", content: "go ahead" }],
      mode: "standard",
      spec: comparisonSpec,
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    const sources = events.filter(
      (event): event is Extract<AgentEvent, { type: "source" }> => event.type === "source"
    );
    expect(sources.length).toBeGreaterThanOrEqual(6);
    const domains = sources.map((event) => event.source.domain);
    expect(domains.some((domain) => /arxiv\.org/.test(domain))).toBe(true);
    expect(domains.some((domain) => /openalex\.org/.test(domain))).toBe(true);

    // No model is available, so the output is clearly labelled as a digest.
    expect(events.some((event) => event.type === "report")).toBe(false);
    const digest = tokenText(events);
    expect(digest).toMatch(/source digest/i);
    expect(digest).toMatch(/RAG vs fine-tuning/i);
    expect(digest).toMatch(/\[S\d+\]/);
  });

  it("refuses to write a paper with fewer than three relevant sources instead of padding", async () => {
    searchState.scarce = true;
    const request: AgentRequest = {
      chatId: "chat-scarce",
      messages: [{ role: "user", content: "go ahead" }],
      spec,
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    expect(
      events.some(
        (event) =>
          event.type === "error" &&
          event.recoverable &&
          /at least 3/i.test(event.message) &&
          /stopped before writing/i.test(event.message)
      )
    ).toBe(true);
    const text = tokenText(events);
    expect(text).toMatch(/Broaden the topic/i);
    expect(text).toMatch(/Tavily/i);
    expect(text).toMatch(/background overview/i);
    expect(events.some((event) => event.type === "report")).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === "step" && event.id === "write" && event.status === "error"
      )
    ).toBe(true);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("answers a follow-up from the existing paper without inventing sources", async () => {
    const request: AgentRequest = {
      chatId: "chat-followup",
      messages: [{ role: "user", content: "What does the report say about cost?" }],
      report: {
        title: "Cost report",
        markdown:
          "# Cost report\n\n## 3. Findings\n\nThe total cost of ownership is 42 percent lower over five years according to the retrieved analysis [S1]. This paragraph is deliberately long enough to pass the deterministic relevance filter.",
        sources: [source],
      },
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    expect(events.find((event) => event.type === "intent")).toMatchObject({
      type: "intent",
      intent: "followup",
    });
    expect(events.some((event) => event.type === "thinking")).toBe(true);
    const text = tokenText(events);
    expect(text).toContain("From the report");
    expect(text).toContain("[S1]");
    expect(events.at(-1)?.type).toBe("done");
  });

  it("removes exactly one section and preserves the rest byte-for-byte", async () => {
    const before =
      "# Original report\n\n## 3. Findings\n\nA cited finding [S1].\n\n## 4. Discussion\n\nA cited discussion [S1].\n\n## 5. Limitations\n\nA cited limitation [S1].\n";
    const request: AgentRequest = {
      chatId: "chat-remove-section",
      messages: [{ role: "user", content: "Remove the limitations section" }],
      report: {
        title: "Original report",
        markdown: before,
        sources: [source],
        version: 2,
      },
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    expect(events.find((event) => event.type === "intent")).toMatchObject({
      type: "intent",
      intent: "edit_report",
    });
    const report = reportEvent(events);
    expect(report).toBeDefined();
    expect(report?.version).toBe(3);
    expect(report?.markdown).not.toMatch(/## 5\. Limitations/);
    expect(report?.markdown).toContain("## 3. Findings\n\nA cited finding [S1].");
    expect(report?.markdown).toContain("## 4. Discussion\n\nA cited discussion [S1].");
    const sectionUpdate = events.find(
      (event): event is Extract<AgentEvent, { type: "section_update" }> =>
        event.type === "section_update"
    );
    expect(sectionUpdate?.heading).toContain("Limitations");
    expect(events.at(-1)?.type).toBe("done");
  });

  it("returns a recoverable error when a whole-report edit needs a key", async () => {
    const request: AgentRequest = {
      chatId: "chat-edit-key",
      messages: [{ role: "user", content: "Make it shorter" }],
      report: {
        title: "Original report",
        markdown:
          "# Original report\n\n## 3. Findings\n\nA short, cited summary [S1].\n\n## 5. Limitations\n\n- A finding [S1].\n",
        sources: [source],
      },
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    expect(events.find((event) => event.type === "intent")).toMatchObject({
      type: "intent",
      intent: "edit_report",
    });
    expect(
      events.some(
        (event) =>
          event.type === "error" &&
          /needs a language model|No LLM key is configured/i.test(event.message)
      )
    ).toBe(true);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("answers greetings with a helpful zero-key message", async () => {
    const request: AgentRequest = {
      chatId: "chat-greeting",
      messages: [{ role: "user", content: "hello" }],
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    expect(events.find((event) => event.type === "intent")).toMatchObject({
      type: "intent",
      intent: "chat",
    });
    expect(tokenText(events)).toContain("Groq or OpenRouter");
    expect(events.at(-1)?.type).toBe("done");
  });

  it("keeps two concurrent runs separate", async () => {
    const quantum: AgentRequest = {
      chatId: "chat-concurrent-a",
      messages: [{ role: "user", content: "go ahead" }],
      spec,
    };
    const comparison: AgentRequest = {
      chatId: "chat-concurrent-b",
      messages: [{ role: "user", content: "go ahead" }],
      spec: comparisonSpec,
    };
    const a = collect();
    const b = collect();

    await Promise.all([
      runAgent(quantum, context(), a.emit, new AbortController().signal),
      runAgent(comparison, context(), b.emit, new AbortController().signal),
    ]);

    const aRun = a.events.find((event) => event.type === "run");
    const bRun = b.events.find((event) => event.type === "run");
    expect(aRun).toBeDefined();
    expect(bRun).toBeDefined();
    expect(aRun?.runId).not.toBe(bRun?.runId);
    expect(aRun?.type === "run" ? aRun.topic : "").toContain("quantum");
    expect(bRun?.type === "run" ? bRun.topic : "").toContain("RAG");

    expect(a.events.every((event) => event.chatId === "chat-concurrent-a")).toBe(true);
    expect(b.events.every((event) => event.chatId === "chat-concurrent-b")).toBe(true);
    expect(a.events.every((event) => event.runId === aRun?.runId)).toBe(true);
    expect(b.events.every((event) => event.runId === bRun?.runId)).toBe(true);

    const aDigest = tokenText(a.events);
    const bDigest = tokenText(b.events);
    expect(aDigest).toMatch(/source digest: quantum computing/i);
    expect(bDigest).toMatch(/source digest: RAG vs fine-tuning/i);
    expect(a.events.filter((event) => event.type === "source")).toHaveLength(3);
    expect(b.events.filter((event) => event.type === "source").length).toBeGreaterThanOrEqual(6);
    expect(a.events.some((event) => event.type === "report")).toBe(false);
    expect(b.events.some((event) => event.type === "report")).toBe(false);
  });
});

describe("event hygiene", () => {
  it("never emits secrets in error messages", async () => {
    const request: AgentRequest = {
      chatId: "chat-secrets",
      messages: [{ role: "user", content: "go ahead" }],
      mode: "quick",
      spec: { ...spec, mode: "quick", pages: 2 },
    };
    const { events, emit } = collect();

    await runAgent(request, context(), emit, new AbortController().signal);

    const json = JSON.stringify(events);
    expect(json).not.toMatch(/gsk_|sk-or-v1|tvly-/);
  });
});
