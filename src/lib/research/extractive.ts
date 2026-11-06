/**
 * Zero-key writer. Produces an honest, cited paper from retrieved evidence
 * when no LLM is configured or every free provider is unavailable.
 * It never invents a fact or a source.
 */

import type { Mode } from "../contract";
import type { ResearchPlan } from "./plan";
import { comparisonEntities, titleFromTopic } from "./plan";
import type { Evidence } from "./evidence";
import type { ResearchSource } from "../search/types";

export interface ExtractiveRunStats {
  mode: Mode;
  queries: string[];
  readPages: number;
  providers: string[];
  tavily: boolean;
  academic: boolean;
  providerCounts?: Array<{
    provider: string;
    queries: number;
    hits: number;
    failures: number;
    reasons: string[];
  }>;
}

export interface ExtractiveInput {
  topic: string;
  plan: ResearchPlan;
  sources: ResearchSource[];
  evidence: Evidence[];
  /** Human-readable reason the AI writer was unavailable. */
  reason?: string;
  runStats?: ExtractiveRunStats;
}

function cite(sourceId: string): string {
  return `[${sourceId}]`;
}

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff]+/i)
    .filter((term) => term.length > 3);
}

function sentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

/** The indexes and search providers this run actually used. */
function indexLabel(stats?: ExtractiveRunStats): string {
  const parts = ["keyless Wikipedia"];
  if (stats?.academic) parts.push("arXiv", "OpenAlex");
  if (stats?.tavily) parts.push("Tavily");
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export function writeExtractiveReport(input: ExtractiveInput): { markdown: string; title: string } {
  const title = titleFromTopic(input.topic);
  const sources = input.sources;
  const evidence = input.evidence.filter((item) => item.text.trim().length > 0);
  const used = new Set<number>();

  if (sources.length === 0) {
    return {
      title,
      markdown: [
        `# ${title}`,
        "",
        "## Abstract",
        `No usable public sources were found for **${input.topic}**, so this paper makes no factual claims and offers no synthesis.`,
        "",
        "## 1. Introduction",
        `This paper was requested on the topic “${input.topic}”, but the retrieval step returned no usable evidence.`,
        "",
        "## 2. Methodology",
        `Searches were run against ${indexLabel(input.runStats)}. Queries returned no usable results, so no source could be selected or credibility-scored.`,
        "",
        "## 3. Findings",
        "No findings can be reported because no source was retrieved.",
        "",
        "## 4. Discussion",
        "There is nothing to discuss without evidence. An absence of search results is not evidence of absence.",
        "",
        "## 5. Limitations",
        "- The keyless search path returned no usable results for this query.",
        "- Paywalled, offline and non-indexed literature is not covered.",
        "- Add a free Tavily key for broader web coverage, or rephrase the topic with more specific terms.",
        "",
        "## 6. Conclusion & future directions",
        "No conclusion can be supported from the retrieved material. Future work should retry with more specific terms, a wider mode, or an additional search provider.",
        "",
      ].join("\n"),
    };
  }

  const takeEvidence = (matcher?: (text: string) => boolean, limit = 2): Evidence[] => {
    const chosen: Evidence[] = [];
    for (let i = 0; i < evidence.length && chosen.length < limit; i++) {
      if (used.has(i)) continue;
      const item = evidence[i];
      if (!item) continue;
      if (matcher && !matcher(item.text.toLowerCase())) continue;
      used.add(i);
      chosen.push(item);
    }
    return chosen;
  };

  const fallbackEvidence = (limit: number): Evidence[] => {
    const chosen = takeEvidence(undefined, limit);
    if (chosen.length > 0) return chosen;
    return sources.slice(0, limit).map((source) => ({
      sourceId: source.id,
      text: source.snippet || source.title,
    }));
  };

  const citeList = (items: Evidence[]): string =>
    items.map((item) => `${sentence(item.text)} ${cite(item.sourceId)}`).join(" ");

  const summary = fallbackEvidence(3);
  const summaryLines = citeList(summary);

  const findings: string[] = [];
  for (const subtopic of input.plan.subtopics) {
    const keywords = terms(subtopic);
    const matched = takeEvidence(
      (text) => keywords.some((keyword) => keyword.length > 3 && text.includes(keyword)),
      2
    );
    const chosen = matched.length > 0 ? matched : fallbackEvidence(1);
    findings.push(`### ${subtopic}`, "");
    if (chosen.length === 0) {
      findings.push(
        "The retrieved sources did not contain enough evidence to address this subtopic in depth.",
        ""
      );
    } else {
      findings.push(citeList(chosen), "");
    }
  }

  if (input.plan.comparison) {
    findings.push(...comparisonSection(input.topic, sources, evidence));
  }

  const discussion = fallbackEvidence(2);
  const conclusion = fallbackEvidence(1);
  const undated = sources.filter((source) => !source.publishedAt).length;
  const stats = input.runStats;
  const queryLine = stats?.queries.length
    ? `Search queries executed: ${stats.queries.map((query) => `"${query}"`).join(", ")}.`
    : "Search queries were planned from the topic and executed against keyless indexes.";
  const providerLine = stats?.providers.length
    ? `Language-model providers used: ${stats.providers.join(", ")}.`
    : "No language-model provider was available, so this paper uses a deterministic extractive writer.";
  const readLine =
    stats && stats.readPages > 0
      ? `${stats.readPages} full pages were read in addition to index snippets.`
      : "Index snippets and encyclopedia summaries were used; full-page reading was skipped in this mode.";
  const indexLine = `Indexes used: ${indexLabel(stats)}.`;
  const providerLineByIndex =
    stats?.providerCounts && stats.providerCounts.length > 0
      ? `Provider results: ${stats.providerCounts
          .map(
            (entry) =>
              `${entry.provider} ${entry.hits} hit${entry.hits === 1 ? "" : "s"}/${
                entry.failures
              } failure${entry.failures === 1 ? "" : "s"}${
                entry.reasons.length ? ` (${entry.reasons.join(", ")})` : ""
              }`
          )
          .join("; ")}.`
      : "";

  const limitations = [
    input.reason ? `- ${input.reason}` : "",
    `- This paper was assembled from ${sources.length} public source${sources.length === 1 ? "" : "s"} in a single retrieval pass. Paywalled, offline and non-indexed literature is not covered.`,
    "- Search engines and open indexes are incomplete; absence of evidence is not evidence of absence.",
    "- Credibility scores describe the publisher's structural reliability, not the truth of every claim.",
    undated > 0
      ? `- ${undated} of ${sources.length} sources had no machine-readable publication date, so recency could not be verified.`
      : "",
  ].filter(Boolean);

  const comparison = input.plan.comparison
    ? "The comparison table in Findings is limited to what the retrieved excerpts state; criteria not covered by a source are marked as such."
    : "The sources were too few and too heterogeneous for a formal comparison table.";

  const markdown = [
    `# ${title}`,
    "",
    "## Abstract",
    `This paper reviews ${sources.length} retrieved source${sources.length === 1 ? "" : "s"} on ${input.topic}. ${summaryLines} The evidence is assembled deterministically from public indexes, and the limitations section sets out what it cannot establish.`.trim(),
    "",
    "## 1. Introduction",
    `The question addressed here is what the publicly retrievable evidence says about ${input.topic}. The scope is limited to sources returned by ${indexLabel(stats)} searches. ${summaryLines}`.trim(),
    "",
    "## 2. Methodology",
    `${queryLine} ${indexLine} ${readLine} ${providerLineByIndex} Sources were deduplicated by normalised URL, ranked by topical relevance and publisher credibility, and capped at ${sources.length}. ${providerLine}`.trim(),
    "",
    "## 3. Findings",
    ...findings,
    "## 4. Discussion",
    discussion.length
      ? `${citeList(discussion)} ${comparison}`
      : `No cross-source discussion can be supported from the retrieved material. ${comparison}`,
    "",
    "## 5. Limitations",
    ...limitations,
    "",
    "## 6. Conclusion & future directions",
    conclusion[0]
      ? `${sentence(conclusion[0].text)} ${cite(conclusion[0].sourceId)} The evidence supports a cautious reading rather than a definitive verdict. Future work should add primary sources and a second independent retrieval pass.`
      : "No conclusion can be supported from the retrieved material. Future work should retry with more specific terms or wider coverage.",
    "",
  ].join("\n");

  return { title, markdown };
}

function comparisonSection(
  topic: string,
  sources: ResearchSource[],
  evidence: Evidence[]
): string[] {
  const entities = comparisonEntities(topic);
  if (!entities) return [];
  const [left, right] = entities;

  const matching = (entity: string): Evidence[] => {
    const needle = entity.toLowerCase();
    return evidence.filter((item) => item.text.toLowerCase().includes(needle)).slice(0, 2);
  };

  const cell = (items: Evidence[]): string =>
    items.length
      ? items.map((item) => `${sentence(item.text)} ${cite(item.sourceId)}`).join(" ")
      : "Not covered by the retrieved sources.";

  const sourceCount = (entity: string): number => {
    const needle = entity.toLowerCase();
    return sources.filter((source) =>
      `${source.title} ${source.snippet} ${source.content}`.toLowerCase().includes(needle)
    ).length;
  };

  const bestSource = (entity: string): ResearchSource | undefined => {
    const needle = entity.toLowerCase();
    return sources
      .filter((source) =>
        `${source.title} ${source.snippet} ${source.content}`.toLowerCase().includes(needle)
      )
      .sort((a, b) => b.credibility - a.credibility)[0];
  };

  const leftBest = bestSource(left);
  const rightBest = bestSource(right);

  return [
    "### Head-to-head comparison",
    "",
    `| Criterion | ${left} | ${right} |`,
    "| --- | --- | --- |",
    `| Evidence in retrieved sources | ${cell(matching(left))} | ${cell(matching(right))} |`,
    `| Retrieved source count | ${sourceCount(left)} | ${sourceCount(right)} |`,
    `| Highest source credibility | ${
      leftBest ? `${leftBest.credibility.toFixed(2)} ${cite(leftBest.id)}` : "No entity-specific source."
    } | ${rightBest ? `${rightBest.credibility.toFixed(2)} ${cite(rightBest.id)}` : "No entity-specific source."} |`,
    "",
  ];
}
