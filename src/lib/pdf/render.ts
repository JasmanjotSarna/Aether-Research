/**
 * Server-side PDF export with pdf-lib — pure JavaScript, no native binaries,
 * no headless browser.
 *
 * Output: A4, cover block, H1–H3, bullets, numbered lists, GFM tables,
 * clickable [S#] citations, a numbered reference list, and page numbers.
 */

import {
  PDFDocument,
  PDFName,
  PDFPage,
  PDFRef,
  PDFString,
  RGB,
  StandardFonts,
  rgb,
  type PDFFont,
} from "pdf-lib";
import type { CitationStyle, PdfRequest, Source } from "../contract";
import { checkCitations } from "../quality";
import { contentPages } from "../research/synthesis";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = MARGIN + 10;

const INK = rgb(0.11, 0.12, 0.14);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.82, 0.85, 0.89);
const LINK = rgb(0.04, 0.42, 0.86);
const TABLE_HEAD = rgb(0.94, 0.96, 0.98);
const ACCENT = rgb(0.09, 0.42, 0.86);
const CODE_HEAD = rgb(0.95, 0.95, 0.96);

interface FontSet {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
}

interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  link?: string;
  citation?: boolean;
}

type InlineStyle = Omit<InlineSegment, "text">;

interface InlineAtom extends InlineSegment {
  text: string;
}

interface RichOptions {
  x?: number;
  maxWidth?: number;
  size?: number;
  lineHeight?: number;
  color?: RGB;
  bold?: boolean;
  italic?: boolean;
}

function sanitizeForPdf(input: string): string {
  return input
    .replace(/\u2018|\u2019|\u201a|\u201b/g, "'")
    .replace(/\u201c|\u201d|\u201e|\u201f/g, '"')
    .replace(/\u2013|\u2014|\u2212/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00a0/g, " ")
    .replace(/\u2022/g, "-")
    .replace(/\u00b7/g, ".")
    .replace(/\u20ac/g, "EUR")
    .replace(/\u00a9/g, "(c)")
    .replace(/\u00ae/g, "(R)")
    .replace(/\u2122/g, "(TM)")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\u00a0-\u00ff]/g, "?");
}

function safeHttpUrl(raw: string | undefined): string | undefined {
  if (!raw || raw.length > 2048) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function citationStyleLabel(style: CitationStyle): string {
  if (style === "apa") return "APA 7";
  if (style === "ieee") return "IEEE";
  return "numbered";
}

/** First four-digit year in a published date string, or n.d. */
function sourceYear(publishedAt: string | undefined): string {
  const match = (publishedAt ?? "").match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? "n.d.";
}

function citationUrl(id: string, urls: Map<string, string>): string | undefined {
  return urls.get(id.replace(/^\[|\]$/g, ""));
}

/** Body text of a named H2 section, without the heading itself. */
function sectionBody(markdown: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^##\\s+(?:\\d+\\.\\s*)?${escaped}\\s*$`, "im");
  const match = regex.exec(markdown);
  if (!match) return "";
  const rest = markdown.slice(match.index + match[0].length);
  const next = rest.search(/^##\s+\S/m);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Queries named in the Methodology as double-quoted strings. */
function extractQueries(markdown: string): string[] {
  const body = sectionBody(markdown, "Methodology");
  if (!body) return [];
  const queries: string[] = [];
  for (const match of body.matchAll(/"([^"\n]{3,180})"/g)) {
    const query = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (query && !queries.includes(query)) queries.push(query);
  }
  return queries.slice(0, 12);
}

/** Provider-by-provider counts recorded in the Methodology by the agent. */
function extractProviderResults(markdown: string): string[] {
  const body = sectionBody(markdown, "Methodology");
  if (!body) return [];
  const match = body.match(/Provider results?:\s*([^\n]+)/i);
  if (!match?.[1]) return [];
  return match[1]
    .replace(/\.\s*$/, "")
    .split(/\s*;\s*/)
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function citedSourceIds(markdown: string, sources: Source[]): Set<string> {
  const valid = new Set(sources.map((source) => source.id));
  const cited = new Set<string>();
  for (const match of markdown.matchAll(/\[([^\]]+)\]/g)) {
    for (const id of (match[1] ?? "").matchAll(/S\d+/g)) {
      if (valid.has(id[0])) cited.add(id[0]);
    }
  }
  return cited;
}


const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[S\d+\]|\[[^\]]+\]\([^)]+\))/g;

function parseInline(
  text: string,
  urls: Map<string, string>,
  style: InlineStyle = {},
  depth = 0
): InlineSegment[] {
  if (!text) return [];
  if (depth > 2) return [{ ...style, text }];

  const segments: InlineSegment[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    const token = match[0];
    if (index > last) {
      const plain = text.slice(last, index);
      if (plain) segments.push({ ...style, text: plain });
    }
    last = index + token.length;

    if (token.startsWith("**") && token.endsWith("**")) {
      segments.push(...parseInline(token.slice(2, -2), urls, { ...style, bold: true }, depth + 1));
    } else if (token.startsWith("*") && token.endsWith("*") && token.length > 2) {
      segments.push(...parseInline(token.slice(1, -1), urls, { ...style, italic: true }, depth + 1));
    } else if (token.startsWith("`") && token.endsWith("`")) {
      segments.push({ ...style, text: token.slice(1, -1), mono: true });
    } else if (/^\[S\d+\]$/.test(token)) {
      const id = token.slice(1, -1);
      segments.push({
        ...style,
        text: token,
        citation: true,
        link: citationUrl(id, urls),
      });
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const label = linkMatch?.[1] ?? token;
      const target = safeHttpUrl(linkMatch?.[2]);
      segments.push({ ...style, text: label, ...(target ? { link: target } : {}) });
    }
  }

  if (last < text.length) {
    const tail = text.slice(last);
    if (tail) segments.push({ ...style, text: tail });
  }

  return segments;
}

function atomize(segments: InlineSegment[]): InlineAtom[] {
  const atoms: InlineAtom[] = [];
  for (const segment of segments) {
    const text = sanitizeForPdf(segment.text).replace(/\s+/g, " ");
    const parts = text.match(/\S+\s*|\s+/g) ?? [];
    for (const part of parts) atoms.push({ ...segment, text: part });
  }
  return atoms;
}

function wrapPlainText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const clean = sanitizeForPdf(text).replace(/\s+/g, " ").trim();
  if (!clean) return [""];
  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";

  const pushWord = (word: string) => {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      return;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      return;
    }
    let chunk = "";
    for (const character of word) {
      if (font.widthOfTextAtSize(chunk + character, size) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk += character;
      }
    }
    current = chunk;
  };

  for (const word of words) pushWord(word);
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function stripInlineMarkers(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

class ReportPdf {
  private readonly doc: PDFDocument;
  private readonly fonts: FontSet;
  private readonly urls = new Map<string, string>();
  private readonly links = new Map<PDFPage, PDFRef[]>();
  private readonly scale: number;
  private readonly citationStyle: CitationStyle;
  private page: PDFPage;
  private y = PAGE_HEIGHT - MARGIN;
  private sectionNumber = 0;
  /** Number of physical pages in the finished document. */
  pageCount = 0;

  private constructor(
    doc: PDFDocument,
    fonts: FontSet,
    firstPage: PDFPage,
    scale = 1,
    citationStyle: CitationStyle = "numbered"
  ) {
    this.doc = doc;
    this.fonts = fonts;
    this.page = firstPage;
    this.scale = scale;
    this.citationStyle = citationStyle;
  }

  /** Scale a base font size or spacing by the page-targeting factor. */
  private s(value: number): number {
    return value * this.scale;
  }

  static async create(request: PdfRequest, scale = 1): Promise<ReportPdf> {
    const doc = await PDFDocument.create();
    const fonts: FontSet = {
      regular: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
      italic: await doc.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
      mono: await doc.embedFont(StandardFonts.Courier),
    };
    const first = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const writer = new ReportPdf(doc, fonts, first, scale, request.citationStyle ?? "numbered");
    for (const source of request.sources) {
      const url = safeHttpUrl(source.url);
      if (url) writer.urls.set(source.id, url);
    }
    writer.cover(request);
    writer.addContentPage();
    return writer;
  }

  private fontFor(atom: InlineSegment): PDFFont {
    if (atom.mono) return this.fonts.mono;
    if (atom.bold && atom.italic) return this.fonts.boldItalic;
    if (atom.bold) return this.fonts.bold;
    if (atom.italic) return this.fonts.italic;
    return this.fonts.regular;
  }

  private addLink(x: number, y: number, width: number, height: number, url: string): void {
    const target = safeHttpUrl(url);
    if (!target) return;
    const annotation = this.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + Math.max(1, width), y + Math.max(1, height)],
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: PDFString.of(target),
      },
    });
    const ref = this.doc.context.register(annotation);
    const list = this.links.get(this.page);
    if (list) list.push(ref);
    else this.links.set(this.page, [ref]);
  }

  private ensure(needed: number): void {
    if (this.y - needed < BOTTOM) this.addContentPage();
  }

  private addContentPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - 58;
    this.page.drawText(sanitizeForPdf("Aether Research"), {
      x: MARGIN,
      y: PAGE_HEIGHT - 30,
      size: 8,
      font: this.fonts.regular,
      color: MUTED,
    });
    this.page.drawLine({
      start: { x: MARGIN, y: PAGE_HEIGHT - 38 },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 38 },
      thickness: 0.5,
      color: RULE,
    });
  }

  private nextLine(lineHeight: number): void {
    this.y -= lineHeight;
    if (this.y < BOTTOM) this.addContentPage();
  }

  private drawAtom(atom: InlineAtom, text: string, x: number, size: number, color: RGB): number {
    const clean = sanitizeForPdf(text);
    if (!clean) return 0;
    const font = this.fontFor(atom);
    const width = font.widthOfTextAtSize(clean, size);
    const drawColor = atom.citation || atom.link ? LINK : atom.mono ? rgb(0.25, 0.27, 0.3) : color;

    this.page.drawText(clean, {
      x,
      y: this.y,
      size,
      font,
      color: drawColor,
    });

    if (atom.link) this.addLink(x, this.y - 2, width, size + 4, atom.link);
    return width;
  }

  private drawRich(segments: InlineSegment[], options: RichOptions = {}): void {
    const atoms = atomize(segments);
    if (atoms.length === 0) return;

    const size = options.size ?? this.s(10.5);
    const lineHeight = options.lineHeight ?? size * 1.45;
    const baseX = options.x ?? MARGIN;
    const maxWidth = options.maxWidth ?? PAGE_WIDTH - MARGIN - baseX;
    const color = options.color ?? INK;
    const styled = atoms.map((atom) => ({
      ...atom,
      bold: atom.bold ?? options.bold,
      italic: atom.italic ?? options.italic,
    }));

    this.ensure(lineHeight);
    let x = baseX;

    for (const atom of styled) {
      let text = atom.text;
      if (x === baseX) text = text.replace(/^\s+/, "");
      if (!text) continue;

      const font = this.fontFor(atom);
      let width = font.widthOfTextAtSize(sanitizeForPdf(text), size);

      if (x + width > baseX + maxWidth && x > baseX) {
        this.nextLine(lineHeight);
        x = baseX;
        text = text.replace(/^\s+/, "");
        if (!text) continue;
        width = font.widthOfTextAtSize(sanitizeForPdf(text), size);
      }

      // Break an atom that cannot fit on a single line (e.g. a long URL).
      if (width > maxWidth) {
        let chunk = "";
        for (const character of text) {
          const candidate = chunk + character;
          if (font.widthOfTextAtSize(sanitizeForPdf(candidate), size) > maxWidth && chunk) {
            this.drawAtom(atom, chunk, x, size, color);
            this.nextLine(lineHeight);
            x = baseX;
            chunk = character;
          } else {
            chunk = candidate;
          }
        }
        if (chunk) x += this.drawAtom(atom, chunk, x, size, color);
        continue;
      }

      x += this.drawAtom(atom, text, x, size, color);
    }

    this.y -= lineHeight;
  }

  private heading(text: string, level: 1 | 2 | 3): void {
    let label = text;
    if (level === 2) {
      const clean = stripInlineMarkers(text).replace(/\s+/g, " ").trim();
      const fixed = /^(abstract|references\b.*|research log|appendix\b.*)$/i.test(clean);
      if (!fixed) {
        const numbered = clean.match(/^(\d+)[.)]\s*(.*)$/);
        if (numbered) {
          this.sectionNumber = Number(numbered[1]);
          label = `${numbered[1]}. ${numbered[2] ?? ""}`.trim();
        } else {
          this.sectionNumber += 1;
          label = `${this.sectionNumber}. ${clean}`;
        }
      }
    }

    const size = level === 1 ? this.s(22) : level === 2 ? this.s(15.5) : this.s(12.5);
    const before = level === 1 ? 2 : level === 2 ? this.s(14) : this.s(10);
    const after = level === 1 ? 8 : level === 2 ? this.s(6) : this.s(3);
    this.y -= before;
    this.ensure(size * 1.5);
    this.drawRich(parseInline(label, this.urls), {
      size,
      lineHeight: size * 1.3,
      bold: true,
      color: level === 1 ? INK : rgb(0.08, 0.32, 0.68),
    });
    this.y -= after;
  }

  private paragraph(text: string): void {
    this.drawRich(parseInline(text, this.urls), {
      size: this.s(10.5),
      lineHeight: this.s(15.5),
    });
    this.y -= this.s(4);
  }

  /** The Abstract gets a tinted box with an accent rule, like a journal. */
  private abstractBox(text: string): void {
    const innerWidth = CONTENT_WIDTH - 32;
    const bodySize = this.s(10);
    const bodyLine = this.s(14.5);
    const estimate = wrapPlainText(stripInlineMarkers(text), this.fonts.regular, bodySize, innerWidth);
    const height = Math.max(46, estimate.length * bodyLine + 24);
    if (this.y - height < BOTTOM) this.addContentPage();

    const top = this.y + 6;
    this.page.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: CONTENT_WIDTH,
      height,
      color: rgb(0.95, 0.97, 1),
      borderColor: rgb(0.82, 0.88, 0.98),
      borderWidth: 0.8,
    });
    this.page.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: 3,
      height,
      color: ACCENT,
    });

    this.y -= 8;
    this.drawRich(parseInline(text, this.urls), {
      x: MARGIN + 18,
      maxWidth: innerWidth,
      size: bodySize,
      lineHeight: bodyLine,
    });
    this.y = top - height - 10;
  }

  private bullet(text: string, marker = "-"): void {
    const size = this.s(10.5);
    this.ensure(size * 1.5);
    this.page.drawText(marker, {
      x: MARGIN,
      y: this.y,
      size,
      font: this.fonts.regular,
      color: MUTED,
    });
    this.drawRich(parseInline(text, this.urls), {
      x: MARGIN + 16,
      maxWidth: CONTENT_WIDTH - 16,
      size,
      lineHeight: this.s(15),
    });
    this.y -= 1.5;
  }

  private numbered(text: string, number: number): void {
    const size = this.s(10.5);
    this.ensure(size * 1.5);
    const label = `${number}.`;
    this.page.drawText(label, {
      x: MARGIN,
      y: this.y,
      size,
      font: this.fonts.regular,
      color: MUTED,
    });
    this.drawRich(parseInline(text, this.urls), {
      x: MARGIN + 20,
      maxWidth: CONTENT_WIDTH - 20,
      size,
      lineHeight: this.s(15),
    });
    this.y -= 1.5;
  }

  private quote(text: string): void {
    const size = this.s(10.5);
    this.ensure(size * 1.5);
    const top = this.y + 10;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 4,
      width: 3,
      height: 18,
      color: RULE,
    });
    this.drawRich(parseInline(text, this.urls), {
      x: MARGIN + 14,
      maxWidth: CONTENT_WIDTH - 14,
      size,
      lineHeight: this.s(15),
      color: MUTED,
      italic: true,
    });
    // A taller quote block gets a second tick so the bar still reads visually.
    if (top - this.y > 24) {
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y,
        width: 3,
        height: Math.min(30, top - this.y - 18),
        color: RULE,
      });
    }
    this.y -= 4;
  }

  private codeLine(text: string): void {
    const size = this.s(8.5);
    const lines = wrapPlainText(text.replace(/\t/g, "    "), this.fonts.mono, size, CONTENT_WIDTH - 16);
    for (const line of lines) {
      this.ensure(size * 1.4);
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - 3,
        width: CONTENT_WIDTH,
        height: size * 1.4,
        color: CODE_HEAD,
      });
      this.page.drawText(line, {
        x: MARGIN + 8,
        y: this.y,
        size,
        font: this.fonts.mono,
        color: rgb(0.2, 0.22, 0.26),
      });
      this.y -= size * 1.35;
    }
  }

  private rule(): void {
    this.ensure(10);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.5,
      color: RULE,
    });
    this.y -= 12;
  }

  private table(rows: string[][]): void {
    if (rows.length === 0) return;
    const columns = Math.max(...rows.map((row) => row.length));
    if (columns === 0) return;

    const normalized = rows.map((row) =>
      Array.from({ length: columns }, (_, index) => (row[index] ?? "").trim())
    );
    const header = normalized[0] ?? [];
    const body = normalized.slice(1);

    const weights = Array.from({ length: columns }, (_, index) => {
      const longest = Math.max(
        6,
        ...normalized.map((row) => stripInlineMarkers(row[index] ?? "").length)
      );
      return Math.min(46, longest);
    });
    const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
    let widths = weights.map((weight) => Math.max(56, (weight / totalWeight) * CONTENT_WIDTH));
    const scale = CONTENT_WIDTH / widths.reduce((sum, value) => sum + value, 0);
    widths = widths.map((width) => width * scale);

    const size = this.s(8.5);
    const lineHeight = this.s(10.5);
    const padding = 4;

    const cellLines = (row: string[], bold: boolean): string[][] =>
      row.map((cell, index) =>
        wrapPlainText(
          stripInlineMarkers(cell),
          bold ? this.fonts.bold : this.fonts.regular,
          size,
          Math.max(24, (widths[index] ?? 60) - padding * 2)
        )
      );

    const rowHeight = (lines: string[][]): number =>
      Math.max(20, Math.max(...lines.map((cell) => cell.length)) * lineHeight + padding * 2);

    const drawRow = (row: string[], bold: boolean, fill: boolean): void => {
      const lines = cellLines(row, bold);
      const height = rowHeight(lines);
      if (this.y - height < BOTTOM) {
        this.addContentPage();
        if (!bold) {
          drawRow(header, true, true);
        }
      }

      const top = this.y + 2;
      if (fill) {
        this.page.drawRectangle({
          x: MARGIN,
          y: top - height,
          width: CONTENT_WIDTH,
          height,
          color: TABLE_HEAD,
        });
      }

      let x = MARGIN;
      for (let column = 0; column < columns; column++) {
        const width = widths[column] ?? 60;
        const font = bold ? this.fonts.bold : this.fonts.regular;
        const cell = lines[column] ?? [""];
        let baseline = top - padding - size;
        for (const line of cell) {
          this.drawCellLine(line, x + padding, baseline, size, font, width - padding * 2);
          baseline -= lineHeight;
        }
        this.page.drawLine({
          start: { x, y: top },
          end: { x, y: top - height },
          thickness: 0.5,
          color: RULE,
        });
        x += width;
      }
      this.page.drawLine({
        start: { x: MARGIN, y: top },
        end: { x: MARGIN + CONTENT_WIDTH, y: top },
        thickness: 0.5,
        color: RULE,
      });
      this.page.drawLine({
        start: { x: MARGIN, y: top - height },
        end: { x: MARGIN + CONTENT_WIDTH, y: top - height },
        thickness: 0.5,
        color: RULE,
      });
      this.page.drawLine({
        start: { x: MARGIN + CONTENT_WIDTH, y: top },
        end: { x: MARGIN + CONTENT_WIDTH, y: top - height },
        thickness: 0.5,
        color: RULE,
      });

      this.y -= height;
    };

    this.ensure(this.s(60));
    drawRow(header, true, true);
    for (const row of body) drawRow(row, false, false);
    this.y -= this.s(10);
  }

  private drawCellLine(
    line: string,
    x: number,
    baseline: number,
    size: number,
    font: PDFFont,
    maxWidth: number
  ): void {
    const parts = line.split(/(\[S\d+\])/g).filter((part) => part.length > 0);
    let cursor = x;
    for (const part of parts) {
      const clean = sanitizeForPdf(part);
      const width = font.widthOfTextAtSize(clean, size);
      if (cursor + width > x + maxWidth) break;
      const isCitation = /^\[S\d+\]$/.test(part);
      this.page.drawText(clean, {
        x: cursor,
        y: baseline,
        size,
        font,
        color: isCitation ? LINK : INK,
      });
      if (isCitation) {
        const url = citationUrl(part, this.urls);
        if (url) this.addLink(cursor, baseline - 2, width, size + 3, url);
      }
      cursor += width;
    }
  }

  private cover(request: PdfRequest): void {
    const page = this.page;
    page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 12,
      width: PAGE_WIDTH,
      height: 12,
      color: ACCENT,
    });

    page.drawText("AETHER RESEARCH", {
      x: MARGIN,
      y: PAGE_HEIGHT - 108,
      size: 10,
      font: this.fonts.bold,
      color: ACCENT,
    });

    const title = clamp(stripInlineMarkers(request.title || "Research report"), 220);
    const titleLines = wrapPlainText(title, this.fonts.bold, 30, CONTENT_WIDTH);
    let titleY = PAGE_HEIGHT - 168;
    for (const line of titleLines) {
      page.drawText(line, {
        x: MARGIN,
        y: titleY,
        size: 30,
        font: this.fonts.bold,
        color: INK,
      });
      titleY -= 37;
    }

    page.drawLine({
      start: { x: MARGIN, y: titleY - 8 },
      end: { x: MARGIN + 96, y: titleY - 8 },
      thickness: 3,
      color: ACCENT,
    });

    page.drawText("Prepared by Aether", {
      x: MARGIN,
      y: titleY - 44,
      size: 13,
      font: this.fonts.regular,
      color: MUTED,
    });

    const metaY = titleY - 92;
    const date = new Date().toISOString().slice(0, 10);
    const meta = [
      `Generated: ${date}`,
      `Sources: ${request.sources.length}`,
      `Citations: ${citationStyleLabel(this.citationStyle)} (inline [S#])`,
      request.pages ? `Target length: about ${request.pages} A4 pages` : "",
    ].filter(Boolean);
    meta.forEach((line, index) => {
      page.drawText(line, {
        x: MARGIN,
        y: metaY - index * 18,
        size: 10,
        font: this.fonts.regular,
        color: MUTED,
      });
    });

    const note =
      "Citation markers such as [S1] are clickable. The numbered reference list at the end links to every source.";
    const noteLines = wrapPlainText(note, this.fonts.regular, 9, CONTENT_WIDTH);
    let noteY = MARGIN + 74;
    for (const line of noteLines.slice(0, 4)) {
      page.drawText(line, {
        x: MARGIN,
        y: noteY,
        size: 9,
        font: this.fonts.regular,
        color: MUTED,
      });
      noteY -= 12;
    }

    page.drawText("Generated with free-tier AI and open search indexes.", {
      x: MARGIN,
      y: MARGIN + 36,
      size: 8.5,
      font: this.fonts.italic,
      color: MUTED,
    });
  }

  private markdown(markdown: string): void {
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    let index = 0;
    let inCode = false;
    let paragraph: string[] = [];
    let abstractPending = false;

    const flush = () => {
      if (paragraph.length === 0) return;
      const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
      paragraph = [];
      if (!text) return;
      if (abstractPending) {
        abstractPending = false;
        this.abstractBox(text);
      } else {
        this.paragraph(text);
      }
    };

    while (index < lines.length) {
      const line = lines[index] ?? "";
      const trimmed = line.trim();

      if (trimmed.startsWith("```")) {
        flush();
        inCode = !inCode;
        index += 1;
        continue;
      }

      if (inCode) {
        this.codeLine(line);
        index += 1;
        continue;
      }

      if (!trimmed) {
        flush();
        index += 1;
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flush();
        const level = Math.min(3, Math.max(1, heading[1]?.length ?? 1)) as 1 | 2 | 3;
        const headingText = heading[2] ?? "";
        this.heading(headingText, level);
        abstractPending = level === 2 && /^abstract\b/i.test(stripInlineMarkers(headingText).trim());
        index += 1;
        continue;
      }

      if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
        flush();
        this.rule();
        index += 1;
        continue;
      }

      if (/^\s*\|.*\|\s*$/.test(line)) {
        flush();
        const rows: string[][] = [];
        while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index] ?? "")) {
          const row = (lines[index] ?? "")
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((cell) => cell.trim());
          const isSeparator = row.every((cell) => /^:?-{2,}:?$/.test(cell));
          if (!isSeparator) rows.push(row);
          index += 1;
        }
        this.table(rows);
        continue;
      }

      const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      if (bullet) {
        flush();
        this.bullet(bullet[1] ?? "");
        index += 1;
        continue;
      }

      const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (numbered) {
        flush();
        this.numbered(numbered[2] ?? "", Number(numbered[1] ?? "1"));
        index += 1;
        continue;
      }

      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        flush();
        this.quote(quote[1] ?? "");
        index += 1;
        continue;
      }

      paragraph.push(trimmed);
      index += 1;
    }

    flush();
  }

  private references(sources: Source[]): void {
    this.heading(
      this.citationStyle === "apa"
        ? "References (APA 7)"
        : this.citationStyle === "ieee"
          ? "References (IEEE)"
          : "References",
      2
    );
    if (sources.length === 0) {
      this.paragraph("No external sources were supplied for this report.");
      return;
    }

    const size = this.s(9.5);
    const lineHeight = this.s(12.5);
    const metaSize = this.s(8);
    const metaLine = this.s(10);

    for (const [index, source] of sources.entries()) {
      const url = safeHttpUrl(source.url);
      const title = clamp(stripInlineMarkers(source.title), 220);
      const year = sourceYear(source.publishedAt);
      const linkPart: InlineSegment[] = url
        ? [{ text: url, link: url, italic: true }]
        : [{ text: source.url, italic: true }];

      if (this.citationStyle === "apa") {
        // APA 7, falling back to title/domain where author metadata is absent.
        this.drawRich(
          [
            { text: title, bold: true },
            { text: `. (${year}). ` },
            { text: source.domain },
            { text: ` [${source.id}]`, citation: true, ...(url ? { link: url } : {}) },
          ],
          { size, lineHeight }
        );
      } else if (this.citationStyle === "ieee") {
        this.drawRich(
          [
            { text: `[${source.id}] `, citation: true, ...(url ? { link: url } : {}) },
            { text: title, bold: true },
            { text: `, ${source.domain}, ${year}. [Online]. Available:` },
          ],
          { size, lineHeight }
        );
      } else {
        this.drawRich(
          [
            { text: `${index + 1}. `, bold: true },
            { text: `[${source.id}] `, citation: true, ...(url ? { link: url } : {}) },
            { text: title, bold: true },
          ],
          { size, lineHeight }
        );
      }

      this.drawRich(linkPart, {
        x: MARGIN + 22,
        maxWidth: CONTENT_WIDTH - 22,
        size: this.s(8.2),
        lineHeight: this.s(10.5),
        color: LINK,
      });
      this.drawRich(
        [
          {
            text: `${source.domain} · ${source.kind} · credibility ${source.credibility.toFixed(2)}`,
          },
        ],
        {
          x: MARGIN + 22,
          maxWidth: CONTENT_WIDTH - 22,
          size: metaSize,
          lineHeight: metaLine,
          color: MUTED,
        }
      );
      this.y -= 5;
    }
  }

  /** Appendix: an auditable trail derived from the paper, not invented. */
  private researchLog(request: PdfRequest): void {
    this.heading("Research log", 2);
    this.paragraph(
      "Audit trail for this run, derived from the paper and its structured source list. It records what the search layer actually did."
    );

    this.heading("Search queries", 3);
    const queries = extractQueries(request.markdown);
    if (queries.length > 0) {
      queries.forEach((query, index) => this.numbered(query, index + 1));
    } else {
      this.paragraph(
        "The paper did not record its queries, so no query list is available for this export."
      );
    }

    this.heading("Provider results", 3);
    const providers = extractProviderResults(request.markdown);
    if (providers.length > 0) {
      // One provider per line; never let a model's inline list merge into one bullet.
      providers.forEach((entry) => this.bullet(entry));
    } else {
      this.paragraph(
        "The paper did not record provider-by-provider counts, so no provider breakdown is available for this export."
      );
    }

    this.heading("Sources read", 3);
    const cited = citedSourceIds(request.markdown, request.sources);
    if (request.sources.length === 0) {
      this.paragraph("No sources were retrieved for this run.");
    } else {
      this.paragraph(
        `${request.sources.length} source${
          request.sources.length === 1 ? "" : "s"
        } retrieved; ${cited.size} cited in the paper.`
      );
      for (const source of request.sources) {
        this.bullet(
          `[${source.id}] ${clamp(stripInlineMarkers(source.title), 120)} (${source.domain})${
            cited.has(source.id) ? "" : " — not cited"
          }`
        );
      }
    }

    this.heading("Quality score", 3);
    const quality = checkCitations(request.markdown, request.sources);
    this.paragraph(
      `${quality.score}/10 from the deterministic citation audit: ${quality.citedSources} of ${
        quality.totalSources
      } sources cited, ${quality.uncitedParagraphs} uncited paragraph${
        quality.uncitedParagraphs === 1 ? "" : "s"
      }, ${quality.invalidCitations.length} invalid citation id${
        quality.invalidCitations.length === 1 ? "" : "s"
      }. This scores structure and citation coverage, not the truth of the claims.`
    );
    if (quality.notes.length > 0) {
      for (const note of quality.notes.slice(0, 5)) this.bullet(note);
    }
  }

  private pageNumbers(): void {
    const pages = this.doc.getPages();
    const total = pages.length;
    pages.forEach((page, index) => {
      const label = `Page ${index + 1} of ${total}`;
      const width = this.fonts.regular.widthOfTextAtSize(label, 8);
      page.drawText(label, {
        x: (PAGE_WIDTH - width) / 2,
        y: 24,
        size: 8,
        font: this.fonts.regular,
        color: MUTED,
      });
    });
  }

  private attachLinks(): void {
    for (const [page, refs] of this.links) {
      page.node.set(PDFName.of("Annots"), this.doc.context.obj(refs));
    }
  }

  async build(request: PdfRequest): Promise<Uint8Array> {
    this.markdown(request.markdown);
    this.references(request.sources);
    this.researchLog(request);
    this.pageNumbers();
    this.attachLinks();
    this.pageCount = this.doc.getPages().length;

    this.doc.setTitle(clamp(request.title || "Research report", 200));
    this.doc.setAuthor("Aether Research");
    this.doc.setSubject("Source-grounded research report");
    this.doc.setCreator("Aether Research");
    this.doc.setProducer("pdf-lib");
    this.doc.setCreationDate(new Date());

    return this.doc.save();
  }
}

export interface RenderedPdf {
  bytes: Uint8Array;
  /** Physical pages in the exported document, including cover/references/log. */
  pages: number;
  /** Content pages of prose (~450 words/page), excluding extras. */
  contentPages: number;
  /** True when the physical page count is within ±1 of the requested target. */
  onTarget: boolean;
}

/**
 * Render at the real typography. The page count is whatever the content needs:
 * this renderer never shrinks or stretches type to pretend a short paper meets
 * a page target. `contentPages` is the honest measure of prose delivered.
 */
export async function renderReportPdfWithMeta(request: PdfRequest): Promise<RenderedPdf> {
  const writer = await ReportPdf.create(request, 1);
  const bytes = await writer.build(request);
  const content = Math.round(contentPages(request.markdown) * 10) / 10;
  const target = request.pages;
  return {
    bytes,
    pages: writer.pageCount,
    contentPages: content,
    onTarget: target === undefined ? true : Math.abs(writer.pageCount - target) <= 1,
  };
}

export async function renderReportPdf(request: PdfRequest): Promise<Uint8Array> {
  return (await renderReportPdfWithMeta(request)).bytes;
}

export function pdfFilename(title: string): string {
  const slug = sanitizeForPdf(title || "research-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "research-report"}.pdf`;
}
