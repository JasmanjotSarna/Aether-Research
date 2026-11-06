/**
 * Fallback output when no language model can write.
 *
 * This is deliberately NOT a paper. It is a labelled source digest: what was
 * found, one line per source, and the exact reason synthesis did not happen.
 * It never imitates the required paper structure and never carries a `report`
 * event, so the UI cannot mistake it for a researched deliverable.
 */

import type { ResearchSource } from "../search/types";

export interface DigestInput {
  topic: string;
  sources: ResearchSource[];
  /** Why the AI writer was unavailable, in human terms. */
  reason: string;
  /** Provider/model validation notes, if any. */
  modelNotes?: string[];
  /** True when no key is configured at all. */
  zeroKey?: boolean;
}

function oneLine(text: string, max = 220): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

export function buildFailureGuidance(input: {
  reason: string;
  zeroKey?: boolean;
  modelNotes?: string[];
  retryAfterSeconds?: number;
}): string {
  const wait =
    input.retryAfterSeconds !== undefined
      ? `The provider asked for a ${input.retryAfterSeconds}-second wait; try again after that.`
      : "Try again in a minute, or add your own free Groq or OpenRouter key in Settings.";

  const instructions = [
    "What you can do:",
    input.zeroKey
      ? "- Add a free Groq or OpenRouter key in Settings to get synthesised, cited prose."
      : `- ${wait}`,
    "- Keep the sources below: they are real pages the search and read steps retrieved.",
    "- Ask for a shorter paper, or narrow the topic, to fit the free-tier output limit.",
    "- Try again later; no paper was invented in the meantime.",
  ];

  const notes = (input.modelNotes ?? []).slice(0, 4);
  return [
    input.reason,
    "",
    ...instructions,
    ...(notes.length ? ["", "Provider check:", ...notes.map((note) => `- ${note}`)] : []),
  ].join("\n");
}

export function buildSourceDigest(input: DigestInput): string {
  const lines = [
    `# Source digest: ${input.topic}`,
    "",
    "**This is not a research paper.** No language model produced synthesised prose, so this page lists the retrieved sources and one-line summaries only. It makes no argument and draws no conclusion.",
    "",
    `**Why there is no paper:** ${input.reason}`,
    "",
  ];

  if (input.sources.length === 0) {
    lines.push("No usable sources were retrieved either, so there is nothing to digest.");
    return lines.join("\n");
  }

  lines.push(`## Retrieved sources (${input.sources.length})`, "");
  for (const source of input.sources) {
    const summary = oneLine(source.snippet || source.content || source.title);
    lines.push(
      `- **[${source.id}] ${oneLine(source.title, 180)}** — ${oneLine(source.url, 300)}`,
      `  ${summary}`
    );
  }

  lines.push(
    "",
    "## What this digest is not",
    "",
    "- It is not a paper, an analysis, or a synthesis across sources.",
    "- It does not add facts beyond each source's own summary.",
    "- Citations are source ids for traceability, not a bibliography of a finished paper.",
    ""
  );

  return lines.join("\n");
}
