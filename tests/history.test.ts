import { describe, expect, it } from "vitest";
import type { AgentMessage, ResearchSpec, StoredChat } from "@/lib/contract";
import { CHAT_SCHEMA_VERSION } from "@/lib/contract";
import {
  createStoredChat,
  normalizeStoredChat,
  parseStoredChat,
  roundTripStoredChat,
  serializeStoredChat,
  trimConversation,
  trimForReportPrompt,
} from "@/lib/agent/history";

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
    { heading: "Introduction", pages: 1 },
    { heading: "Findings", pages: 3 },
    { heading: "Conclusion & future directions", pages: 1 },
  ],
};

function conversation(turns: number, chars = 400): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (let index = 0; index < turns; index++) {
    messages.push({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `Message ${index + 1}: ${"detail ".repeat(Math.ceil(chars / 7))}`.slice(0, chars),
    });
  }
  return messages;
}

describe("history trimming", () => {
  it("keeps a short conversation verbatim", () => {
    const messages = conversation(4, 20);
    const result = trimConversation(messages, { maxChars: 10_000, keepLast: 10 });
    expect(result.removed).toBe(0);
    expect(result.messages).toEqual(messages);
  });

  it("folds older turns into a deterministic summary and keeps recent turns", () => {
    const messages = conversation(24, 500);
    const result = trimConversation(messages, { maxChars: 5_000, keepLast: 6 });

    expect(result.removed).toBeGreaterThan(0);
    expect(result.summary).toBeTruthy();
    expect(result.messages[0]?.content).toContain("Earlier conversation summary");
    expect(result.messages).toHaveLength(7);
    expect(result.messages.at(-1)?.content).toContain("Message 24");

    const total = result.messages.reduce((sum, message) => sum + message.content.length, 0);
    expect(total).toBeLessThanOrEqual(5_000);
  });

  it("never drops the latest user message when the budget is tiny", () => {
    const messages = conversation(12, 2_000);
    const result = trimConversation(messages, { maxChars: 1_000, keepLast: 4 });
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    expect(result.messages.some((message) => message.content.startsWith(lastUser?.content.slice(0, 20) ?? ""))).toBe(
      true
    );
  });

  it("reserves room for the report prompt", () => {
    const messages = conversation(20, 400);
    const result = trimForReportPrompt(messages, 4_000, 2_500);
    const total = result.messages.reduce((sum, message) => sum + message.content.length, 0);
    expect(total).toBeLessThanOrEqual(1_500);
  });
});

describe("stored chat JSON", () => {
  const chat: StoredChat = createStoredChat({
    id: "chat_test",
    title: "Quantum paper",
    mode: "deep",
    spec,
    messages: [
      {
        id: "m1",
        role: "user",
        text: "Research quantum computing",
        createdAt: "2026-01-01T00:00:00.000Z",
        thinking: ["Planning"],
        followups: ["What next?", "Where is the evidence?", "How mature is it?"],
      },
      {
        id: "m2",
        role: "assistant",
        text: "Here is the paper.",
        createdAt: "2026-01-01T00:01:00.000Z",
        reportVersion: 2,
      },
    ],
    reports: [
      {
        version: 2,
        title: "Quantum paper",
        markdown: "# Quantum paper\n\n## Abstract\n\nCited [S1].",
        sources: [
          {
            id: "S1",
            title: "Source",
            url: "https://example.com/source",
            domain: "example.com",
            kind: "web",
            snippet: "Snippet",
            credibility: 0.7,
            credibilityReason: "Test",
          },
        ],
        createdAt: "2026-01-01T00:02:00.000Z",
        pagesEstimated: 4,
        changes: ["Updated findings"],
        followups: ["a?", "b?", "c?"],
      },
    ],
  });

  it("round-trips through JSON without losing messages, reports or spec", () => {
    const restored = roundTripStoredChat(chat);
    expect(restored.schemaVersion).toBe(CHAT_SCHEMA_VERSION);
    expect(restored.id).toBe("chat_test");
    expect(restored.mode).toBe("deep");
    expect(restored.spec?.pages).toBe(5);
    expect(restored.messages).toHaveLength(2);
    expect(restored.messages[0]?.thinking).toEqual(["Planning"]);
    expect(restored.reports[0]?.version).toBe(2);
    expect(restored.reports[0]?.pagesEstimated).toBe(4);
    expect(restored.reports[0]?.changes).toEqual(["Updated findings"]);
    expect(restored.reports[0]?.sources[0]?.url).toBe("https://example.com/source");
  });

  it("recovers an older schema with missing optional fields", () => {
    const legacy = JSON.stringify({
      id: "old",
      title: "Old chat",
      messages: [{ role: "user", content: "hello" }],
      reports: [{ title: "Old report", markdown: "# Old\n\nText." }],
    });
    const restored = parseStoredChat(legacy);
    expect(restored).not.toBeNull();
    expect(restored?.schemaVersion).toBe(CHAT_SCHEMA_VERSION);
    expect(restored?.messages[0]?.id).toBe("msg_0");
    expect(restored?.messages[0]?.text).toBe("hello");
    expect(restored?.reports[0]?.version).toBe(1);
    expect(restored?.mode).toBe("standard");
    expect(restored?.spec).toBeNull();
  });

  it("rejects invalid JSON instead of throwing", () => {
    expect(parseStoredChat("{not json")).toBeNull();
    expect(normalizeStoredChat(null)).toBeNull();
    expect(serializeStoredChat(chat)).toContain('"schemaVersion":1');
  });
});
