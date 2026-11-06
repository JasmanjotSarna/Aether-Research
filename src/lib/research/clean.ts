/** Post-process model output so the stored markdown matches the contract. */

import { sanitizeMarkdownLinks, stripLatex } from "../security/content";

const REFERENCE_HEADING = /^#{2,3}\s+(references|sources|bibliography|works\s+cited)\s*$/gim;

export function removeReferenceSections(markdown: string): string {
  let output = markdown;
  let guard = 0;

  while (guard < 4) {
    REFERENCE_HEADING.lastIndex = 0;
    const match = REFERENCE_HEADING.exec(output);
    if (!match) break;
    const start = match.index;
    const rest = output.slice(start + match[0].length);
    const nextHeading = rest.search(/^#{1,3}\s+\S/m);
    const end = nextHeading === -1 ? output.length : start + match[0].length + nextHeading;
    output = `${output.slice(0, start)}${output.slice(end)}`;
    guard += 1;
  }

  return output;
}

export function cleanReportMarkdown(markdown: string, fallbackTitle: string): string {
  let text = (markdown ?? "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();

  const fenced = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (fenced?.[1]) text = fenced[1].trim();

  text = sanitizeMarkdownLinks(text);
  text = stripLatex(text);
  text = removeReferenceSections(text);

  // Normalise [S1, S3] to [S1][S3].
  text = text.replace(/\[((?:S\d+\s*[,;]\s*)+S\d+)\]/g, (_, group: string) => {
    const ids = group.match(/S\d+/g) ?? [];
    return ids.map((id) => `[${id}]`).join("");
  });

  // A model occasionally merges a sentence and a stat: "Tavily.8 full pages".
  text = text.replace(
    /(\b[A-Za-z][A-Za-z0-9 -]{0,30})\.(\d+\s+(?:full\s+)?(?:pages?|sources?|queries?|hits?)\b)/g,
    "$1. $2"
  );
  // Keep provider results as one bullet per line so the PDF log cannot merge them.
  text = text.replace(/(^|\n)(\s*[-*+]\s*)?Provider results?:\s*/gi, "$1- Provider results: ");

  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();

  if (!/^#\s+\S/m.test(text)) {
    text = `# ${fallbackTitle}\n\n${text}`.trim();
  }
  if (!text) {
    text = `# ${fallbackTitle}\n\nNo report content was generated.`;
  }

  return `${text}\n`;
}

export function reportTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  const title = match?.[1]?.replace(/\s+/g, " ").trim();
  return (title || fallback).slice(0, 200);
}
