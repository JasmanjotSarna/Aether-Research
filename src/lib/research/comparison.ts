/**
 * Deterministic comparison tables.
 *
 * A comparison table is only useful when each row says something different
 * about each side and points at evidence. An LLM can produce a table with two
 * identical columns or meta rows ("sources compared", "credibility") that say
 * nothing about the actual choice. This module builds the table from evidence
 * and refuses to invent a cell: when the retrieved sources do not cover a
 * criterion for a side, the cell says exactly that.
 */

import type { ResearchSource } from "../search/types";
import { findSection, replaceSection } from "./sections";

export const COMPARISON_CRITERIA = [
  "Accuracy",
  "Cost",
  "Latency",
  "Data freshness",
  "Hallucination risk",
  "Maintenance",
  "Privacy",
  "Best use case",
] as const;

export type ComparisonCriterion = (typeof COMPARISON_CRITERIA)[number];

const NOT_COVERED = "Not covered by the retrieved sources";

const CRITERION_TERMS: Record<ComparisonCriterion, RegExp> = {
  Accuracy: /\b(accuracy|accurate|precision|correctness|error rate|f1|quality of answers?)\b/i,
  Cost: /\b(cost|costs|price|pricing|spend|budget|expensive|cheaper|token cost)\b/i,
  Latency: /\b(latency|response time|throughput|speed|slower|faster|milliseconds?|ms)\b/i,
  "Data freshness": /\b(freshness|fresh|update[sd]?|up-to-date|current|real[- ]time|stale|re-?index)\b/i,
  "Hallucination risk": /\b(hallucinat\w*|grounded|grounding|faithful\w*|fabricat\w*|citation fidelity)\b/i,
  Maintenance: /\b(maintenance|maintain\w*|retrain\w*|operational|upkeep|engineering effort)\b/i,
  Privacy: /\b(privacy|confidential|data residency|on-prem|sensitive data|compliance)\b/i,
  "Best use case": /\b(use case|best for|suited|recommend\w*|ideal for|appropriate for|scenario)\b/i,
};

function entityTerms(entity: string): string[] {
  return Array.from(
    new Set(
      entity
        .toLowerCase()
        .split(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff]+/i)
        .filter((term) => term.length > 2)
    )
  );
}

function mentions(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((count, term) => count + (lower.includes(term) ? 1 : 0), 0);
}

function oneLine(text: string, max = 170): string {
  return text.replace(/\s+/g, " ").replace(/\|/g, "/").trim().slice(0, max);
}

interface EvidenceItem {
  sourceId: string;
  text: string;
}

function bestCell(
  criterion: ComparisonCriterion,
  side: "left" | "right",
  leftTerms: string[],
  rightTerms: string[],
  evidence: EvidenceItem[]
): string {
  const pattern = CRITERION_TERMS[criterion];
  const matches: Array<{ text: string; score: number }> = [];

  for (const item of evidence) {
    if (!pattern.test(item.text)) continue;
    const leftScore = mentions(item.text, leftTerms);
    const rightScore = mentions(item.text, rightTerms);
    // Only attribute a sentence to a side it actually names; a sentence that
    // names both sides is ambiguous for a single cell.
    if (side === "left" && leftScore > 0 && leftScore > rightScore) {
      matches.push({ text: `[${item.sourceId}] ${oneLine(item.text)}`, score: leftScore * 10 + item.text.length / 100 });
    }
    if (side === "right" && rightScore > 0 && rightScore > leftScore) {
      matches.push({ text: `[${item.sourceId}] ${oneLine(item.text)}`, score: rightScore * 10 + item.text.length / 100 });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches[0]?.text ?? NOT_COVERED;
}

export interface ComparisonInput {
  left: string;
  right: string;
  sources: ResearchSource[];
  evidence: EvidenceItem[];
}

/** Build a complete table. Every cell is evidence or an explicit gap. */
export function buildComparisonTable(input: ComparisonInput): string {
  const leftTerms = entityTerms(input.left);
  const rightTerms = entityTerms(input.right);
  const headerLeft = oneLine(input.left, 40);
  const headerRight = oneLine(input.right, 40);

  const rows = COMPARISON_CRITERIA.map((criterion) => {
    const leftCell = bestCell(criterion, "left", leftTerms, rightTerms, input.evidence);
    let rightCell = bestCell(criterion, "right", leftTerms, rightTerms, input.evidence);
    if (rightCell === leftCell) rightCell = NOT_COVERED;
    return `| ${criterion} | ${leftCell} | ${rightCell} |`;
  });

  return [
    `| Criterion | ${headerLeft} | ${headerRight} |`,
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** True when a markdown table has the two identical data columns or meta rows. */
export function comparisonTableIssues(markdown: string): string[] {
  const issues: string[] = [];
  const lines = markdown.split(/\r?\n/);
  const tableLines = lines.filter((line) => /^\s*\|/.test(line));
  if (tableLines.length < 3) return ["No comparison table was written."];

  const rows = tableLines.map((line) =>
    line
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((cell) => cell.trim())
  );
  const dataRows = rows.filter((cells) => !cells.every((cell) => /^:?-{2,}:?$/.test(cell)));
  if (dataRows.length < 2) return ["The comparison table has no data rows."];

  let identicalColumns = 0;
  const notCovered = NOT_COVERED.toLowerCase();
  for (const row of dataRows) {
    if (row.length >= 3) {
      const left = row[1]?.toLowerCase() ?? "";
      const right = row[2]?.toLowerCase() ?? "";
      // Two explicit gaps are honest, not an identical invented column.
      if (left && right && left === right && left !== notCovered) identicalColumns += 1;
    }
  }
  if (identicalColumns > 0) {
    issues.push(`${identicalColumns} row${identicalColumns === 1 ? " has" : "s have"} identical columns.`);
  }

  const meta = /^(?:sources?|source count|credibility|number of sources|research quality)$/i;
  if (dataRows.some((row) => meta.test(row[0] ?? ""))) {
    issues.push("The table contains a meta row instead of a comparison criterion.");
  }
  return issues;
}

/**
 * Ensure the Findings section ends with a real table. Any model-written table
 * is removed first, because it may contain identical columns or meta rows.
 */
export function ensureComparisonTable(markdown: string, input: ComparisonInput): string {
  const findings = findSection(markdown, "Findings");
  const table = buildComparisonTable(input);
  const block = `### Head-to-head comparison\n\n${table}`;

  if (!findings) {
    return `${markdown.trimEnd()}\n\n## 3. Findings\n\n${block}\n`;
  }

  const bodyWithoutTable = findings.body
    .split(/\r?\n/)
    .filter((line) => !/^\s*\|/.test(line))
    .join("\n")
    .replace(/###\s+Head-to-head comparison\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  const replacement = `## ${findings.heading}\n\n${bodyWithoutTable}\n\n${block}\n`;
  return replaceSection(markdown, findings.heading, replacement);
}
