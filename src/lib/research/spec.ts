/**
 * Scoping, defaults and proposal editing.
 *
 * Everything here is deterministic and free. It extracts what the user has
 * already said (length, audience, focus, format), asks only for what is still
 * missing, converts pages into a word budget, and applies plain-language edits
 * to a proposal without starting a research run.
 */

import type {
  AgentMessage,
  CitationStyle,
  ClarifyAnswer,
  ClarifyQuestion,
  Mode,
  ResearchSpec,
} from "../contract";
import { extractTopic, titleFromTopic } from "./plan";

/** 450 words per A4 page including headings, as stated in the contract. */
export const WORDS_PER_PAGE = 450;

export const DEFAULT_PAGES: Record<Mode, number> = {
  quick: 2,
  standard: 4,
  deep: 7,
};

export const MIN_PAGES = 1;
/** Hard contract ceiling, high enough for the 100-page outline option. */
export const MAX_PAGES = 100;
/**
 * Pages one free-tier run can write well. Requesting more is answered with an
 * honest feasibility choice instead of silently shrinking the target.
 */
export const FREE_TIER_MAX_PAGES = 18;

/** The fixed paper structure. `outline` only carries page estimates. */
export const SPEC_HEADINGS = [
  "Abstract & Introduction",
  "Methodology",
  "Findings",
  "Discussion",
  "Limitations",
  "Conclusion & future directions",
] as const;

const SECTION_WEIGHTS = [0.16, 0.12, 0.37, 0.17, 0.08, 0.1];

export const CITATION_STYLES: CitationStyle[] = ["numbered", "apa", "ieee"];

export interface PromptInference {
  pages?: number;
  audience?: string;
  purpose?: string;
  tone?: string;
  citationStyle?: CitationStyle;
  language?: string;
  focus?: string;
  mustInclude: string[];
  exclude: string[];
  timeRange?: string;
  /** True when the wording suggests a deep run. */
  deep?: boolean;
  /** True when the wording suggests a quick run. */
  quick?: boolean;
}

function clampPages(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PAGES.standard;
  return Math.max(MIN_PAGES, Math.min(MAX_PAGES, Math.round(value)));
}

function cleanPhrase(value: string, max = 160): string {
  return value.replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim().slice(0, max);
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/**
 * The number the user actually asked for, before any affordability clamp.
 * Handles 1–4 digit numbers, ranges ("80–100 pages") and word numbers
 * ("one hundred pages"). Returning the raw number is what lets the router be
 * honest instead of silently shrinking a 100-page request to 18.
 */
export function requestedPageCount(text: string): number | undefined {
  const range = text.match(
    /(\d{1,4})\s*(?:-|\u2013|\u2014|to)\s*(\d{1,4})\s*(?:a4\s*)?(?:pages?|pgs?)\b/i
  );
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    if (Number.isFinite(low) && Number.isFinite(high) && high >= low) {
      return Math.round((low + high) / 2);
    }
  }

  const single = text.match(/(\d{1,4})\s*(?:a4\s*)?[\s-]*(?:pages?|pgs?)\b/i);
  if (single) {
    const value = Number(single[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }

  const word = text.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]*(?:page|pages|pgs?)\b/i
  );
  if (word) {
    const value = NUMBER_WORDS[word[1]?.toLowerCase() ?? ""];
    if (value) return value;
  }

  const hundred = text.match(/\b(?:a|one|1)\s+hundred[\s-]*(?:page|pages|pgs?)\b/i);
  if (hundred) return 100;
  const hundreds = text.match(
    /\b(two|three|four|five|six|seven|eight|nine)[\s-]+hundred[\s-]*(?:page|pages|pgs?)\b/i
  );
  if (hundreds) {
    const value = NUMBER_WORDS[hundreds[1]?.toLowerCase() ?? ""];
    if (value) return value * 100;
  }

  return undefined;
}

function parsePages(text: string): number | undefined {
  const requested = requestedPageCount(text);
  if (requested !== undefined) return clampPages(requested);

  if (/\b(?:one|single)[\s-]*page\b/i.test(text)) return 1;
  if (/\b(?:short|brief|concise|executive\s+summary|one[\s-]?pager)\b/i.test(text)) return 2;
  if (/\b(?:in[\s-]?depth|comprehensive|detailed|extensive|long[\s-]?form)\b/i.test(text)) {
    return DEFAULT_PAGES.deep;
  }
  return undefined;
}

/** Exact option labels offered when a page request exceeds the free tier. */
export const PAGE_FEASIBILITY_OPTIONS = [
  "~15 pages comprehensive",
  "Full 100-page outline now, then write it volume by volume",
  "A 4-page executive version",
  "Decide for me",
] as const;

export type PageChoice = "comprehensive" | "outline" | "executive";

export interface PageFeasibility {
  requested: number;
  maxFree: number;
  notice: string;
  question: ClarifyQuestion;
}

/** True when the asked-for length is beyond what one free-tier run writes well. */
export function pageFeasibility(text: string): PageFeasibility | null {
  const requested = requestedPageCount(text);
  if (requested === undefined || requested <= FREE_TIER_MAX_PAGES) return null;
  return {
    requested,
    maxFree: FREE_TIER_MAX_PAGES,
    notice: `You asked for ${requested} pages. One free-tier run can write about ${FREE_TIER_MAX_PAGES} pages well, so I will not silently replace your number. Choose how you want to proceed.`,
    question: {
      id: "feasibility",
      question: `How should I handle the ${requested}-page request?`,
      options: [...PAGE_FEASIBILITY_OPTIONS],
    },
  };
}

/** Recognise the choice offered by a feasibility clarify card. */
export function pageChoice(text: string): PageChoice | undefined {
  if (/\b(?:outline|volumes?|volume\s+by\s+volume)\b/i.test(text)) return "outline";
  if (/\b(?:executive|4[\s-]*pages?|four[\s-]*pages?)\b/i.test(text)) return "executive";
  if (
    /\b(?:~\s*)?15[\s-]*pages?\b/i.test(text) ||
    /\bfifteen[\s-]*pages?\b/i.test(text) ||
    /\bcomprehensive\b/i.test(text)
  ) {
    return "comprehensive";
  }
  if (/\b(?:decide\s+for\s+me|you\s+decide)\b/i.test(text)) return "comprehensive";
  return undefined;
}

/** Turn an oversized request into the concrete target the user chose. */
export function applyPageChoice(spec: ResearchSpec, choice: PageChoice): ResearchSpec {
  let pages = spec.pages;
  let mode = spec.mode;
  let audience = spec.audience;
  let purpose = spec.purpose;

  if (choice === "outline") {
    pages = MAX_PAGES;
    mode = "deep";
  } else if (choice === "executive") {
    pages = 4;
    mode = "quick";
    audience = "executives";
    purpose = "decision briefing";
  } else {
    pages = Math.min(FREE_TIER_MAX_PAGES, 15);
    mode = "deep";
  }

  return {
    ...spec,
    pages,
    mode,
    audience,
    purpose,
    outline: outlineForPages(pages, spec.mustInclude ?? []),
  };
}

function parseAudience(text: string): string | undefined {
  const patterns: Array<[RegExp, string]> = [
    [/\b(?:for|to)\s+(?:complete\s+)?beginners?\b/i, "beginners"],
    [/\bbeginner[\s-]?friendly\b/i, "beginners"],
    [/\b(?:for|to)\s+(?:university\s+|college\s+|high[\s-]school\s+)?students?\b/i, "students"],
    [/\b(?:for|to)\s+(?:a\s+)?(?:academic|scholarly)\s+audience\b/i, "academic readers"],
    [/\bacademic\s+(?:submission|paper|essay|report)\b/i, "academic readers"],
    [/\b(?:for|to)\s+(?:busy\s+)?executives?\b/i, "executives"],
    [/\b(?:for|to)\s+(?:senior\s+)?(?:managers?|decision[\s-]?makers?)\b/i, "decision-makers"],
    [/\b(?:for|to)\s+(?:working\s+)?professionals?\b/i, "professionals"],
    [/\b(?:for|to)\s+(?:technical\s+)?experts?\b/i, "technical experts"],
    [/\b(?:for|to)\s+(?:software\s+)?(?:developers?|engineers?)\b/i, "engineers"],
    [/\b(?:for|to)\s+(?:policy[\s-]?makers?|regulators?)\b/i, "policy-makers"],
    [/\b(?:for|to)\s+(?:investors?|analysts?)\b/i, "investors"],
    [/\b(?:for|to)\s+(?:general|lay)\s+(?:readers?|audiences?)\b/i, "general readers"],
    [/\bnon[\s-]?technical\b/i, "general readers"],
    [/\btechnical\s+audience\b/i, "technical experts"],
  ];
  for (const [pattern, audience] of patterns) {
    if (pattern.test(text)) return audience;
  }
  return undefined;
}

function parsePurpose(text: string): string | undefined {
  if (/\b(?:academic|scholarly)\s+(?:submission|paper|essay|assignment|thesis)\b/i.test(text)) {
    return "academic submission";
  }
  if (/\b(?:literature\s+review|systematic\s+review)\b/i.test(text)) return "literature review";
  if (/\b(?:executive|decision)\s+(?:brief|briefing|memo)\b/i.test(text)) return "decision briefing";
  if (/\b(?:briefing|memo)\b/i.test(text)) return "briefing";
  if (/\b(?:explainer|explain\s+it|teach\s+me)\b/i.test(text)) return "explainer";
  if (/\b(?:report|paper|essay|analysis)\b/i.test(text)) return "research report";
  return undefined;
}

function parseTone(text: string): string | undefined {
  if (/\b(?:academic|scholarly|formal)\b/i.test(text)) return "academic";
  if (/\b(?:technical|engineering|precise)\b/i.test(text)) return "technical";
  if (/\b(?:conversational|casual|friendly|simple|plain)\b/i.test(text)) return "conversational";
  if (/\bneutral\b/i.test(text)) return "neutral";
  return undefined;
}

function parseCitationStyle(text: string): CitationStyle | undefined {
  if (/\bapa\b/i.test(text)) return "apa";
  if (/\bieee\b/i.test(text)) return "ieee";
  if (/\b(?:numbered|numeric|\[s#\]|citation\s+numbers?)\b/i.test(text)) return "numbered";
  return undefined;
}

const LANGUAGE_NAMES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Hindi",
  "Portuguese",
  "Italian",
  "Japanese",
  "Chinese",
  "Korean",
  "Arabic",
  "Dutch",
  "Russian",
  "Turkish",
  "Indonesian",
  "Bengali",
  "Marathi",
  "Tamil",
  "Telugu",
];

function parseLanguage(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const language of LANGUAGE_NAMES) {
    if (new RegExp(`\\b(?:in|written in|language[:\\s]+)\\s*${language.toLowerCase()}\\b`, "i").test(lower)) {
      return language;
    }
  }
  return undefined;
}

function parseFocus(text: string): string | undefined {
  const match = text.match(
    /\b(?:focus(?:ing|ed|sed)?\s+(?:on|around)|with\s+(?:a\s+)?focus\s+on|specifically\s+(?:on|about)|angle[:\s]+|emphasis\s+on)\s+([^.;\n]{3,160})/i
  );
  if (!match?.[1]) return undefined;
  return cleanPhrase(match[1]);
}

function parseTimeRange(text: string): string | undefined {
  const match = text.match(
    /\b(?:last|past|previous)\s+(\d{1,2}|two|three|five|ten)\s+(years?|months?|decades?)\b/i
  );
  if (match) return `last ${match[1]} ${match[2]}`;
  const range = text.match(/\b(19\d{2}|20\d{2})\s*(?:-|\u2013|to)\s*(19\d{2}|20\d{2})\b/);
  if (range) return `${range[1]}–${range[2]}`;
  const since = text.match(/\bsince\s+(19\d{2}|20\d{2})\b/i);
  if (since) return `since ${since[1]}`;
  if (/\b(?:recent|latest|current|up[\s-]?to[\s-]?date)\b/i.test(text)) return "recent";
  return undefined;
}

function parseList(text: string, pattern: RegExp): string[] {
  const values: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    for (const item of raw.split(/\s*(?:,|;|\band\b)\s*/i)) {
      const value = cleanPhrase(item, 80);
      if (value.length >= 3 && !values.includes(value)) values.push(value);
    }
  }
  return values.slice(0, 8);
}

/** Pull every explicit requirement out of a prompt or a batch of answers. */
export function inferFromText(text: string): PromptInference {
  const lower = text.toLowerCase();
  const mustInclude = parseList(
    text,
    /\b(?:must\s+(?:include|cover)|include|make\s+sure\s+to\s+cover|cover)\s+([^.;\n]{3,160})/gi
  );
  const exclude = parseList(
    text,
    /\b(?:exclude|do\s+not\s+(?:include|cover)|without|avoid)\s+([^.;\n]{3,160})/gi
  );
  const focus = parseFocus(text);
  const pages = parsePages(text);
  const deep = /\b(?:in[\s-]?depth|comprehensive|detailed|deep[\s-]?dive|extensive|thorough)\b/i.test(
    lower
  );
  const quick = /\b(?:quick|brief|short|concise|fast)\b/i.test(lower);

  return {
    pages,
    audience: parseAudience(text),
    purpose: parsePurpose(text),
    tone: parseTone(text),
    citationStyle: parseCitationStyle(text),
    language: parseLanguage(text),
    focus: focus && focus.length >= 3 ? focus : undefined,
    mustInclude,
    exclude,
    timeRange: parseTimeRange(text),
    deep,
    quick,
  };
}

function mergeInference(...parts: PromptInference[]): PromptInference {
  const result: PromptInference = {
    mustInclude: [],
    exclude: [],
  };
  for (const part of parts) {
    result.pages ??= part.pages;
    result.audience ??= part.audience;
    result.purpose ??= part.purpose;
    result.tone ??= part.tone;
    result.citationStyle ??= part.citationStyle;
    result.language ??= part.language;
    result.focus ??= part.focus;
    result.timeRange ??= part.timeRange;
    result.deep ||= part.deep ?? false;
    result.quick ||= part.quick ?? false;
    for (const item of part.mustInclude) {
      if (!result.mustInclude.includes(item)) result.mustInclude.push(item);
    }
    for (const item of part.exclude) {
      if (!result.exclude.includes(item)) result.exclude.push(item);
    }
  }
  result.mustInclude = result.mustInclude.slice(0, 8);
  result.exclude = result.exclude.slice(0, 8);
  return result;
}

function modeFromInference(mode: Mode | undefined, inference: PromptInference): Mode {
  if (mode) return mode;
  if (inference.deep && !inference.quick) return "deep";
  if (inference.quick && !inference.deep) return "quick";
  return "standard";
}

function redistribute(outline: { heading: string; pages: number }[], pages: number) {
  const total = outline.reduce((sum, entry) => sum + Math.max(0.1, entry.pages), 0) || 1;
  let allocated = 0;
  return outline.map((entry, index) => {
    if (index === outline.length - 1) {
      return { heading: entry.heading, pages: Math.max(0.2, Math.round((pages - allocated) * 10) / 10) };
    }
    const value = Math.max(0.2, Math.round(((entry.pages / total) * pages) * 10) / 10);
    allocated += value;
    return { heading: entry.heading, pages: value };
  });
}

/** Section page estimates that always sum to the target page count. */
export function outlineForPages(pages: number, extra: string[] = []): { heading: string; pages: number }[] {
  const target = clampPages(pages);
  const headings = [...SPEC_HEADINGS];
  // Extra requirements become findings subsections budgeted inside Findings.
  const extras = extra.map((item) => cleanPhrase(item, 90)).filter(Boolean).slice(0, 4);
  const outline = headings.map((heading, index) => ({
    heading,
    pages: Math.max(0.2, Math.round(target * (SECTION_WEIGHTS[index] ?? 0.1) * 10) / 10),
  }));
  if (extras.length > 0) {
    const findings = outline[2];
    if (findings) {
      findings.pages = Math.max(findings.pages, Math.round((target * 0.37) * 10) / 10);
    }
  }
  return redistribute(outline, target);
}

export function outlineTotal(outline: { heading: string; pages: number }[]): number {
  return Math.round(outline.reduce((sum, entry) => sum + entry.pages, 0) * 10) / 10;
}

export interface BuildSpecOptions {
  /** Explicit mode choice from the request wins over wording. */
  mode?: Mode;
  /** Explicit target pages (e.g. from the proposal editor). */
  pages?: number;
}

/** Build a complete spec from a topic, optional mode and everything inferred. */
export function buildSpec(
  topic: string,
  inference: PromptInference,
  options: BuildSpecOptions = {}
): ResearchSpec {
  const cleanTopic = cleanPhrase(topic || "Untitled research", 300);
  const mode = modeFromInference(options.mode, inference);
  const pages = clampPages(options.pages ?? inference.pages ?? DEFAULT_PAGES[mode]);
  const focus = inference.focus;
  const mustInclude = inference.mustInclude.slice(0, 8);

  return {
    topic: cleanTopic,
    mode,
    pages,
    audience: inference.audience ?? "general readers",
    purpose: inference.purpose ?? (mode === "deep" ? "in-depth research briefing" : "research briefing"),
    tone: inference.tone ?? (mode === "deep" ? "academic" : "neutral, analytical"),
    citationStyle: inference.citationStyle ?? "numbered",
    language: inference.language ?? "English",
    ...(focus ? { focus } : {}),
    ...(mustInclude.length ? { mustInclude } : {}),
    ...(inference.exclude.length ? { exclude: inference.exclude.slice(0, 8) } : {}),
    ...(inference.timeRange ? { timeRange: inference.timeRange } : {}),
    outline: outlineForPages(pages, mustInclude),
  };
}

/** True when the prompt already answers enough that asking would be annoying. */
export function needsClarification(text: string, _mode?: Mode): boolean {
  const trimmed = text.trim();
  if (!trimmed || isJustDoIt(trimmed)) return false;

  const inference = inferFromText(trimmed);
  const pagesKnown = inference.pages !== undefined;
  const audienceKnown = inference.audience !== undefined;
  const focusKnown = inference.focus !== undefined || inference.mustInclude.length > 0;

  // "5-page report on X for beginners" → length + audience is enough.
  if (pagesKnown && (audienceKnown || focusKnown)) return false;

  // A fully specified brief (length + purpose + format) needs no questions.
  if (pagesKnown && inference.purpose !== undefined && inference.citationStyle !== undefined) {
    return false;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return true;
  if (
    /^(?:research|look\s+into|investigate|find\s+out|study|analy[sz]e|do\s+some\s+research|research\s+something|tell\s+me\s+something|anything|something|a\s+topic|some\s+topic)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }

  // A specific topic with no length/audience is still worth one short batch.
  return !pagesKnown || !audienceKnown;
}

function withDecideForMe(options: string[]): string[] {
  const cleaned = options.filter((option) => !/decide for me/i.test(option));
  if (cleaned.length !== options.length) return options.slice(0, 4);
  return [...cleaned.slice(0, 3), "Decide for me"];
}

/** Flatten structured clarify answers into deterministic inference text. */
export function answersToText(answers?: ClarifyAnswer[]): string {
  return (answers ?? [])
    .map((answer) => (Array.isArray(answer.answer) ? answer.answer.join(", ") : answer.answer))
    .map((answer) => answer.trim())
    .filter(Boolean)
    .join("\n");
}

function answeredQuestionIds(answers?: ClarifyAnswer[]): Set<string> {
  return new Set(
    (answers ?? [])
      .filter((answer) => {
        const value = Array.isArray(answer.answer) ? answer.answer.join(" ") : answer.answer;
        return value.trim().length > 0;
      })
      .map((answer) => answer.questionId)
  );
}

/** Only the unanswered questions, in a stable order, capped at four. */
export function buildClarifyQuestions(
  text: string,
  _mode?: Mode,
  answers: ClarifyAnswer[] = []
): ClarifyQuestion[] {
  const combined = [text, answersToText(answers)].filter(Boolean).join("\n");
  const inference = inferFromText(combined);
  const answered = answeredQuestionIds(answers);
  const questions: ClarifyQuestion[] = [];
  const pagesKnown = inference.pages !== undefined || answered.has("length");

  if (!pagesKnown) {
    questions.push({
      id: "length",
      question: "How long should the paper be?",
      options: withDecideForMe(["2–3 pages", "5–8 pages", "10–15 pages"]),
    });
  }

  if (!inference.audience && !answered.has("audience")) {
    questions.push({
      id: "audience",
      question: "Who is it for?",
      options: withDecideForMe([
        "Student / academic",
        "Professional / executive",
        "Technical expert",
        "General reader",
      ]),
    });
  }

  if (!inference.focus && inference.mustInclude.length === 0 && !answered.has("focus")) {
    questions.push({
      id: "focus",
      question: "What should it focus on?",
      options: withDecideForMe([
        "Broad overview",
        "Latest developments",
        "Evidence, trade-offs and limits",
        "A specific angle — I'll type it",
      ]),
    });
  }

  if ((!inference.citationStyle || !inference.purpose) && !answered.has("format")) {
    questions.push({
      id: "format",
      question: "Any format preferences?",
      options: withDecideForMe([
        "Numbered citations [S#]",
        "APA style",
        "IEEE style",
        "Include a comparison table",
      ]),
    });
  }

  return questions.slice(0, 4);
}

export function clarifyIntro(text: string): string {
  const short = titleFromTopic(extractTopic([{ role: "user", content: text }]));
  return `I can turn “${short}” into a cited paper. A few quick choices — or pick “Decide for me” to use sensible defaults.`;
}

export function wordBudgetForSpec(spec: ResearchSpec): number {
  return Math.max(250, Math.round(clampPages(spec.pages) * WORDS_PER_PAGE));
}

/** A short human summary for the proposal card. */
export function specSummary(spec: ResearchSpec): string {
  const parts = [
    `${spec.pages}-page ${spec.mode} paper for ${spec.audience}`,
    spec.purpose,
    `${spec.citationStyle} citations`,
    spec.language !== "English" ? spec.language : "",
    `≈${wordBudgetForSpec(spec).toLocaleString("en-US")} words`,
    spec.focus ? `focus: ${spec.focus}` : "",
  ].filter(Boolean);
  const outline = spec.outline
    .map((entry) => `${entry.heading} (${entry.pages}p)`)
    .join(" · ");
  return `${parts.join(" · ")}.\nOutline: ${outline}.`;
}

/** Clamp and repair a spec that came back from the client or an edit. */
export function normalizeSpec(input: ResearchSpec): ResearchSpec {
  const pages = clampPages(input.pages);
  const mode: Mode = input.mode === "quick" || input.mode === "deep" ? input.mode : input.mode === "standard" ? "standard" : "standard";
  const citationStyle: CitationStyle =
    input.citationStyle === "apa" || input.citationStyle === "ieee" ? input.citationStyle : "numbered";
  const cleanedOutline =
    Array.isArray(input.outline) && input.outline.length > 0
      ? input.outline
          .filter((entry) => entry && typeof entry.heading === "string" && entry.heading.trim())
          .slice(0, 20)
          .map((entry) => ({
            heading: cleanPhrase(entry.heading, 120),
            pages: Number.isFinite(entry.pages) ? Math.max(0.2, entry.pages) : 0.5,
          }))
      : [];
  const outline =
    cleanedOutline.length > 0 ? redistribute(cleanedOutline, pages) : outlineForPages(pages);

  return {
    topic: cleanPhrase(input.topic || "Untitled research", 300),
    mode,
    pages,
    audience: cleanPhrase(input.audience || "general readers", 80),
    purpose: cleanPhrase(input.purpose || "research briefing", 80),
    tone: cleanPhrase(input.tone || "neutral, analytical", 60),
    citationStyle,
    language: cleanPhrase(input.language || "English", 40),
    ...(input.focus ? { focus: cleanPhrase(input.focus, 200) } : {}),
    ...(Array.isArray(input.mustInclude) && input.mustInclude.length
      ? { mustInclude: input.mustInclude.map((item) => cleanPhrase(item, 90)).filter(Boolean).slice(0, 8) }
      : {}),
    ...(Array.isArray(input.exclude) && input.exclude.length
      ? { exclude: input.exclude.map((item) => cleanPhrase(item, 90)).filter(Boolean).slice(0, 8) }
      : {}),
    ...(input.timeRange ? { timeRange: cleanPhrase(input.timeRange, 60) } : {}),
    outline,
  };
}

export interface ProposalEditResult {
  spec: ResearchSpec;
  changes: string[];
}

const DROP_SECTION =
  /\b(?:drop|remove|delete|cut)\s+(?:the\s+)?(?:section\s+)?(?:(?:number\s+)?(\d{1,2})|["“]?([^"”.,\n]{3,80})["”]?)\b/i;

const ADD_SECTION =
  /\b(?:add|insert|include)\s+(?:a\s+|an\s+|one\s+)?(?:new\s+)?section\s+(?:on|about|called|titled)\s+([^.;\n]{3,120})/i;

function sectionIndex(spec: ResearchSpec, raw: string | undefined): number {
  if (!raw) return -1;
  const number = Number(raw);
  if (Number.isFinite(number) && number >= 1) return number - 1;
  const needle = raw.toLowerCase().replace(/\s+section$/i, "").trim();
  return spec.outline.findIndex((entry) => entry.heading.toLowerCase().includes(needle));
}

/**
 * Apply a plain-chat instruction to a proposal. Returns the updated spec so
 * the runner can re-emit a proposal card without running research.
 */
export function applyProposalEdit(instruction: string, current: ResearchSpec): ProposalEditResult {
  let spec = normalizeSpec(current);
  const changes: string[] = [];
  const lower = instruction.toLowerCase();

  // Pages.
  const pages = parsePages(instruction);
  if (pages !== undefined && pages !== spec.pages) {
    spec = { ...spec, pages, outline: redistribute(spec.outline, pages) };
    changes.push(`target length is now ${pages} page${pages === 1 ? "" : "s"}`);
  } else if (/\b(?:shorter|reduce|trim|cut\s+it\s+down)\b/i.test(lower)) {
    const next = clampPages(Math.max(MIN_PAGES, spec.pages - 2));
    if (next !== spec.pages) {
      spec = { ...spec, pages: next, outline: redistribute(spec.outline, next) };
      changes.push(`shortened to ${next} pages`);
    }
  } else if (/\b(?:longer|expand|extend|more\s+detail)\b/i.test(lower)) {
    const next = clampPages(Math.min(MAX_PAGES, spec.pages + 2));
    if (next !== spec.pages) {
      spec = { ...spec, pages: next, outline: redistribute(spec.outline, next) };
      changes.push(`expanded to ${next} pages`);
    }
  }

  // Mode.
  const explicitMode = instruction.match(/\b(quick|standard|deep)\s*(?:mode|run)?\b/i);
  if (explicitMode?.[1]) {
    const mode = explicitMode[1].toLowerCase() as Mode;
    if (mode !== spec.mode) {
      spec = { ...spec, mode };
      changes.push(`mode is now ${mode}`);
    }
  } else if (/\b(?:deeper|more\s+thorough|comprehensive)\b/i.test(lower) && spec.mode !== "deep") {
    spec = { ...spec, mode: "deep" };
    changes.push("mode is now deep");
  }

  // Audience, purpose, tone.
  const audience = parseAudience(instruction);
  if (audience && audience !== spec.audience) {
    spec = { ...spec, audience };
    changes.push(`audience is now ${audience}`);
  }
  const purpose = parsePurpose(instruction);
  if (purpose && purpose !== spec.purpose) {
    spec = { ...spec, purpose };
    changes.push(`purpose is now ${purpose}`);
  }
  if (/\bmore\s+technical\b/i.test(lower)) {
    spec = { ...spec, tone: "technical", audience: "technical experts" };
    changes.push("tone is now technical");
  } else if (/\b(?:simpler|less\s+technical|plain\s+(?:english|language)|more\s+accessible)\b/i.test(lower)) {
    spec = { ...spec, tone: "conversational", audience: "general readers" };
    changes.push("tone is now plain-language");
  } else {
    const tone = parseTone(instruction);
    if (tone && tone !== spec.tone) {
      spec = { ...spec, tone };
      changes.push(`tone is now ${tone}`);
    }
  }

  // Citation style and language.
  const citationStyle = parseCitationStyle(instruction);
  if (citationStyle && citationStyle !== spec.citationStyle) {
    spec = { ...spec, citationStyle };
    changes.push(`citations use ${citationStyle}`);
  }
  const language = parseLanguage(instruction);
  if (language && language !== spec.language) {
    spec = { ...spec, language };
    changes.push(`language is now ${language}`);
  }

  // Focus / time range.
  const focus = parseFocus(instruction);
  if (focus && focus !== spec.focus) {
    spec = { ...spec, focus };
    changes.push(`focus: ${focus}`);
  }
  const timeRange = parseTimeRange(instruction);
  if (timeRange && timeRange !== spec.timeRange) {
    spec = { ...spec, timeRange };
    changes.push(`time range: ${timeRange}`);
  }

  // Sections.
  const add = instruction.match(ADD_SECTION);
  if (add?.[1]) {
    const heading = cleanPhrase(add[1], 100);
    const exists = spec.outline.some((entry) => entry.heading.toLowerCase().includes(heading.toLowerCase()));
    if (!exists) {
      const last = spec.outline[spec.outline.length - 1];
      const lastHeading = last?.heading ?? "Conclusion & future directions";
      const insertAt = Math.max(1, spec.outline.length - 1);
      const outline = [...spec.outline];
      outline.splice(insertAt, 0, { heading: `Findings: ${heading}`, pages: Math.max(0.5, spec.pages * 0.1) });
      spec = { ...spec, outline: redistribute(outline, spec.pages), mustInclude: [...(spec.mustInclude ?? []), heading].slice(0, 8) };
      changes.push(`added a section on ${heading}`);
      void lastHeading;
    }
  }

  const drop = instruction.match(DROP_SECTION);
  if (drop?.[1] || drop?.[2]) {
    const index = sectionIndex(spec, drop[1] ?? drop[2]);
    if (index >= 0 && index < spec.outline.length && spec.outline.length > 2) {
      const [removed] = spec.outline.splice(index, 1);
      spec = { ...spec, outline: redistribute(spec.outline, spec.pages) };
      if (removed) changes.push(`removed “${removed.heading}”`);
    }
  }

  // Keep the outline total exact after all edits.
  spec = { ...spec, outline: redistribute(spec.outline, spec.pages) };

  if (changes.length === 0) {
    // Still acknowledge a focus/must-include directive even if identical.
    const mustInclude = parseList(
      instruction,
      /\b(?:must\s+(?:include|cover)|include|make\s+sure\s+to\s+cover|cover)\s+([^.;\n]{3,160})/gi
    );
    if (mustInclude.length > 0) {
      const merged = Array.from(new Set([...(spec.mustInclude ?? []), ...mustInclude])).slice(0, 8);
      spec = { ...spec, mustInclude: merged };
      changes.push(`must cover: ${mustInclude.join(", ")}`);
    }
  }

  return { spec, changes };
}

/** Approval phrases, including the "just do it" escape hatch. */
export function isJustDoIt(text: string): boolean {
  return /^\s*(?:ok(?:ay)?[,\s]*)?(?:just\s+do\s+it|just\s+go|just\s+start|decide\s+for\s+me|you\s+decide|do\s+it|go\s+ahead|go\s+for\s+it|start\s+(?:now|researching|the\s+research)|proceed|approve(?:d)?|looks\s+good|sounds\s+good|perfect)\b/i.test(
    text
  );
}

export function isProposalRevision(text: string): boolean {
  return /\b(?:drop|remove|delete|cut|add|insert|include|page|pages|longer|shorter|expand|shorten|audience|executive|technical|simpler|apa|ieee|numbered|focus|section|deep|quick|standard|language|refine|instead)\b/i.test(
    text
  );
}

/** Plain-language approval of a proposal card. */
export function isApproval(text: string): boolean {
  if (isJustDoIt(text)) return true;
  return /^\s*(?:yes|yeah|yep|sure|ok(?:ay)?|please\s+do|let'?s\s+go|run\s+it|begin|continue|start|approved?|looks\s+right)\b/i.test(
    text
  );
}

/**
 * Fold a scoping answer or a plain-language proposal edit into the current
 * spec. Handles both free text and the option labels the clarify card uses.
 */
export function applyAnswerToSpec(instruction: string, current: ResearchSpec): ProposalEditResult {
  const base = applyProposalEdit(instruction, current);
  let spec = base.spec;
  const changes = [...base.changes];
  const lower = instruction.toLowerCase();
  const inference = inferFromText(instruction);

  const push = (change: string) => {
    if (!changes.includes(change)) changes.push(change);
  };

  // Option labels from the clarify card.
  if (/\b(?:student|academic)\b/i.test(lower) && !/\bacademic\s+submission\b/i.test(lower)) {
    if (spec.audience !== "students") {
      spec = { ...spec, audience: "students" };
      push("audience is now students");
    }
  } else if (/\b(?:professional|executive|decision[-\s]?maker)\b/i.test(lower)) {
    if (spec.audience !== "executives") {
      spec = { ...spec, audience: "executives" };
      push("audience is now executives");
    }
  } else if (/\btechnical\s+experts?\b/i.test(lower)) {
    if (spec.audience !== "technical experts") {
      spec = { ...spec, audience: "technical experts" };
      push("audience is now technical experts");
    }
  } else if (/\bgeneral\s+readers?\b/i.test(lower)) {
    if (spec.audience !== "general readers") {
      spec = { ...spec, audience: "general readers" };
      push("audience is now general readers");
    }
  }

  if (/\blatest\s+developments?\b/i.test(lower)) {
    spec = { ...spec, focus: "latest developments", timeRange: "recent" };
    push("focus: latest developments");
  } else if (/\bevidence,?\s+trade[-\s]?offs?(?:\s+and\s+limits)?\b/i.test(lower)) {
    spec = { ...spec, focus: "evidence, trade-offs and limits" };
    push("focus: evidence, trade-offs and limits");
  }

  if (/\bcomparison\s+table\b/i.test(lower)) {
    const mustInclude = Array.from(new Set([...(spec.mustInclude ?? []), "comparison table"])).slice(0, 8);
    spec = { ...spec, mustInclude };
    push("must include a comparison table");
  }

  // Generic free-text answers not covered by the option labels.
  if (inference.audience && inference.audience !== spec.audience) {
    spec = { ...spec, audience: inference.audience };
    push(`audience is now ${inference.audience}`);
  }
  if (inference.purpose && inference.purpose !== spec.purpose) {
    spec = { ...spec, purpose: inference.purpose };
    push(`purpose is now ${inference.purpose}`);
  }
  if (inference.tone && inference.tone !== spec.tone) {
    spec = { ...spec, tone: inference.tone };
    push(`tone is now ${inference.tone}`);
  }
  if (inference.citationStyle && inference.citationStyle !== spec.citationStyle) {
    spec = { ...spec, citationStyle: inference.citationStyle };
    push(`citations use ${inference.citationStyle}`);
  }
  if (inference.language && inference.language !== spec.language) {
    spec = { ...spec, language: inference.language };
    push(`language is now ${inference.language}`);
  }
  if (inference.focus && inference.focus !== spec.focus) {
    spec = { ...spec, focus: inference.focus };
    push(`focus: ${inference.focus}`);
  }
  if (inference.timeRange && inference.timeRange !== spec.timeRange) {
    spec = { ...spec, timeRange: inference.timeRange };
    push(`time range: ${inference.timeRange}`);
  }
  if (inference.mustInclude.length > 0) {
    const merged = Array.from(new Set([...(spec.mustInclude ?? []), ...inference.mustInclude])).slice(0, 8);
    if (merged.length !== (spec.mustInclude ?? []).length) {
      spec = { ...spec, mustInclude: merged };
      push(`must cover: ${inference.mustInclude.join(", ")}`);
    }
  }

  if (changes.length === 0) {
    push("noted the preference");
  }

  return { spec: normalizeSpec(spec), changes };
}

/**
 * Build a spec from a conversation, using later user turns and structured
 * clarify answers as scoping answers. When the original request was oversized,
 * the chosen feasibility option sets an explicit, visible final target.
 */
export function specFromConversation(
  messages: AgentMessage[],
  mode?: Mode,
  structuredAnswers?: ClarifyAnswer[]
): ResearchSpec {
  const users = messages.filter((message) => message.role === "user" && message.content.trim());
  const first = users[0]?.content ?? "";
  const topic = extractTopic([{ role: "user", content: first }]) || first;
  const freeText = users.slice(1).map((message) => message.content).join("\n");
  const structured = answersToText(structuredAnswers);
  const answers = [freeText, structured].filter(Boolean).join("\n");
  // Later answers override the original request, so "5 pages" after a broad
  // first message wins. The topic still comes from the first message.
  const inference = mergeInference(inferFromText(answers), inferFromText(first));
  const base = buildSpec(topic, inference, { mode });

  const answerPages = requestedPageCount(answers);
  const firstPages = requestedPageCount(first);
  const requested = answerPages ?? firstPages;
  // An explicit smaller answer resolves the page question without needing a
  // feasibility card, and must not be silently replaced with 15 pages.
  const resolvedSmaller = answerPages !== undefined && answerPages <= FREE_TIER_MAX_PAGES;
  const feasibility =
    requested !== undefined && requested > FREE_TIER_MAX_PAGES
      ? pageFeasibility(`${requested} pages`)
      : null;
  const explicitChoice = pageChoice(answers) ?? pageChoice(first);
  const insisted =
    feasibility !== null &&
    answerPages !== undefined &&
    answerPages >= feasibility.requested;
  const choice = resolvedSmaller
    ? undefined
    : (explicitChoice ??
      (feasibility && /\b(?:just\s+do\s+it|go\s+ahead|approve(?:d)?|decide)\b/i.test(answers)
        ? "comprehensive"
        : insisted
          ? "outline"
          : undefined));

  if (choice && (feasibility || explicitChoice)) {
    return applyPageChoice(base, choice);
  }
  return base;
}

export function hasScopingAnswers(
  messages: AgentMessage[],
  structuredAnswers?: ClarifyAnswer[]
): boolean {
  if (structuredAnswers && structuredAnswers.length > 0) {
    return answersToText(structuredAnswers).length > 0;
  }
  const users = messages.filter((message) => message.role === "user" && message.content.trim());
  return users.length >= 2;
}

/** User-facing label for the plan card, kept short. */
export function proposalTitle(spec: ResearchSpec): string {
  return titleFromTopic(spec.topic);
}
