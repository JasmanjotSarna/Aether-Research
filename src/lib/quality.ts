/**
 * Deterministic, free citation/quality checks. Run before the optional LLM
 * critic so a report is always scored even when the critic call fails.
 *
 * The score deliberately penalises the failures this product has actually
 * shipped: copied/extractive prose, repeated sentences, off-topic sources and
 * missing a page target. It also says what it did not check, so a high score
 * is never mistaken for a guarantee of truth.
 */

import type { ReportQuality, Source } from "./contract";
import { contentPages, findDuplicateSentences } from "./research/synthesis";

export interface CitationCheck extends ReportQuality {
  invalidCitations: string[];
  uncitedParagraphs: number;
  missingSections: string[];
  /** Content pages (~450 words/page) actually delivered. */
  pagesDelivered: number;
  /** Near-duplicate sentence pairs across the paper. */
  repeatedSentences: number;
}

export interface CitationCheckOptions {
  /** Content pages the approved brief asked for. */
  pagesRequested?: number;
  /** Research topic, used to reject off-topic citations. */
  topic?: string;
}

/** The required paper structure, matched with or without a numeric prefix. */
const REQUIRED_SECTIONS = [
  "Abstract",
  "Introduction",
  "Methodology",
  "Findings",
  "Discussion",
  "Limitations",
  "Conclusion",
];

function extractCitationIds(markdown: string): string[] {
  const ids: string[] = [];
  const brackets = markdown.matchAll(/\[([^\]]+)\]/g);
  for (const match of brackets) {
    const raw = match[1] ?? "";
    if (!/\bS\d+\b/.test(raw)) continue;
    if (!/^[S\d,\s;]+$/.test(raw)) continue;
    for (const id of raw.matchAll(/S\d+/g)) ids.push(id[0]);
  }
  return ids;
}

function paragraphTexts(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        .filter((line) => !/^\s*#{1,6}\s/.test(line) && !/^\s*\|/.test(line) && !/^\s*```/.test(line))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((text) => text.length > 0);
}

function hasSection(markdown: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^#{2,3}\\s+(?:\\d+\\.\\s*)?${escaped}\\b`, "im").test(markdown);
}

function topicTerms(topic: string): string[] {
  return Array.from(
    new Set(
      topic
        .toLowerCase()
        .split(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff]+/i)
        .filter((term) => term.length > 2)
    )
  );
}

function offTopicCitedSources(
  markdown: string,
  sources: Source[],
  topic: string | undefined
): Source[] {
  if (!topic) return [];
  const terms = topicTerms(topic);
  if (terms.length === 0) return [];
  const cited = new Set(extractCitationIds(markdown));
  return sources.filter((source) => {
    if (!cited.has(source.id)) return false;
    const blob = `${source.title} ${source.snippet}`.toLowerCase();
    const matches = terms.filter((term) => blob.includes(term)).length;
    return matches / terms.length < 0.15;
  });
}

export function checkCitations(
  markdown: string,
  sources: Source[],
  options: CitationCheckOptions = {}
): CitationCheck {
  const totalSources = sources.length;
  const valid = new Set(sources.map((source) => source.id));
  const ids = extractCitationIds(markdown);
  const cited = new Set(ids.filter((id) => valid.has(id)));
  const invalid = Array.from(new Set(ids.filter((id) => !valid.has(id))));

  const paragraphs = paragraphTexts(markdown);
  const uncited = paragraphs.filter(
    (text) => text.length >= 180 && extractCitationIds(text).length === 0
  );
  const missingSections = REQUIRED_SECTIONS.filter((section) => !hasSection(markdown, section));

  const pagesDelivered = Math.round(contentPages(markdown) * 10) / 10;
  const duplicates = findDuplicateSentences(markdown);
  const repeatedSentences = duplicates.length;
  const offTopic = offTopicCitedSources(markdown, sources, options.topic);
  const ellipsisFragments = (markdown.match(/\[\s*(?:\.\.\.|…)\s*\]/g) ?? []).length;
  const extractiveMarkers = (
    markdown.match(
      /\b(?:additional evidence from this (?:follow-up|scoped) search|verbatim evidence|source digest|deterministic extractive)\b/gi
    ) ?? []
  ).length;

  const notes: string[] = [];
  if (totalSources === 0) {
    notes.push("No sources were available; this paper contains no supported factual claims.");
  } else {
    notes.push(`Cited ${cited.size} of ${totalSources} retrieved sources.`);
  }
  if (invalid.length) notes.push(`Invalid citation ids: ${invalid.slice(0, 5).join(", ")}.`);
  if (uncited.length) {
    notes.push(
      `${uncited.length} paragraph${uncited.length === 1 ? "" : "s"} without a citation${
        uncited[0] ? ` (e.g. “${uncited[0].slice(0, 90)}…”)` : ""
      }.`
    );
  }
  if (missingSections.length) {
    notes.push(
      `Missing expected section${missingSections.length === 1 ? "" : "s"}: ${missingSections.join(", ")}.`
    );
  }
  if (repeatedSentences > 0) {
    const example = duplicates[0];
    notes.push(
      `${repeatedSentences} repeated or near-duplicate sentence pair${
        repeatedSentences === 1 ? "" : "s"
      }${example ? ` (e.g. in ${example.heading} and ${example.similarTo})` : ""}.`
    );
  }
  if (ellipsisFragments > 0) {
    notes.push(`${ellipsisFragments} [...] fragment${ellipsisFragments === 1 ? "" : "s"} suggest extracted text rather than synthesis.`);
  }
  if (extractiveMarkers > 0) {
    notes.push("The text contains extractive/source-digest markers rather than written synthesis.");
  }
  if (offTopic.length > 0) {
    notes.push(
      `Off-topic cited source${offTopic.length === 1 ? "" : "s"}: ${offTopic
        .slice(0, 4)
        .map((source) => source.id)
        .join(", ")}.`
    );
  }
  if (options.pagesRequested) {
    const gap = options.pagesRequested - pagesDelivered;
    if (gap > 1) {
      notes.push(
        `Page target not met: about ${pagesDelivered} content pages against ${options.pagesRequested} requested.`
      );
    } else {
      notes.push(
        `Page target met: about ${pagesDelivered} content pages against ${options.pagesRequested} requested.`
      );
    }
  }
  if (totalSources > 0) {
    notes.push(
      "Not checked automatically: whether quoted numbers are accurate, whether undated sources are current, or whether the sources' own methods are sound."
    );
  }

  let score = 5;
  if (totalSources > 0) score += (cited.size / totalSources) * 3;
  if (invalid.length === 0) score += 1;
  if (uncited.length === 0) score += 0.5;
  if (missingSections.length === 0) score += 0.5;
  score -= invalid.length * 0.4;
  score -= uncited.length * 0.3;
  score -= Math.min(2, repeatedSentences * 0.35);
  score -= Math.min(1.5, ellipsisFragments * 0.5);
  if (extractiveMarkers > 0) score -= 1;
  score -= Math.min(1, offTopic.length * 0.3);
  if (options.pagesRequested) {
    const gap = options.pagesRequested - pagesDelivered;
    if (gap > 1) score -= Math.min(1.5, (gap / Math.max(1, options.pagesRequested)) * 2);
  }
  if (totalSources === 0) score = 0;
  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return {
    score,
    citedSources: cited.size,
    totalSources,
    notes: Array.from(new Set(notes)).slice(0, 12),
    invalidCitations: invalid,
    uncitedParagraphs: uncited.length,
    missingSections,
    pagesDelivered,
    repeatedSentences,
  };
}

export function mergeCritic(
  deterministic: CitationCheck,
  critic: { score?: number; notes?: string[] } | null
): ReportQuality {
  const notes = [...deterministic.notes];
  let score = deterministic.score;
  if (critic) {
    if (typeof critic.score === "number" && Number.isFinite(critic.score)) {
      score = Math.max(0, Math.min(10, Math.round(critic.score * 10) / 10));
    }
    for (const note of critic.notes ?? []) {
      if (typeof note === "string" && note.trim()) notes.push(note.trim().slice(0, 200));
    }
  }
  return {
    score,
    citedSources: deterministic.citedSources,
    totalSources: deterministic.totalSources,
    notes: Array.from(new Set(notes)).slice(0, 10),
  };
}

export function suggestFollowups(topic: string, subtopics: string[]): string[] {
  const first = subtopics[0] ?? topic;
  const second = subtopics[1] ?? topic;
  return [
    `What does the evidence say about ${first.toLowerCase()}?`,
    `Which findings in this paper are least certain, and why?`,
    `How do the sources compare on ${second.toLowerCase()}?`,
  ].map((question) => (question.length > 120 ? `${question.slice(0, 117)}…` : question));
}
