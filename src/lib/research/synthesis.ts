/**
 * Deterministic repetition checks used before and after the writer runs.
 *
 * A paper that repeats the same sentence in the Abstract, Introduction and
 * Conclusion is not synthesis. This module finds near-duplicate sentences and
 * near-duplicate sections so the orchestrator can regenerate the weakest one.
 */

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by",
  "is", "are", "was", "were", "be", "been", "as", "at", "from", "that", "this",
  "it", "its", "their", "these", "those", "we", "our", "can", "may", "has", "have",
  "had", "not", "but", "which", "while", "than", "also", "more", "most", "such",
]);

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘(])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40);
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/\[s\d+\]/g, " ")
      .split(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff]+/i)
      .filter((token) => token.length > 2 && !STOP.has(token))
  );
}

/** Jaccard similarity of content words, 0..1. */
export function sentenceSimilarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export interface SectionText {
  heading: string;
  body: string;
}

/** Split a paper into H2 sections (body only, headings removed). */
export function paperSections(markdown: string): SectionText[] {
  const sections: SectionText[] = [];
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let heading = "";
  let buffer: string[] = [];

  const flush = () => {
    if (heading) sections.push({ heading, body: buffer.join("\n").trim() });
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match?.[1]) {
      flush();
      heading = match[1];
    } else if (heading) {
      buffer.push(line);
    }
  }
  flush();
  return sections.filter((section) => section.body.length > 0);
}

export interface DuplicatePair {
  heading: string;
  sentence: string;
  similarTo: string;
  similarity: number;
}

/**
 * Every pair of near-identical sentences inside one section or across
 * sections. Comparison-table rows are skipped.
 */
export function findDuplicateSentences(
  markdown: string,
  threshold = 0.82
): DuplicatePair[] {
  const entries: Array<{ heading: string; sentence: string }> = [];
  for (const section of paperSections(markdown)) {
    const body = section.body
      .split("\n")
      .filter((line) => !/^\s*\|/.test(line))
      .join(" ");
    for (const sentence of splitSentences(body)) {
      entries.push({ heading: section.heading, sentence });
    }
  }

  const duplicates: DuplicatePair[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const left = entries[i];
    if (!left) continue;
    for (let j = i + 1; j < entries.length; j += 1) {
      const right = entries[j];
      if (!right) continue;
      if (left.sentence === right.sentence) {
        duplicates.push({
          heading: left.heading,
          sentence: left.sentence,
          similarTo: right.heading,
          similarity: 1,
        });
        continue;
      }
      const similarity = sentenceSimilarity(left.sentence, right.sentence);
      if (similarity >= threshold) {
        duplicates.push({
          heading: left.heading,
          sentence: left.sentence,
          similarTo: right.heading,
          similarity,
        });
      }
    }
  }
  return duplicates;
}

/** Section headings that contain at least one repeated sentence. */
export function repetitiveSections(markdown: string, threshold = 0.82): string[] {
  const headings = new Set<string>();
  for (const pair of findDuplicateSentences(markdown, threshold)) {
    headings.add(pair.heading);
    headings.add(pair.similarTo);
  }
  return Array.from(headings);
}

/** Word count that ignores markdown syntax and citations. */
export function proseWords(markdown: string): number {
  return (
    markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\[S\d+\]/g, " ")
      .replace(/[#>*_`|-]/g, " ")
      .match(/\S+/g) ?? []
  ).length;
}

/** Content pages using the contract's 450 words per A4 page. */
export function contentPages(markdown: string): number {
  return Math.max(0, proseWords(markdown) / 450);
}
