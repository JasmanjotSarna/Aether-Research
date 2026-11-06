import { describe, expect, it } from "vitest";
import type { Source } from "@/lib/contract";
import { checkCitations, mergeCritic, suggestFollowups } from "@/lib/quality";

const sources: Source[] = [
  {
    id: "S1",
    title: "Source one",
    url: "https://example.com/one",
    domain: "example.com",
    kind: "web",
    snippet: "One",
    credibility: 0.6,
    credibilityReason: "test",
  },
  {
    id: "S2",
    title: "Source two",
    url: "https://example.com/two",
    domain: "example.com",
    kind: "academic",
    snippet: "Two",
    credibility: 0.9,
    credibilityReason: "test",
  },
];

const goodReport = [
  "# Test report",
  "",
  "## Abstract",
  "A factual abstract with a citation [S1].",
  "",
  "## 1. Introduction",
  "A factual introduction with a citation [S1].",
  "",
  "## 2. Methodology",
  "The searches were run against two indexes [S1].",
  "",
  "## 3. Findings",
  "- A finding supported by two sources [S1][S2].",
  "",
  "## 4. Discussion",
  "The sources agree on the main point [S1][S2].",
  "",
  "## 5. Limitations",
  "- The evidence is thin [S2].",
  "",
  "## 6. Conclusion & future directions",
  "A cautious conclusion [S1].",
].join("\n");

describe("citation quality", () => {
  it("accepts a well-cited paper", () => {
    const result = checkCitations(goodReport, sources);
    expect(result.totalSources).toBe(2);
    expect(result.citedSources).toBe(2);
    expect(result.invalidCitations).toEqual([]);
    expect(result.missingSections).toEqual([]);
    expect(result.score).toBeGreaterThan(7);
  });

  it("accepts section headings without numeric prefixes", () => {
    const markdown = goodReport
      .replace("## 1. Introduction", "## Introduction")
      .replace("## 3. Findings", "## Findings");
    expect(checkCitations(markdown, sources).missingSections).toEqual([]);
  });

  it("flags invalid ids, uncited paragraphs and missing sections", () => {
    const markdown = [
      "# Broken",
      "",
      "A long uncited paragraph that runs on and on without any citation at all, which should be flagged by the deterministic checker because it is clearly factual prose and it keeps going for long enough to cross the length threshold used by the checker, so this paragraph must be reported as uncited evidence in the final audit.",
      "",
      "## Findings",
      "- A claim with a fake source [S9].",
    ].join("\n");

    const result = checkCitations(markdown, sources);
    expect(result.invalidCitations).toContain("S9");
    expect(result.uncitedParagraphs).toBeGreaterThan(0);
    expect(result.missingSections).toContain("Abstract");
    expect(result.missingSections).toContain("Methodology");
    expect(result.score).toBeLessThan(7);
  });

  it("scores a paper with no sources at zero", () => {
    const result = checkCitations(goodReport, []);
    expect(result.score).toBe(0);
    expect(result.notes.join(" ")).toMatch(/No sources were available/i);
  });

  it("merges critic notes without losing deterministic checks", () => {
    const deterministic = checkCitations(goodReport, sources);
    const merged = mergeCritic(deterministic, {
      score: 6.5,
      notes: ["Critic note"],
    });
    expect(merged.score).toBe(6.5);
    expect(merged.notes).toContain("Critic note");
    expect(merged.notes.length).toBeLessThanOrEqual(10);
  });

  it("always produces three follow-up questions", () => {
    const followups = suggestFollowups("quantum computing", ["Foundations", "Applications"]);
    expect(followups).toHaveLength(3);
    expect(followups.every((question) => question.endsWith("?"))).toBe(true);
  });
});
