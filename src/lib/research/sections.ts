/**
 * Markdown section utilities for targeted report edits.
 *
 * The important guarantee: when one H2 section is replaced, every other byte
 * of the report is preserved exactly. The editor never re-serialises the whole
 * document, so untouched sections cannot drift.
 */

export interface MarkdownSection {
  /** Heading text without the leading hashes, e.g. "3. Findings". */
  heading: string;
  level: number;
  /** Index of the first character of the heading line. */
  start: number;
  /** Index just past the section (before the next heading of the same or higher level). */
  end: number;
  /** Exact original slice, including trailing blank lines. */
  markdown: string;
  /** Section body without the heading line. */
  body: string;
}

interface HeadingMatch {
  level: number;
  text: string;
  lineStart: number;
  lineEnd: number;
}

function parseHeadings(markdown: string): HeadingMatch[] {
  const matches: HeadingMatch[] = [];
  const pattern = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;
  let found: RegExpExecArray | null;
  while ((found = pattern.exec(markdown)) !== null) {
    const level = found[1]?.length ?? 1;
    const text = (found[2] ?? "").trim();
    const lineStart = found.index;
    const lineEnd = lineStart + found[0].length;
    matches.push({ level, text, lineStart, lineEnd });
  }
  return matches;
}

/** All H1 and H2 sections with exact slices. */
export function parseSections(markdown: string): MarkdownSection[] {
  const headings = parseHeadings(markdown);
  if (headings.length === 0) return [];

  const sections: MarkdownSection[] = [];
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    if (!heading || heading.level > 2) continue;
    let end = markdown.length;
    for (let next = index + 1; next < headings.length; next++) {
      const candidate = headings[next];
      if (candidate && candidate.level <= Math.max(2, heading.level)) {
        end = candidate.lineStart;
        break;
      }
    }
    const slice = markdown.slice(heading.lineStart, end);
    const headingLine = markdown.slice(heading.lineStart, heading.lineEnd);
    const body = slice.slice(headingLine.length).replace(/^\s*\n/, "");
    sections.push({
      heading: heading.text,
      level: heading.level,
      start: heading.lineStart,
      end,
      markdown: slice,
      body,
    });
  }
  return sections;
}

/** Lowercase, drop numbering and punctuation, so "3. Findings" == "findings". */
export function normalizeHeading(text: string): string {
  return text
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\s*\d+(?:\.\d+)*[.)]?\s*/, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findSection(markdown: string, heading: string): MarkdownSection | undefined {
  const wanted = normalizeHeading(heading);
  if (!wanted) return undefined;
  const sections = parseSections(markdown);
  return (
    sections.find((section) => normalizeHeading(section.heading) === wanted) ??
    sections.find((section) => normalizeHeading(section.heading).includes(wanted)) ??
    sections.find((section) => wanted.includes(normalizeHeading(section.heading)))
  );
}

export function sectionHeadings(markdown: string): string[] {
  return parseSections(markdown).map((section) => section.heading);
}

/** The heading line exactly as it appears in the document. */
function headingLine(section: MarkdownSection, markdown: string): string {
  return markdown.slice(section.start, section.end).split("\n")[0] ?? `## ${section.heading}`;
}

function normalizeReplacement(replacement: string, original: MarkdownSection, markdown: string): string {
  let body = (replacement ?? "").replace(/\r\n?/g, "\n").trim();
  if (!body) return "";
  const first = body.split("\n")[0] ?? "";
  const level = original.level;
  const prefix = "#".repeat(level);

  if (/^#{1,6}\s+/.test(first)) {
    // Keep the original heading text and level so numbering never changes.
    const line = headingLine(original, markdown);
    const rest = body.split("\n").slice(1).join("\n");
    body = `${line}\n${rest ? `\n${rest}` : ""}`.trimEnd();
  } else {
    body = `${headingLine(original, markdown)}\n\n${body}`.trimEnd();
  }

  // Preserve the original trailing whitespace so adjacent sections stay byte-identical.
  const trailing = original.markdown.match(/\n[\s]*$/)?.[0] ?? "\n";
  return `${body}${trailing}`;
}

/** Replace one section, preserving every other byte of the document. */
export function replaceSection(markdown: string, heading: string, replacement: string): string {
  const section = findSection(markdown, heading);
  if (!section) return markdown;
  const next = normalizeReplacement(replacement, section, markdown);
  if (!next) return markdown;
  return `${markdown.slice(0, section.start)}${next}${markdown.slice(section.end)}`;
}

/** Remove one section and its trailing whitespace. */
export function removeSection(markdown: string, heading: string): string {
  const section = findSection(markdown, heading);
  if (!section) return markdown;
  return `${markdown.slice(0, section.start)}${markdown.slice(section.end)}`;
}

/**
 * Insert a new section before `beforeHeading` (defaults to the conclusion) or
 * at the end. Existing sections are untouched byte for byte.
 */
export function insertSection(
  markdown: string,
  heading: string,
  content: string,
  beforeHeading?: string
): string {
  const block = ensureHeading(content, heading).trimEnd();
  const anchor = beforeHeading ? findSection(markdown, beforeHeading) : findSection(markdown, "Conclusion");
  if (!anchor) {
    return `${markdown.replace(/\s*$/, "")}\n\n${block}\n`;
  }
  return `${markdown.slice(0, anchor.start)}${block}\n\n${markdown.slice(anchor.start)}`;
}

function ensureHeading(content: string, heading: string): string {
  const clean = (content ?? "").replace(/\r\n?/g, "\n").trim();
  if (/^#{1,6}\s+\S/.test(clean)) return clean;
  return `## ${heading}\n\n${clean}`;
}

/** Headings whose content differs between two documents. */
export function changedSections(before: string, after: string): string[] {
  const oldSections = new Map(
    parseSections(before).map((section) => [normalizeHeading(section.heading), section])
  );
  const result: string[] = [];
  for (const section of parseSections(after)) {
    const previous = oldSections.get(normalizeHeading(section.heading));
    if (!previous || previous.markdown !== section.markdown) result.push(section.heading);
  }
  for (const section of parseSections(before)) {
    if (!parseSections(after).some((entry) => normalizeHeading(entry.heading) === normalizeHeading(section.heading))) {
      result.push(section.heading);
    }
  }
  return Array.from(new Set(result));
}

export type EditTargetMode = "replace" | "add" | "remove" | "global";

export interface EditTarget {
  mode: EditTargetMode;
  headings: string[];
  /** For add mode: the new section heading. */
  newHeading?: string;
}

const GLOBAL_CUES =
  /\b(?:whole|entire|every|all)\s+(?:report|paper|sections?)\b|\b(?:shorten|lengthen|expand|condense|tighten)\s+(?:it|the\s+(?:report|paper))|\bmake\s+(?:it|the\s+(?:report|paper))\s+(?:shorter|longer|more|less|clearer|formal|casual|technical|simple)|\b(?:rewrite|restructure|reformat)\b|\b(?:citation\s+style|apa|ieee)\b|\b(?:add|insert|remove|delete)\s+(?:a\s+)?(?:comparison\s+)?table\b|\btone\b/i;

const SECTION_ALIASES: Array<[RegExp, string]> = [
  [/\babstract\b/i, "Abstract"],
  [/\b(?:introduction|intro)\b/i, "Introduction"],
  [/\bmethod(?:ology)?\b/i, "Methodology"],
  [/\b(?:findings?|results?)\b/i, "Findings"],
  [/\bdiscussion\b/i, "Discussion"],
  [/\b(?:limitations?|caveats?)\b/i, "Limitations"],
  [/\b(?:conclusion|future\s+directions?)\b/i, "Conclusion"],
];

const ADD_SECTION =
  /\b(?:add|insert|include)\s+(?:a\s+|an\s+|one\s+)?(?:new\s+)?section\s+(?:on|about|called|titled)\s+([^.;\n]{3,120})/i;

const REMOVE_SECTION =
  /\b(?:remove|delete|drop|cut)\s+(?:the\s+)?(?:section\s+)?(?:(?:number\s+)?(\d{1,2})|(?:on|about|titled|called)\s+["“]?([^"”.,\n]{3,100})["”]?|["“]([^"”]{3,100})["”])/i;

function numberedSection(markdown: string, number: number): string | undefined {
  const sections = parseSections(markdown).filter((section) => section.level === 2);
  // Prefer the numeric prefix ("## 3. Findings") but fall back to H2 order.
  const explicit = sections.find((section) => {
    const match = section.heading.match(/^\s*(\d{1,2})[.)]?\s+/);
    return Number(match?.[1]) === number;
  });
  if (explicit) return explicit.heading;
  const index = number - 1;
  return sections[index]?.heading;
}

function matchAliases(text: string, markdown: string): string[] {
  const headings = parseSections(markdown)
    .filter((section) => section.level === 2)
    .map((section) => section.heading);
  const matched: string[] = [];
  for (const [pattern, alias] of SECTION_ALIASES) {
    if (!pattern.test(text)) continue;
    const actual =
      headings.find((heading) => normalizeHeading(heading).includes(normalizeHeading(alias))) ??
      alias;
    if (!matched.includes(actual)) matched.push(actual);
  }
  return matched;
}

/**
 * Work out what a plain-chat edit is asking for. Section-level edits touch only
 * those sections; everything else is treated as a whole-report edit.
 */
export function resolveEditTarget(instruction: string, markdown: string): EditTarget {
  const text = instruction.trim();

  const add = text.match(ADD_SECTION);
  if (add?.[1]) {
    return { mode: "add", headings: [], newHeading: `Findings: ${add[1].trim()}` };
  }

  const remove = text.match(REMOVE_SECTION);
  if (remove) {
    const raw = remove[1] ?? remove[2] ?? remove[3];
    if (raw) {
      const number = Number(raw);
      const heading = Number.isFinite(number)
        ? numberedSection(markdown, number)
        : matchAliases(raw, markdown)[0] ?? raw;
      if (heading && findSection(markdown, heading)) {
        return { mode: "remove", headings: [findSection(markdown, heading)?.heading ?? heading] };
      }
    }
  }

  // "Remove the limitations section" names the heading but not the word
  // "section" immediately after the verb, so match it via the aliases.
  if (/\b(?:remove|delete|drop|cut)\b/i.test(text)) {
    const aliases = matchAliases(text, markdown);
    if (aliases.length > 0) return { mode: "remove", headings: aliases };
  }

  // Explicit numbers only count when the instruction is about a section.
  const numberMatch = text.match(/\bsection\s+(?:number\s+)?(\d{1,2})\b/i);
  if (numberMatch?.[1] && !GLOBAL_CUES.test(text)) {
    const heading = numberedSection(markdown, Number(numberMatch[1]));
    if (heading) return { mode: "replace", headings: [heading] };
  }

  const aliases = matchAliases(text, markdown);
  if (aliases.length > 0 && !GLOBAL_CUES.test(text)) {
    return { mode: "replace", headings: aliases };
  }

  // "Rewrite the findings section more formally" can mention a global cue but
  // still name one section; prefer the section when exactly one is named.
  if (aliases.length === 1) {
    return { mode: "replace", headings: aliases };
  }

  return { mode: "global", headings: [] };
}
