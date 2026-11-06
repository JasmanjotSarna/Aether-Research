import { describe, expect, it } from "vitest";
import {
  changedSections,
  findSection,
  insertSection,
  parseSections,
  removeSection,
  replaceSection,
  resolveEditTarget,
} from "@/lib/research/sections";

const report = [
  "# Test paper",
  "",
  "## Abstract",
  "",
  "An abstract with a citation [S1].",
  "",
  "## 1. Introduction",
  "",
  "An introduction with a citation [S1].",
  "",
  "## 2. Methodology",
  "",
  "The searches were run in two indexes [S1].",
  "",
  "## 3. Findings",
  "",
  "The main finding is supported [S1].",
  "",
  "## 4. Discussion",
  "",
  "The discussion weighs the evidence [S1].",
  "",
  "## 5. Limitations",
  "",
  "The evidence is thin [S1].",
  "",
  "## 6. Conclusion & future directions",
  "",
  "More research is needed [S1].",
  "",
].join("\n");

describe("section edits", () => {
  it("replaces only the target section and leaves every other byte identical", () => {
    const before = findSection(report, "Findings");
    expect(before).toBeDefined();

    const replacement = "## 3. Findings\n\nA sharper finding with two citations [S1][S2].\n";
    const after = replaceSection(report, "Findings", replacement);
    expect(after).not.toBe(report);

    // Everything before and after the target slice is byte-identical.
    expect(after.slice(0, before?.start)).toBe(report.slice(0, before?.start));
    expect(after.slice(after.length - (report.length - (before?.end ?? 0)))).toBe(
      report.slice(before?.end)
    );
    expect(after).toContain("A sharper finding with two citations [S1][S2].");
    expect(after).toContain("## 3. Findings");
  });

  it("reports only the changed section", () => {
    const after = replaceSection(report, "Discussion", "## 4. Discussion\n\nA new discussion [S1].\n");
    expect(changedSections(report, after)).toEqual(["4. Discussion"]);
  });

  it("removes one section without touching the others", () => {
    const before = findSection(report, "Limitations");
    const after = removeSection(report, "Limitations");
    expect(after).not.toContain("## 5. Limitations");
    expect(after).toContain("## 4. Discussion");
    expect(after).toContain("## 6. Conclusion & future directions");
    expect(after.slice(0, before?.start)).toBe(report.slice(0, before?.start));
  });

  it("inserts a new section before the conclusion", () => {
    const after = insertSection(report, "Findings: Costs", "## Findings: Costs\n\nA cost finding [S1].\n");
    const headings = parseSections(after).map((section) => section.heading);
    const costs = headings.indexOf("Findings: Costs");
    const conclusion = headings.indexOf("6. Conclusion & future directions");
    expect(costs).toBeGreaterThan(-1);
    expect(costs).toBeLessThan(conclusion);
    expect(after).toContain("The discussion weighs the evidence [S1].");
  });

  it("matches numbered and unnumbered headings", () => {
    expect(findSection(report, "3. Findings")?.heading).toBe("3. Findings");
    expect(findSection(report, "findings")?.heading).toBe("3. Findings");
    expect(findSection(report, "Conclusion")?.heading).toBe("6. Conclusion & future directions");
  });
});

describe("edit target detection", () => {
  it("targets a named section", () => {
    expect(resolveEditTarget("Rewrite the findings section more formally", report)).toMatchObject({
      mode: "replace",
      headings: ["3. Findings"],
    });
    expect(resolveEditTarget("Remove the limitations section", report)).toMatchObject({
      mode: "remove",
      headings: ["5. Limitations"],
    });
  });

  it("targets a new section", () => {
    expect(resolveEditTarget("Add a section on costs", report)).toMatchObject({
      mode: "add",
      newHeading: "Findings: costs",
    });
  });

  it("falls back to a whole-report edit", () => {
    expect(resolveEditTarget("Make it shorter", report).mode).toBe("global");
    expect(resolveEditTarget("Use APA citation style", report).mode).toBe("global");
  });
});
