import { describe, expect, it } from "vitest";
import {
  findDuplicateSentences,
  repetitiveSections,
  sentenceSimilarity,
} from "@/lib/research/synthesis";
import {
  buildComparisonTable,
  comparisonTableIssues,
  COMPARISON_CRITERIA,
} from "@/lib/research/comparison";

describe("duplicate sentence detection", () => {
  it("finds the same sentence repeated across sections", () => {
    const repeated =
      "The evidence shows retrieval grounding reduces unsupported answers across enterprise deployments [S1].";
    const markdown = [
      "# RAG vs fine-tuning",
      "",
      "## Abstract",
      "",
      repeated,
      "",
      "## 3. Findings",
      "",
      "Fine-tuning improves domain vocabulary but becomes stale as documents change [S2].",
      "",
      "## 6. Conclusion & future directions",
      "",
      repeated,
    ].join("\n");

    const duplicates = findDuplicateSentences(markdown);
    expect(duplicates.length).toBeGreaterThan(0);
    expect(duplicates[0]).toMatchObject({
      heading: "Abstract",
      similarTo: "6. Conclusion & future directions",
      similarity: 1,
    });
    expect(repetitiveSections(markdown)).toEqual(
      expect.arrayContaining(["Abstract", "6. Conclusion & future directions"])
    );
  });

  it("finds near-identical wording, not only exact copies", () => {
    const a =
      "Retrieval augmentation keeps enterprise answers grounded in the current document index, which improves citation accuracy for production search [S1].";
    const b =
      "Retrieval augmentation keeps enterprise answers grounded in the live document index, which improves citation accuracy for production search [S1].";
    expect(sentenceSimilarity(a, b)).toBeGreaterThan(0.82);
    expect(findDuplicateSentences(`## A\n\n${a}\n\n## B\n\n${b}`).length).toBe(1);
  });

  it("does not flag genuinely different sentences", () => {
    const a = "Retrieval augmentation grounds each answer in freshly indexed documents [S1].";
    const b = "Fine-tuning adapts model weights to a fixed corpus and needs retraining [S2].";
    expect(findDuplicateSentences(`## A\n\n${a}\n\n## B\n\n${b}`)).toEqual([]);
  });
});

describe("comparison tables", () => {
  const evidence = [
    {
      sourceId: "S1",
      text: "RAG achieves higher answer accuracy on enterprise search because retrieval grounds each response in the current index.",
    },
    {
      sourceId: "S2",
      text: "Fine-tuning improves answer accuracy inside a fixed domain by adapting the model weights to the corpus.",
    },
    {
      sourceId: "S1",
      text: "RAG has lower upfront cost but pays a per-query retrieval and inference cost.",
    },
    {
      sourceId: "S2",
      text: "Fine-tuning has high upfront training cost but lower per-query latency once deployed.",
    },
    {
      sourceId: "S1",
      text: "RAG keeps data current because the index can be refreshed without retraining.",
    },
    {
      sourceId: "S2",
      text: "Fine-tuning becomes stale when the underlying documents change and needs periodic retraining.",
    },
  ];

  it("gives each side its own cited cell and marks real gaps", () => {
    const table = buildComparisonTable({
      left: "RAG",
      right: "fine-tuning",
      sources: [],
      evidence,
    });
    const rows = table.split("\n");
    const accuracy = rows.find((line) => line.startsWith("| Accuracy |")) ?? "";
    const accuracyCells = accuracy.split("|").slice(1, -1).map((cell) => cell.trim());
    expect(accuracyCells[1]).toContain("[S1]");
    expect(accuracyCells[2]).toContain("[S2]");
    expect(accuracyCells[1]).not.toBe(accuracyCells[2]);

    const cost = rows.find((line) => line.startsWith("| Cost |")) ?? "";
    const costCells = cost.split("|").slice(1, -1).map((cell) => cell.trim());
    expect(costCells[1]).not.toBe(costCells[2]);

    const privacy = rows.find((line) => line.startsWith("| Privacy |")) ?? "";
    const privacyCells = privacy.split("|").slice(1, -1).map((cell) => cell.trim());
    expect(privacyCells[1]).toBe("Not covered by the retrieved sources");
    expect(privacyCells[2]).toBe("Not covered by the retrieved sources");

    expect(table).toContain("| Criterion | RAG | fine-tuning |");
    for (const criterion of COMPARISON_CRITERIA) {
      expect(table).toContain(`| ${criterion} |`);
    }
  });

  it("accepts an honest gap but flags identical invented columns", () => {
    expect(
      comparisonTableIssues(
        buildComparisonTable({ left: "RAG", right: "fine-tuning", sources: [], evidence })
      )
    ).toEqual([]);

    const identical = [
      "| Criterion | RAG | Fine-tuning |",
      "| --- | --- | --- |",
      "| Accuracy | Same answer | Same answer |",
      "| Cost | Low | Low |",
    ].join("\n");
    expect(comparisonTableIssues(identical).join(" ")).toMatch(/identical columns/i);
  });

  it("flags meta rows such as source count", () => {
    const meta = [
      "| Criterion | RAG | Fine-tuning |",
      "| --- | --- | --- |",
      "| Source count | 6 sources | 6 sources |",
      "| Accuracy | Higher grounding | Higher style fit |",
    ].join("\n");
    expect(comparisonTableIssues(meta).join(" ")).toMatch(/meta row/i);
  });
});
