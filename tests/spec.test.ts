import { describe, expect, it } from "vitest";
import type { ResearchSpec } from "@/lib/contract";
import {
  applyAnswerToSpec,
  applyProposalEdit,
  buildClarifyQuestions,
  buildSpec,
  hasScopingAnswers,
  inferFromText,
  needsClarification,
  normalizeSpec,
  outlineTotal,
  specFromConversation,
  specSummary,
  wordBudgetForSpec,
  WORDS_PER_PAGE,
} from "@/lib/research/spec";
import { extractTopic, titleFromTopic } from "@/lib/research/plan";

const base: ResearchSpec = {
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
    { heading: "Findings", pages: 2 },
    { heading: "Discussion", pages: 1 },
    { heading: "Conclusion & future directions", pages: 1 },
  ],
};

describe("scoping", () => {
  it("does not ask when length and audience are already specified", () => {
    expect(needsClarification("Write a 5-page report on quantum computing for beginners")).toBe(false);
    expect(needsClarification("A 12-page technical brief on RAG evaluation for engineers")).toBe(false);
    expect(needsClarification("just do it")).toBe(false);
  });

  it("asks when length or audience is missing", () => {
    expect(needsClarification("Research quantum computing")).toBe(true);
    expect(needsClarification("Compare RAG vs fine-tuning")).toBe(true);
  });

  it("returns at most four unanswered questions with a decide-for-me option", () => {
    const questions = buildClarifyQuestions("Research quantum computing");
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(4);
    expect(questions.map((question) => question.id)).toEqual(
      expect.arrayContaining(["length", "audience", "focus"])
    );
    for (const question of questions) {
      expect(question.options.some((option) => /decide for me/i.test(option))).toBe(true);
    }
  });

  it("skips questions already answered", () => {
    const questions = buildClarifyQuestions(
      "A 5-page report on quantum computing for technical experts focused on error correction"
    );
    expect(questions.some((question) => question.id === "length")).toBe(false);
    expect(questions.some((question) => question.id === "audience")).toBe(false);
  });

  it("recognises that the user has answered a scoping batch", () => {
    expect(
      hasScopingAnswers([
        { role: "user", content: "Research quantum computing" },
        { role: "user", content: "5 pages" },
      ])
    ).toBe(true);
    expect(hasScopingAnswers([{ role: "user", content: "Research quantum computing" }])).toBe(false);
  });
});

describe("spec and word budget", () => {
  it("derives the target word count from the page target", () => {
    expect(wordBudgetForSpec(base)).toBe(5 * WORDS_PER_PAGE);
    expect(wordBudgetForSpec({ ...base, pages: 12 })).toBe(12 * WORDS_PER_PAGE);
    expect(wordBudgetForSpec({ ...base, pages: 0.1 })).toBeGreaterThanOrEqual(250);
  });

  it("builds a spec from an explicit prompt", () => {
    const inference = inferFromText("A 7-page report on quantum computing for beginners, focused on error correction");
    const spec = buildSpec("quantum computing", inference, { mode: "standard" });
    expect(spec.pages).toBe(7);
    expect(spec.audience).toBe("beginners");
    expect(outlineTotal(spec.outline)).toBeCloseTo(7, 1);
    expect(specSummary(spec)).toContain("7-page");
  });

  it("clamps and repairs a spec from the client", () => {
    const repaired = normalizeSpec({
      ...base,
      pages: 999,
      citationStyle: "bogus" as never,
      outline: [{ heading: "", pages: 0 }],
    });
    expect(repaired.pages).toBe(100);
    expect(repaired.citationStyle).toBe("numbered");
    expect(repaired.outline.length).toBeGreaterThan(0);
    expect(outlineTotal(repaired.outline)).toBeCloseTo(repaired.pages, 1);
  });

  it("folds a scoping answer into a conversation", () => {
    const spec = specFromConversation([
      { role: "user", content: "Research quantum computing" },
      { role: "user", content: "5 pages for general readers" },
    ]);
    expect(spec.topic.toLowerCase()).toContain("quantum computing");
    expect(spec.pages).toBe(5);
    expect(spec.audience).toBe("general readers");
  });
});

describe("proposal edits", () => {
  it("updates pages and citation style in a single round-trip", () => {
    const edited = applyProposalEdit("Make it 8 pages and use APA style", base);
    expect(edited.spec.pages).toBe(8);
    expect(edited.spec.citationStyle).toBe("apa");
    expect(edited.changes.length).toBeGreaterThan(0);
    expect(outlineTotal(edited.spec.outline)).toBeCloseTo(8, 1);

    const roundTrip = normalizeSpec(JSON.parse(JSON.stringify(edited.spec)) as ResearchSpec);
    expect(roundTrip).toMatchObject({
      topic: base.topic,
      pages: 8,
      citationStyle: "apa",
      audience: base.audience,
    });
  });

  it("maps clarify option labels onto the spec", () => {
    const edited = applyAnswerToSpec("Professional / executive", base);
    expect(edited.spec.audience).toBe("executives");
    expect(edited.changes.join(" ")).toMatch(/audience/i);
  });

  it("adds and drops outline sections without changing the page total", () => {
    const added = applyProposalEdit("Add a section on costs", base);
    expect(added.spec.outline.some((entry) => /costs/i.test(entry.heading))).toBe(true);

    const dropped = applyProposalEdit("Remove the discussion section", added.spec);
    expect(dropped.spec.outline.some((entry) => /discussion/i.test(entry.heading))).toBe(false);
    expect(outlineTotal(dropped.spec.outline)).toBeCloseTo(dropped.spec.pages, 1);
  });
});

describe("topic extraction", () => {
  it("strips length, format and audience framing from the research topic", () => {
    const messages = (content: string) => [{ role: "user" as const, content }];

    expect(extractTopic(messages("Write a 5-page report on quantum computing for beginners"))).toBe(
      "quantum computing for beginners"
    );
    expect(extractTopic(messages("A 12-page technical brief on RAG evaluation for engineers"))).toBe(
      "RAG evaluation for engineers"
    );
    expect(extractTopic(messages("Research quantum computing"))).toBe("quantum computing");
    expect(extractTopic(messages("Write a report on grid storage"))).toBe("grid storage");
    expect(titleFromTopic(extractTopic(messages("Write a 5-page report on quantum computing")))).toBe(
      "Quantum computing"
    );
  });

  it("captures a natural-language focus answer", () => {
    expect(inferFromText("5 pages, for beginners, focused on error correction").focus).toBe(
      "error correction"
    );
    expect(inferFromText("with a focus on fault tolerance").focus).toBe("fault tolerance");
  });
});
