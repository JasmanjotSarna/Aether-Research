import { describe, expect, it } from "vitest";
import { routeRequest } from "@/lib/agent/router";
import type { ResearchSpec } from "@/lib/contract";

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
    { heading: "Evidence", pages: 2 },
    { heading: "Limitations", pages: 1 },
  ],
};

describe("intent router", () => {
  it("skips scoping when length and audience are already specified", () => {
    const result = routeRequest({
      messages: [
        { role: "user", content: "Research quantum computing for general readers in a 5-page report" },
      ],
      hasReport: false,
    });
    expect(result.intent).toBe("research");
    expect(result.autoApprove).toBe(true);
    expect(result.topic).toContain("quantum computing");
  });

  it("asks for clarification when the ask leaves length and audience open", () => {
    for (const text of ["What is quantum computing?", "Compare RAG vs fine-tuning for enterprise search"]) {
      const result = routeRequest({
        messages: [{ role: "user", content: text }],
        hasReport: false,
      });
      expect(result.intent, text).toBe("clarify");
      expect(result.clarify?.questions.length).toBeGreaterThan(0);
      expect(result.clarify?.questions.length).toBeLessThanOrEqual(4);
      expect(result.clarify?.questions[0]?.options.length).toBeGreaterThan(0);
    }
  });

  it("asks a topic question when the request is genuinely vague", () => {
    for (const text of ["research", "help", "AI"]) {
      const result = routeRequest({
        messages: [{ role: "user", content: text }],
        hasReport: false,
      });
      expect(result.intent, text).toBe("clarify");
      expect(result.clarify?.questions.some((question) => question.id === "topic")).toBe(true);
    }
  });

  it("treats 'just do it' as approval and skips scoping", () => {
    for (const text of ["just do it", "decide for me", "go ahead"]) {
      const result = routeRequest({
        messages: [{ role: "user", content: text }],
        hasReport: false,
        spec,
      });
      expect(result.intent, text).toBe("research");
      expect(result.autoApprove, text).toBe(true);
    }
  });

  it("treats a non-approval message as a proposal edit when a spec is present", () => {
    const result = routeRequest({
      messages: [{ role: "user", content: "Make it 8 pages and more technical" }],
      hasReport: false,
      spec,
    });
    expect(result.intent).toBe("research");
    expect(result.proposalEdit).toBe(true);
    expect(result.instruction).toContain("8 pages");
  });

  it("moves to a proposal once the user has answered a scoping batch", () => {
    const result = routeRequest({
      messages: [
        { role: "user", content: "Research quantum computing" },
        { role: "user", content: "5 pages, for general readers" },
      ],
      hasReport: false,
    });
    expect(result.intent).toBe("research");
    expect(result.autoApprove).not.toBe(true);
  });

  it("treats greetings and thanks as chat", () => {
    expect(
      routeRequest({ messages: [{ role: "user", content: "thanks!" }], hasReport: false }).intent
    ).toBe("chat");
    expect(
      routeRequest({ messages: [{ role: "user", content: "hello" }], hasReport: false }).intent
    ).toBe("chat");
  });

  it("routes report edits to edit_report", () => {
    const result = routeRequest({
      messages: [{ role: "user", content: "Make it shorter and add a section on costs" }],
      hasReport: true,
    });
    expect(result.intent).toBe("edit_report");
  });

  it("routes scoped research to research without restarting the paper", () => {
    const result = routeRequest({
      messages: [{ role: "user", content: "Research deeper into the findings section" }],
      hasReport: true,
    });
    expect(result.intent).toBe("research");
    expect(result.scope).toContain("findings");
    expect(result.autoApprove).toBe(true);
  });

  it("routes questions about an existing report to followup", () => {
    const result = routeRequest({
      messages: [{ role: "user", content: "What did the report say about costs?" }],
      hasReport: true,
    });
    expect(result.intent).toBe("followup");
    expect(result.question).toContain("costs");
  });

  it("lets an explicit new research request override an existing report", () => {
    const result = routeRequest({
      messages: [{ role: "user", content: "Research the history of the internet" }],
      hasReport: true,
    });
    expect(result.intent).toBe("research");
    expect(result.topic).toContain("history of the internet");
  });

  it("answers an oversized page request honestly instead of shrinking the number", () => {
    const result = routeRequest({
      messages: [{ role: "user", content: "100 pages on deepfake detection with LLMs" }],
      hasReport: false,
    });
    expect(result.intent).toBe("clarify");
    expect(result.clarify?.notice).toContain("100 pages");
    expect(result.clarify?.notice).toContain("18");
    const feasibility = result.clarify?.questions[0];
    expect(feasibility?.id).toBe("feasibility");
    expect(feasibility?.options).toEqual(
      expect.arrayContaining([
        "~15 pages comprehensive",
        "Full 100-page outline now, then write it volume by volume",
        "A 4-page executive version",
      ])
    );
  });

  it("skips a feasibility-batch question that was already answered", () => {
    const result = routeRequest({
      messages: [{ role: "user", content: "100 pages on deepfake detection with LLMs" }],
      hasReport: false,
      answers: [{ questionId: "audience", answer: "for executives" }],
    });
    expect(result.intent).toBe("clarify");
    expect(result.clarify?.questions[0]?.id).toBe("feasibility");
    expect(result.clarify?.questions.some((question) => question.id === "audience")).toBe(false);
    expect(result.clarify?.questions.length).toBeLessThanOrEqual(4);
  });

  it("routes an explicit feasibility choice to a proposal, not an automatic run", () => {
    const result = routeRequest({
      messages: [
        { role: "user", content: "100 pages on deepfake detection with LLMs" },
        { role: "user", content: "Full 100-page outline now, then write it volume by volume" },
      ],
      hasReport: false,
    });
    expect(result.intent).toBe("research");
    expect(result.autoApprove).not.toBe(true);
  });

  it("treats a structured clarify answer as a scoping answer", () => {
    const result = routeRequest({
      messages: [{ role: "user", content: "Research quantum computing" }],
      hasReport: false,
      answers: [{ questionId: "length", answer: "5 pages" }],
    });
    expect(result.intent).toBe("research");
    expect(result.autoApprove).not.toBe(true);
  });
});
