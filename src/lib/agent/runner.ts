/**
 * Agent orchestrator.
 *
 * Emits contract events in a stable order:
 *
 *   clarify:  title → intent → thinking → clarify → done
 *   proposal: title → intent → thinking → token* → proposal → done
 *   proposal revision: intent → thinking → token* → proposal → done
 *   research: title? → intent → run → todo → step(plan) → thinking → plan
 *             → step(search) → tool(search)* → source* → step(read)
 *             → tool(read_page)* → step(analyze) → step(write)
 *             → report_token* → step(review) → tool(fact_check) → report
 *             → token* (wrap-up + 3 next steps) → done
 *   scoped research: intent → run → todo → …search/read/analyze…
 *             → report_token* → section_update → report → token* → done
 *   edit_report: intent → thinking → report_token* → section_update*
 *             → report → token* → done
 *   chat/followup: title? → intent → thinking → token* → done
 *
 * Every path ends with exactly one `done` event. Thinking notes and tool
 * events only describe work that actually happened.
 */

import { randomUUID } from "node:crypto";
import type {
  AgentEvent,
  AgentEventBody,
  AgentRequest,
  Mode,
  ReportQuality,
  ResearchSpec,
  Source,
  StepId,
  StepStatus,
  TodoItem,
  TodoStatus,
  ToolName,
} from "../contract";
import { MIN_RELEVANT_SOURCES, modeConfig } from "../config";
import { friendlyError, ProviderError } from "../errors";
import {
  completeJsonWithFallback,
  streamWithFallback,
  type FailoverInfo,
} from "../llm/client";
import { providerId, type LLMProvider } from "../llm/provider";
import {
  buildAddSectionMessages,
  buildChatMessages,
  buildCriticMessages,
  buildEditMessages,
  buildFollowupMessages,
  buildScopedResearchMessages,
  buildSectionEditMessages,
  buildSectionMessages,
  buildWriterMessages,
  PAPER_SECTIONS,
  sectionWordBudget,
  type PaperSection,
  type PaperSectionKey,
  type RunStats,
} from "../prompts";
import { estimateReportPages } from "../pdf/pages";
import { checkCitations, mergeCritic, suggestFollowups } from "../quality";
import { readSources } from "../reader";
import { cleanReportMarkdown, removeReferenceSections, reportTitle } from "../research/clean";
import { ensureComparisonTable } from "../research/comparison";
import { buildFailureGuidance, buildSourceDigest } from "../research/digest";
import { extractEvidence } from "../research/evidence";
import {
  comparisonEntities,
  createPlan,
  extractTopic,
  titleFromTopic,
  type ResearchPlan,
} from "../research/plan";
import {
  changedSections,
  findSection,
  insertSection,
  removeSection,
  replaceSection,
  resolveEditTarget,
} from "../research/sections";
import {
  contentPages,
  findDuplicateSentences,
  proseWords,
  repetitiveSections,
} from "../research/synthesis";
import {
  applyAnswerToSpec,
  buildSpec,
  inferFromText,
  normalizeSpec,
  specFromConversation,
  specSummary,
  wordBudgetForSpec,
} from "../research/spec";
import { searchAll, selectSources } from "../search";
import type { ResearchSource, SearchStats } from "../search/types";
import type { Emit } from "../sse";
import { routeRequest, type RouteResult } from "./router";

export interface AgentContext {
  providers: LLMProvider[];
  tavilyKey?: string;
  /**
   * Server-generated run identifier. The API route creates it once so the SSE
   * heartbeat and every agent event share the same id.
   */
  runId?: string;
  /** Human-readable provider `/models` validation notes from the API route. */
  modelNotes?: string[];
}

/** Internal producers emit bare bodies; `runAgent` adds the envelope once. */
type EmitBody = (event: AgentEventBody) => void;

const ZERO_KEY_NOTE =
  "No LLM key is configured, so I cannot write a synthesised paper. I stopped instead of assembling one from copied source sentences; the clearly labelled source digest below lists what was found.";

const MODEL_FAILURE_NOTE =
  "No free model returned usable paper text, so I stopped instead of assembling a fake paper from source sentences. The clearly labelled source digest below lists what was found.";

function step(
  emit: EmitBody,
  id: StepId,
  status: StepStatus,
  title: string,
  detail?: string
): void {
  emit(detail ? { type: "step", id, status, title, detail } : { type: "step", id, status, title });
}

function think(emit: EmitBody, text: string): void {
  if (text.trim()) emit({ type: "thinking", text: text.trim() });
}

function tool(
  emit: EmitBody,
  name: ToolName,
  id: string,
  input: string,
  status: "running" | "done" | "error",
  summary?: string
): void {
  emit(summary ? { type: "tool", id, name, input, status, summary } : { type: "tool", id, name, input, status });
}

function toPublicSource(source: ResearchSource): Source {
  return {
    id: source.id,
    title: source.title,
    url: source.url,
    domain: source.domain,
    kind: source.kind,
    snippet: source.snippet,
    credibility: source.credibility,
    credibilityReason: source.credibilityReason,
    ...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
  };
}

function publicSources(sources: Source[]): Source[] {
  return sources.map((source) => ({
    id: source.id,
    title: source.title,
    url: source.url,
    domain: source.domain,
    kind: source.kind,
    snippet: source.snippet,
    credibility: source.credibility,
    credibilityReason: source.credibilityReason,
    ...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
  }));
}

function emitChunked(text: string, emit: EmitBody, type: "token" | "report_token"): void {
  const size = 180;
  for (let index = 0; index < text.length; index += size) {
    const chunk = text.slice(index, index + size);
    if (type === "token") emit({ type: "token", text: chunk });
    else emit({ type: "report_token", text: chunk });
  }
}

function lastUserText(request: AgentRequest): string {
  const message = [...request.messages].reverse().find((item) => item.role === "user");
  return message?.content.trim() ?? "";
}

function userMessages(request: AgentRequest) {
  return request.messages.filter((message) => message.role === "user" && message.content.trim());
}

function chatTitle(request: AgentRequest): string {
  const first = userMessages(request)[0]?.content ?? "New research";
  const topic = extractTopic([{ role: "user", content: first }]);
  const trimmed = topic.replace(/[“”"]/g, "").split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  return titleFromTopic(trimmed || "New research").slice(0, 80);
}

function pickFollowups(topic: string, subtopics: string[], candidate?: string[]): string[] {
  const result: string[] = [];
  for (const question of candidate ?? []) {
    const clean = typeof question === "string" ? question.trim() : "";
    if (clean && !result.includes(clean)) result.push(clean);
    if (result.length === 3) break;
  }
  for (const fallback of suggestFollowups(topic, subtopics)) {
    if (result.length === 3) break;
    if (!result.includes(fallback)) result.push(fallback);
  }
  while (result.length < 3) {
    result.push(`What should I investigate next about ${topic || "this topic"}?`);
  }
  return result.slice(0, 3).map((question) =>
    question.length > 140 ? `${question.slice(0, 137)}...` : question
  );
}

/** Keeps the full task list in sync and re-sends it on every change. */
class TodoList {
  private readonly items: TodoItem[];

  constructor(private readonly emit: EmitBody, labels: Array<{ id: string; label: string }>) {
    this.items = labels.map(({ id, label }) => ({ id, label, status: "pending" }));
    this.flush();
  }

  set(id: string, status: TodoStatus): void {
    const item = this.items.find((entry) => entry.id === id);
    if (!item || item.status === status) return;
    item.status = status;
    this.flush();
  }

  private flush(): void {
    this.emit({ type: "todo", items: this.items.map((item) => ({ ...item })) });
  }
}

function failoverHandler(emit: EmitBody, signal: AbortSignal): (info: FailoverInfo) => void {
  return (info) => {
    if (signal.aborted) return;
    const destination = info.to ? `switching to ${info.to}` : "no fallback provider is left";
    const wait =
      info.retryAfterSeconds !== undefined ? `, retry-after ${info.retryAfterSeconds}s` : "";
    think(emit, `${info.from} failed (${info.reason}${wait}); ${destination}.`);
  };
}

interface CriticPayload {
  score?: number;
  notes?: string[];
  followups?: string[];
}

function validateCritic(value: unknown): CriticPayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const score =
    typeof record.score === "number" && Number.isFinite(record.score) ? record.score : undefined;
  const notes = Array.isArray(record.notes)
    ? record.notes.filter((note): note is string => typeof note === "string").slice(0, 8)
    : [];
  const followups = Array.isArray(record.followups)
    ? record.followups.filter((item): item is string => typeof item === "string").slice(0, 5)
    : [];
  if (score === undefined && notes.length === 0 && followups.length === 0) return null;
  return { score, notes, followups };
}

/* ------------------------------------------------------------------------- */
/* Shared event helpers                                                       */
/* ------------------------------------------------------------------------- */

function nextVersion(request: AgentRequest): number {
  return Math.max(1, Math.floor((request.report?.version ?? 0) + 1));
}

function emitReportEvent(
  emit: EmitBody,
  input: {
    version: number;
    title: string;
    markdown: string;
    sources: Source[];
    changes?: string[];
    quality: ReportQuality;
    followups: string[];
    pagesRequested?: number;
    pagesDelivered?: number;
  }
): void {
  const estimated = estimateReportPages(input.markdown, input.sources.length);
  const delivered =
    input.pagesDelivered ?? Math.round(contentPages(input.markdown) * 10) / 10;
  emit({
    type: "report",
    version: input.version,
    title: input.title,
    markdown: input.markdown,
    sources: publicSources(input.sources),
    pagesEstimated: estimated,
    pagesDelivered: delivered,
    pagesRequested: input.pagesRequested ?? delivered,
    ...(input.changes && input.changes.length ? { changes: input.changes } : {}),
    quality: input.quality,
    followups: input.followups.slice(0, 3),
  });
}

function emitWrapUp(
  emit: EmitBody,
  input: {
    title: string;
    sources: Source[];
    quality: ReportQuality;
    followups: string[];
    readPages: number;
    pages: number;
    pagesDelivered: number;
    pagesRequested: number;
    spec?: ResearchSpec;
    changeNote?: string;
  }
): void {
  const sourceLine =
    input.sources.length === 0
      ? "I found no usable sources, so the paper says that plainly instead of inventing evidence."
      : `I wrote “${input.title}” from ${input.sources.length} source${
          input.sources.length === 1 ? "" : "s"
        }, and ${input.quality.citedSources} of them are cited in the paper.`;

  const caveat = input.changeNote
    ? `${input.changeNote} The paper keeps the same sources and flags any claim the evidence does not support.`
    : `The main caveat is coverage: ${
        input.readPages > 0
          ? `${input.readPages} source${input.readPages === 1 ? " was" : "s were"} read in full and the rest come from index snippets`
          : "quick mode relied on index snippets rather than full pages"
      }, and I assumed ${
        input.spec?.audience ?? "an intelligent general reader"
      } with ${input.spec?.tone ?? "a neutral, analytical"} tone.`;

  const lengthLine = (() => {
    const delivered = Math.max(0, Math.round(input.pagesDelivered * 10) / 10);
    const requested = Math.max(0, Math.round(input.pagesRequested * 10) / 10);
    if (requested > 0 && delivered + 1 < requested) {
      const missing = Math.max(0, Math.round((requested - delivered) * 10) / 10);
      return `It delivers about ${delivered} content pages against your ${requested}-page target. I stopped short rather than pad it: the free models could not produce the remaining ${missing} pages from this evidence. It exports to about ${input.pages} A4 pages including the cover, references and research log.`;
    }
    return `It delivers about ${delivered} content pages against your ${requested}-page target and exports to about ${input.pages} A4 pages including the cover, references and research log.`;
  })();

  const next = input.followups
    .slice(0, 3)
    .map((question, index) => `${index + 1}. ${question}`)
    .join("\n");

  emitChunked(`${sourceLine} ${caveat} ${lengthLine}\n\nNext steps:\n${next}`, emit, "token");
}

function emitClarify(route: RouteResult, emit: EmitBody): void {
  const questions = route.clarify?.questions ?? [];
  const first = questions[0];
  think(
    emit,
    questions.length > 0
      ? `Before spending searches, I need ${questions.length} quick choice${questions.length === 1 ? "" : "s"} about scope.`
      : "I need a little more detail before searching."
  );
  emit({
    type: "clarify",
    ...(route.clarify?.intro ? { intro: route.clarify.intro } : {}),
    ...(route.clarify?.notice ? { notice: route.clarify.notice } : {}),
    questions,
    question: first?.question ?? "What would you like me to research?",
    options: first?.options ?? ["A technical topic", "A comparison", "A market question"],
  });
}

function emitProposal(spec: ResearchSpec, emit: EmitBody, intro?: string): void {
  const summary = specSummary(spec);
  think(
    emit,
    `I have enough to plan a ${spec.pages}-page ${spec.mode} paper for ${spec.audience}. I'll wait for your approval before searching.`
  );
  emitChunked(
    `${intro ?? "Here's the plan I'd run."} Change anything in plain language, or say “go ahead” and I'll start.`,
    emit,
    "token"
  );
  emit({ type: "proposal", spec, summary });
}

/** Build the spec to run, preferring an approved spec from the client. */
function resolveSpec(request: AgentRequest, route: RouteResult): ResearchSpec {
  if (request.spec) {
    const topicMatches =
      !route.topic ||
      !request.report ||
      request.spec.topic.trim().toLowerCase() === route.topic.trim().toLowerCase();
    if (topicMatches) return normalizeSpec(request.spec);
  }

  if (userMessages(request).length >= 2 || (request.answers?.length ?? 0) > 0) {
    return specFromConversation(request.messages, request.mode, request.answers);
  }

  const topic = route.topic || extractTopic(request.messages) || lastUserText(request);
  return buildSpec(topic, inferFromText(lastUserText(request)), { mode: request.mode });
}

/* ------------------------------------------------------------------------- */
/* Chat and follow-ups                                                        */
/* ------------------------------------------------------------------------- */

async function streamChat(
  request: AgentRequest,
  ctx: AgentContext,
  emit: EmitBody,
  signal: AbortSignal
): Promise<void> {
  think(emit, "This is conversational, so I'll answer directly without a research run.");

  if (ctx.providers.length === 0) {
    emit({ type: "error", message: ZERO_KEY_NOTE, recoverable: true });
    emitChunked(
      "I can run fully sourced research without any API key using Wikipedia, arXiv and OpenAlex. Add a free Groq or OpenRouter key in Settings to chat with the AI and to get synthesised papers.",
      emit,
      "token"
    );
    return;
  }

  let text = "";
  try {
    const result = await streamWithFallback(
      ctx.providers,
      (provider) => buildChatMessages(provider, request.messages),
      {
        signal,
        temperature: 0.5,
        maxTokens: 900,
        onToken: (token) => emit({ type: "token", text: token }),
        onFailover: failoverHandler(emit, signal),
      }
    );
    text = result?.text ?? "";
    if (result?.partial) {
      emit({
        type: "error",
        message: "The model stream was interrupted. You can retry the message.",
        recoverable: true,
      });
    }
  } catch (error) {
    emit({ type: "error", message: friendlyError(error), recoverable: true });
  }

  if (!text.trim() && !signal.aborted) {
    emit({
      type: "error",
      message: "The free models did not return an answer. Please try again.",
      recoverable: true,
    });
  }
}

async function streamFollowup(
  request: AgentRequest,
  ctx: AgentContext,
  route: RouteResult,
  emit: EmitBody,
  signal: AbortSignal
): Promise<void> {
  const report = request.report;
  const question = route.question || lastUserText(request);
  if (!report) {
    emit({
      type: "error",
      message: "There is no paper to follow up on. Ask me to research something first.",
      recoverable: true,
    });
    return;
  }

  think(
    emit,
    "This is about the existing paper, so I'll answer from its sources and mark where the evidence stops."
  );

  let text = "";
  if (ctx.providers.length > 0) {
    try {
      const result = await streamWithFallback(
        ctx.providers,
        (provider) =>
          buildFollowupMessages(provider, {
            question,
            report: {
              title: report.title,
              markdown: report.markdown,
              sources: publicSources(report.sources),
            },
            messages: request.messages,
            spec: request.spec ?? null,
          }),
        {
          signal,
          temperature: 0.3,
          maxTokens: 1200,
          onToken: (token) => emit({ type: "token", text: token }),
          onFailover: failoverHandler(emit, signal),
        }
      );
      text = result?.text ?? "";
      if (result?.partial) {
        emit({
          type: "error",
          message: "The model stream was interrupted. You can ask again.",
          recoverable: true,
        });
      }
    } catch (error) {
      emit({ type: "error", message: friendlyError(error), recoverable: true });
    }
  } else {
    text = answerFromReport(question, report);
    emit({ type: "error", message: ZERO_KEY_NOTE, recoverable: true });
    emitChunked(text, emit, "token");
  }

  if (!text.trim() && !signal.aborted) {
    const fallback = answerFromReport(question, report);
    emitChunked(fallback, emit, "token");
  }
}

const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "what", "which", "when",
  "where", "why", "how", "does", "did", "was", "were", "are", "you", "your",
  "about", "into", "over", "under", "between", "they", "them", "their", "have",
  "has", "had", "can", "could", "should", "would", "report", "paper", "says",
  "said",
]);

function answerFromReport(question: string, report: NonNullable<AgentRequest["report"]>): string {
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff]+/i)
    .filter((term) => term.length > 2 && !STOP.has(term));

  const paragraphs = report.markdown
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        .filter((line) => !/^\s*#{1,6}\s/.test(line) && !/^\s*\|/.test(line))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((text) => text.length > 80);

  if (terms.length === 0) {
    return `The paper is titled “${report.title}”. Ask about a specific finding, or start a new research run for a new topic.`;
  }

  const ranked = paragraphs
    .map((text) => {
      const lower = text.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
      return { text, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (ranked.length === 0) {
    return [
      "The paper does not contain enough information to answer that directly.",
      "",
      "You can ask about a specific section, or start a new research run and I will search for sources on it.",
    ].join("\n");
  }

  return [
    "From the report:",
    "",
    ...ranked.map((item) => item.text),
    "",
    "This answer is limited to the sources already in the paper. Add a free Groq or OpenRouter key in Settings for a synthesised follow-up.",
  ].join("\n");
}

/* ------------------------------------------------------------------------- */
/* Proposal flow                                                             */
/* ------------------------------------------------------------------------- */

function runProposal(request: AgentRequest, route: RouteResult, emit: EmitBody): void {
  const base = request.spec
    ? normalizeSpec(request.spec)
    : specFromConversation(request.messages, request.mode, request.answers);

  if (request.spec && route.instruction) {
    const edited = applyAnswerToSpec(route.instruction, base);
    think(
      emit,
      edited.changes.length > 0
        ? `Updating the plan: ${edited.changes.join("; ")}.`
        : "I kept the plan unchanged after that note."
    );
    emitProposal(edited.spec, emit, "Updated the plan.");
    return;
  }

  emitProposal(base, emit, "Here's what I'd research.");
}

/* ------------------------------------------------------------------------- */
/* Full research                                                             */
/* ------------------------------------------------------------------------- */

function normalizeSection(text: string, heading: string, topic: string): string {
  let body = text.trim();
  if (!body) return "";
  const firstLine = body.split("\n")[0] ?? "";
  if (heading.startsWith("# ")) {
    if (!/^#\s+\S/.test(firstLine)) body = `# ${titleFromTopic(topic)}\n\n${body}`;
    return body;
  }
  if (!/^#{1,6}\s/.test(firstLine)) body = `${heading}\n\n${body}`;
  return body;
}

const SECTION_WRITE_ORDER: PaperSectionKey[] = [
  "opening",
  "findings",
  "discussion",
  "limitations",
  "conclusion",
  "methodology",
];

/** Paper order differs from write order: Methodology is written last. */
const SECTION_PAPER_ORDER: PaperSectionKey[] = [
  "opening",
  "methodology",
  "findings",
  "discussion",
  "limitations",
  "conclusion",
];

function sectionByKey(key: PaperSectionKey): PaperSection {
  return PAPER_SECTIONS.find((section) => section.key === key) ?? PAPER_SECTIONS[0]!;
}

function stripCodeFence(text: string): string {
  const normalized = (text ?? "").replace(/\r\n?/g, "\n");
  const fenced = normalized.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
  return (fenced?.[1] ?? normalized).trim();
}

/** Keep only the requested section, even if the model wrote the whole paper. */
function sectionChunk(text: string, section: PaperSection, topic: string): string {
  let body = stripCodeFence(text);
  if (!body) return "";

  if (section.key === "opening") {
    const cut = body.search(/^#{1,3}\s+(?:\d+\.\s*)?Methodology\b/im);
    if (cut > 0) body = body.slice(0, cut).trimEnd();
    if (!/^#\s+\S/.test(body)) body = `# ${titleFromTopic(topic)}\n\n${body}`;
    return body;
  }

  const found = findSection(body, section.heading);
  if (found) return `## ${found.heading}\n\n${found.body.trim()}`.trimEnd();

  const lines = body.split("\n");
  const headingIndex = lines.findIndex((line) => /^#{1,6}\s+\S/.test(line));
  if (headingIndex >= 0) {
    lines[headingIndex] = section.heading;
    return lines.join("\n").trim();
  }
  return `${section.heading}\n\n${body}`.trim();
}

type SectionResult =
  | { ok: true; text: string; provider: string }
  | { ok: false; error?: unknown };

interface SectionedWriteInput {
  topic: string;
  mode: Mode;
  plan: ResearchPlan;
  sources: ResearchSource[];
  evidence: Array<{ sourceId: string; text: string }>;
  runStats: RunStats;
  comparison: boolean;
  spec?: ResearchSpec;
}

interface SectionedWriteResult {
  markdown: string;
  partial: boolean;
  failed: boolean;
  providers: string[];
  error?: unknown;
}

async function requestSection(
  ctx: AgentContext,
  input: SectionedWriteInput,
  section: PaperSection,
  budget: number,
  previous: string,
  emit: EmitBody,
  signal: AbortSignal,
  options: { stream: boolean; expansionNote?: string }
): Promise<SectionResult> {
  const promptSection: PaperSection = options.expansionNote
    ? { ...section, instruction: `${section.instruction} ${options.expansionNote}` }
    : section;

  try {
    const result = await streamWithFallback(
      ctx.providers,
      (provider) =>
        buildSectionMessages(provider, {
          ...input,
          section: promptSection,
          previous,
          wordBudget: budget,
        }),
      {
        signal,
        temperature: 0.35,
        // Free models cap output at 4096 tokens; a very long section is split
        // by the page-repair loop rather than silently truncated.
        maxTokens: Math.min(4096, Math.max(section.maxTokens, Math.ceil(budget * 1.5))),
        onToken: options.stream
          ? (token: string) => emit({ type: "report_token", text: token })
          : () => {},
        onFailover: failoverHandler(emit, signal),
      }
    );

    if (result?.partial) {
      emit({
        type: "error",
        message: "A model stream was interrupted; the paper may be incomplete.",
        recoverable: true,
      });
    }
    const text = sectionChunk(result?.text ?? "", section, input.topic);
    if (!text) return { ok: false };
    return { ok: true, text, provider: providerId(result!.provider) };
  } catch (error) {
    return { ok: false, error };
  }
}

function assembleSections(chunks: Partial<Record<PaperSectionKey, string>>): string {
  return SECTION_PAPER_ORDER.map((key) => chunks[key]?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n")
    .trim();
}

function contextBefore(
  chunks: Partial<Record<PaperSectionKey, string>>,
  key: PaperSectionKey
): string {
  const index = SECTION_PAPER_ORDER.indexOf(key);
  return SECTION_PAPER_ORDER.slice(0, Math.max(0, index))
    .map((item) => chunks[item] ?? "")
    .join("\n\n")
    .slice(-1600);
}

function keyForHeading(heading: string): PaperSectionKey | undefined {
  const value = heading.toLowerCase();
  if (/abstract|introduction/.test(value)) return "opening";
  if (/methodology/.test(value)) return "methodology";
  if (/findings/.test(value)) return "findings";
  if (/discussion/.test(value)) return "discussion";
  if (/limitations/.test(value)) return "limitations";
  if (/conclusion/.test(value)) return "conclusion";
  return undefined;
}

/** Keep the Methodology provider list exactly equal to real successes. */
function syncMethodologyProviders(markdown: string, providers: string[]): string {
  const label = providers.length ? providers.join(", ") : "none — no model returned text";
  const lines = markdown.split("\n");
  let replaced = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/language model providers? used:/i.test(line)) {
      lines[index] = line.replace(
        /(language model providers? used:\s*).*/i,
        `$1${label}`
      );
      replaced = true;
    }
  }
  if (replaced) return lines.join("\n");

  const methodology = findSection(markdown, "Methodology");
  if (!methodology) return markdown;
  const addition = `\n\n- Language model providers used: ${label}`;
  return replaceSection(
    markdown,
    methodology.heading,
    `## ${methodology.heading}\n\n${methodology.body.trimEnd()}${addition}\n`
  );
}

/**
 * Write the paper one section at a time with a page budget, then repair.
 *
 * Returns `failed` when any required section could not be written; the caller
 * must then show a source digest rather than fake the missing parts.
 */
async function writeSectionedPaper(
  ctx: AgentContext,
  input: SectionedWriteInput,
  emit: EmitBody,
  signal: AbortSignal
): Promise<SectionedWriteResult> {
  const chunks: Partial<Record<PaperSectionKey, string>> = {};
  const providers = new Set<string>();
  const targetPages = Math.max(1, input.spec?.pages ?? 5);
  let partial = false;
  let lastError: unknown;

  const rememberProvider = (provider: string) => {
    providers.add(provider);
    input.runStats.providers = Array.from(providers);
  };

  think(
    emit,
    `I'll write about ${targetPages * 450} words section by section, with a word budget for each part, so no single free-tier call has to hold the whole paper.`
  );

  for (let index = 0; index < SECTION_WRITE_ORDER.length; index += 1) {
    if (signal.aborted) return { markdown: "", partial, failed: true, providers: Array.from(providers) };
    const key = SECTION_WRITE_ORDER[index]!;
    const section = sectionByKey(key);
    const budget = sectionWordBudget(targetPages, section);

    think(
      emit,
      index === 0
        ? "Starting with the abstract and introduction."
        : `Section ${index + 1} of ${SECTION_WRITE_ORDER.length}: ${section.heading.replace(/#/g, "").trim()} (~${budget} words).`
    );

    let result: SectionResult = { ok: false };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      result = await requestSection(
        ctx,
        input,
        section,
        budget,
        contextBefore(chunks, key),
        emit,
        signal,
        { stream: attempt === 0 }
      );
      if (result.ok) break;
      lastError = result.error ?? lastError;
      if (signal.aborted) break;
    }

    if (!result.ok) {
      return {
        markdown: assembleSections(chunks),
        partial,
        failed: true,
        providers: Array.from(providers),
        ...(lastError ? { error: lastError } : {}),
      };
    }
    chunks[key] = result.text;
    rememberProvider(result.provider);
  }

  if (signal.aborted) {
    return { markdown: assembleSections(chunks), partial, failed: true, providers: Array.from(providers) };
  }

  let markdown = assembleSections(chunks);
  const comparison = input.comparison ? comparisonEntities(input.topic) : null;

  const refreshComparison = (value: string): string => {
    if (!comparison) return value;
    return ensureComparisonTable(value, {
      left: comparison[0],
      right: comparison[1],
      sources: input.sources,
      evidence: input.evidence,
    });
  };

  markdown = refreshComparison(markdown);

  // Regenerate sections that repeat sentences from earlier sections.
  const duplicateHeadings = repetitiveSections(markdown).slice(0, 4);
  const duplicateKeys = new Set(
    duplicateHeadings
      .map(keyForHeading)
      .filter((key): key is PaperSectionKey => Boolean(key))
  );
  if (duplicateKeys.size > 0) {
    think(
      emit,
      `The draft repeats ${duplicateHeadings.length === 1 ? "a sentence" : "sentences"} across sections, so I'm rewriting the affected part rather than padding it.`
    );
  }
  for (const key of duplicateKeys) {
    if (signal.aborted) break;
    const section = sectionByKey(key);
    const budget = sectionWordBudget(targetPages, section);
    const before = markdown;
    const previousChunk = chunks[key];
    const result = await requestSection(
      ctx,
      input,
      section,
      budget,
      contextBefore(chunks, key),
      emit,
      signal,
      {
        stream: false,
        expansionNote:
          "Rewrite this section without repeating any sentence or near-identical wording used elsewhere in the paper; say something new.",
      }
    );
    if (!result.ok) continue;
    chunks[key] = result.text;
    rememberProvider(result.provider);
    const candidate = refreshComparison(assembleSections(chunks));
    if (findDuplicateSentences(candidate).length <= findDuplicateSentences(before).length) {
      markdown = candidate;
    } else {
      chunks[key] = previousChunk;
      markdown = before;
    }
  }

  // Measure against the requested content pages and expand the weakest sections.
  let delivered = contentPages(markdown);
  for (let pass = 0; pass < 2 && targetPages - delivered > 1 && !signal.aborted; pass += 1) {
    const candidates = SECTION_WRITE_ORDER.map((key) => {
      const section = sectionByKey(key);
      const budget = sectionWordBudget(targetPages, section);
      const words = proseWords(chunks[key] ?? "");
      return { key, section, budget, words, shortfall: budget - words };
    })
      .filter((item) => item.shortfall > 80)
      .sort((a, b) => b.shortfall - a.shortfall)
      .slice(0, 3);

    if (candidates.length === 0) break;

    think(
      emit,
      `Page check: about ${delivered.toFixed(1)} of ${targetPages} content pages. Expanding ${candidates
        .map((item) => item.section.heading.replace(/#/g, "").replace(/^\s*\d+\.\s*/, "").trim())
        .join(", ")} instead of padding with repetition.`
    );

    for (const candidate of candidates) {
      if (signal.aborted) break;
      const result = await requestSection(
        ctx,
        input,
        candidate.section,
        candidate.budget,
        contextBefore(chunks, candidate.key),
        emit,
        signal,
        {
          stream: false,
          expansionNote: `The current draft of this section is only about ${candidate.words} words against a ${candidate.budget}-word budget. Expand it with evidence-based analysis to about ${candidate.budget} words.`,
        }
      );
      if (!result.ok) continue;
      chunks[candidate.key] = result.text;
      rememberProvider(result.provider);
      markdown = refreshComparison(assembleSections(chunks));
    }

    markdown = refreshComparison(markdown);
    delivered = contentPages(markdown);
  }

  input.runStats.providers = Array.from(providers);
  markdown = syncMethodologyProviders(markdown, input.runStats.providers);

  return {
    markdown,
    partial,
    failed: false,
    providers: Array.from(providers),
  };
}

async function runResearch(
  request: AgentRequest,
  ctx: AgentContext,
  route: RouteResult,
  emit: EmitBody,
  signal: AbortSignal
): Promise<void> {
  const spec = resolveSpec(request, route);
  const mode: Mode = spec.mode ?? request.mode ?? "standard";
  const config = modeConfig(mode);
  const topic = (spec.topic || route.topic || lastUserText(request))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  const runId = ctx.runId ?? randomUUID();

  emit({ type: "run", runId, topic, mode });

  const todo = new TodoList(emit, [
    { id: "plan", label: "Plan the research" },
    { id: "search_web", label: "Search the web" },
    ...(config.includeAcademic ? [{ id: "search_academic", label: "Search academic literature" }] : []),
    { id: "read", label: "Read selected sources" },
    { id: "analyze", label: "Cross-check claims" },
    { id: "write", label: "Write the paper" },
    { id: "review", label: "Review citations and quality" },
  ]);

  think(
    emit,
    `Approved brief: ${spec.pages} A4 pages (~${wordBudgetForSpec(spec)} words) for ${spec.audience}, ${spec.citationStyle} references${
      spec.focus ? `, focused on ${spec.focus}` : ""
    }.`
  );

  // ---------------------------------------------------------------- plan
  todo.set("plan", "running");
  step(emit, "plan", "running", "Planning research", `${config.queryCount} search queries`);
  think(
    emit,
    `I'll split “${topic}” into ${Math.min(5, config.queryCount + 1)} subtopics and run ${config.queryCount} targeted searches.`
  );

  let plan: ResearchPlan;
  try {
    const planned = await createPlan(
      topic,
      mode,
      ctx.providers,
      signal,
      failoverHandler(emit, signal),
      spec
    );
    plan = planned.plan;
  } catch {
    plan = {
      objective: `Produce a balanced, source-grounded assessment of ${topic}.`,
      subtopics: [],
      queries: [`${topic} overview`, `${topic} latest developments`],
      comparison: false,
    };
  }
  emit({
    type: "plan",
    objective: plan.objective,
    subtopics: plan.subtopics,
    queries: plan.queries,
  });
  step(
    emit,
    "plan",
    "done",
    "Research planned",
    `${plan.queries.length} queries · ${plan.subtopics.length} subtopics`
  );
  todo.set("plan", "done");

  // -------------------------------------------------------------- search
  todo.set("search_web", "running");
  if (config.includeAcademic) todo.set("search_academic", "running");
  step(emit, "search", "running", "Searching sources", "Keyless indexes first");
  think(
    emit,
    `Searching Wikipedia${config.includeAcademic ? ", arXiv and OpenAlex" : ""}${
      ctx.tavilyKey ? " and Tavily" : ""
    } for the planned queries.`
  );

  let sources: ResearchSource[] = [];
  let hitCount = 0;
  let webOk = false;
  let academicOk = false;
  let searchStats: SearchStats | undefined;
  try {
    const hits = await searchAll(plan.queries, {
      mode,
      tavilyKey: ctx.tavilyKey,
      signal,
      onProgress: (progress) => {
        if (progress.status === "done" && progress.name === "web_search") webOk = true;
        if (progress.status === "done" && progress.name === "academic_search") academicOk = true;
        tool(
          emit,
          progress.name,
          progress.id,
          progress.input,
          progress.status,
          progress.summary
        );
      },
      onRetry: (info) => {
        think(
          emit,
          `No results for “${info.query}” (${info.reason}). Retrying with the shorter query “${info.nextQuery}” (attempt ${info.attempt}).`
        );
      },
      onStats: (stats) => {
        searchStats = stats;
      },
    });
    hitCount = hits.length;
    sources = selectSources(hits, topic, mode);
  } catch {
    sources = [];
  }
  const providerCounts = searchStats ? Object.values(searchStats) : undefined;

  for (const source of sources) {
    emit({ type: "source", source: toPublicSource(source) });
  }
  step(
    emit,
    "search",
    sources.length > 0 ? "done" : "error",
    sources.length > 0 ? "Sources collected" : "No sources found",
    `${hitCount} results · ${sources.length} selected`
  );
  todo.set("search_web", webOk || sources.length > 0 ? "done" : "error");
  if (config.includeAcademic) {
    todo.set(
      "search_academic",
      academicOk || sources.some((source) => source.kind === "academic") ? "done" : "error"
    );
  }

  if (sources.length < MIN_RELEVANT_SOURCES) {
    const found = sources.length;
    const sourceLabel = found === 0 ? "no relevant sources" : `${found} relevant source${found === 1 ? "" : "s"}`;
    emit({
      type: "error",
      message: `Only ${sourceLabel} found, but a trustworthy paper needs at least ${MIN_RELEVANT_SOURCES}. I stopped before writing rather than pad it.`,
      recoverable: true,
    });
    emitChunked(
      [
        `I did not write the paper because fewer than ${MIN_RELEVANT_SOURCES} relevant sources survived the relevance filter. Padding with generic pages would make the paper look better sourced than it is.`,
        "",
        "Choose one of these:",
        "- Broaden the topic so the reference and academic indexes return more evidence.",
        ctx.tavilyKey
          ? "- Keep Tavily enabled and refine its key in Settings for broader web coverage."
          : "- Add a free Tavily key in Settings for broader web search.",
        found === 0
          ? "- Ask for a clearly labelled background overview once I have at least one relevant source."
          : "- Ask for a clearly labelled background overview based only on the sources I did find.",
      ].join("\n"),
      emit,
      "token"
    );
    step(emit, "write", "error", "Stopped before writing", `Only ${sourceLabel}`);
    todo.set("read", "error");
    todo.set("analyze", "error");
    todo.set("write", "error");
    todo.set("review", "error");
    if (ctx.providers.length === 0 && sources.length > 0) {
      emitChunked(
        buildSourceDigest({
          topic,
          sources,
          reason: `No LLM key is configured and only ${sourceLabel} survived the relevance filter, so no paper was written.`,
          ...(ctx.modelNotes ? { modelNotes: ctx.modelNotes } : {}),
          zeroKey: true,
        }),
        emit,
        "token"
      );
    }
    return;
  }

  if (sources.length === 0) {
    think(
      emit,
      "No usable sources came back. I will state that plainly rather than invent evidence."
    );
  } else {
    const academic = sources.filter((source) => source.kind === "academic").length;
    think(
      emit,
      `Found ${hitCount} unique candidates and selected ${sources.length} by relevance and credibility${
        academic > 0 ? `, including ${academic} academic source${academic === 1 ? "" : "s"}` : ""
      }.`
    );
  }

  // ---------------------------------------------------------------- read
  todo.set("read", "running");
  step(emit, "read", "running", "Reading sources", `${config.readPages} pages`);
  let readCount = 0;
  let readFailures = 0;
  if (config.readPages === 0) {
    think(emit, "Quick mode skips full-page reading and relies on index snippets.");
    step(emit, "read", "done", "Sources read", "Quick mode uses index snippets");
    todo.set("read", sources.length > 0 ? "done" : "error");
  } else {
    try {
      const read = await readSources(sources, config.readPages, signal, (progress) => {
        tool(emit, "read_page", `read-${progress.sourceId}`, progress.url, progress.status, progress.summary);
      });
      readCount = read.read;
      readFailures = read.failures;
    } catch {
      readCount = 0;
      readFailures = 0;
    }
    step(
      emit,
      "read",
      readCount > 0 || readFailures === 0 ? "done" : "error",
      "Sources read",
      `${readCount} pages read${readFailures > 0 ? ` · ${readFailures} failed` : ""}`
    );
    todo.set("read", readCount > 0 || sources.length === 0 ? "done" : "error");
    think(
      emit,
      readCount > 0
        ? `Read ${readCount} full page${readCount === 1 ? "" : "s"}${readFailures > 0 ? `; ${readFailures} failed or were too thin` : ""}.`
        : "No full page could be read; the paper will rely on snippets and say so."
    );
  }

  // ------------------------------------------------------------- analyze
  todo.set("analyze", "running");
  step(emit, "analyze", "running", "Extracting evidence");
  let evidence: Array<{ sourceId: string; text: string }> = [];
  try {
    evidence = extractEvidence(sources, topic, plan.subtopics, 3, 30);
  } catch {
    evidence = [];
  }
  step(
    emit,
    "analyze",
    evidence.length > 0 ? "done" : "error",
    "Evidence extracted",
    `${evidence.length} cited snippets`
  );
  todo.set("analyze", evidence.length > 0 ? "done" : "error");
  if (evidence.length > 0) {
    think(
      emit,
      `Pulled ${evidence.length} verbatim evidence snippet${evidence.length === 1 ? "" : "s"} across ${
        new Set(evidence.map((item) => item.sourceId)).size
      } source${new Set(evidence.map((item) => item.sourceId)).size === 1 ? "" : "s"}.`
    );
  }

  // --------------------------------------------------------------- write
  todo.set("write", "running");
  step(emit, "write", "running", "Writing paper");
  let markdown = "";
  let title = titleFromTopic(topic);

  const runStats: RunStats = {
    mode,
    queries: plan.queries.length,
    sources: sources.length,
    readPages: readCount,
    // Deep writing fills this with providers that really returned text; the
    // single-call path starts from the primary and is corrected below.
    providers:
      mode === "deep" ? [] : ctx.providers[0] ? [providerId(ctx.providers[0])] : [],
    tavily: Boolean(ctx.tavilyKey),
    academic: config.includeAcademic,
    ...(providerCounts ? { providerCounts } : {}),
  };

  let writeError: unknown;
  if (ctx.providers.length === 0) {
    // The digest path below reports the missing key; no model call is made.
  } else {
    try {
      if (mode === "deep") {
        const deep = await writeSectionedPaper(
          ctx,
          {
            topic,
            mode,
            plan,
            sources,
            evidence,
            runStats,
            comparison: plan.comparison,
            spec,
          },
          emit,
          signal
        );
        markdown = deep.markdown;
        if (deep.failed || markdown.trim().length < 400) {
          markdown = "";
          writeError = deep.error;
        } else {
          runStats.providers = deep.providers;
        }
      } else {
        const result = await streamWithFallback(
          ctx.providers,
          (provider) =>
            buildWriterMessages(provider, {
              topic,
              mode,
              plan: {
                objective: plan.objective,
                subtopics: plan.subtopics,
                queries: plan.queries,
              },
              sources,
              evidence,
              comparison: plan.comparison,
              runStats,
              spec,
            }),
          {
            signal,
            temperature: 0.35,
            onToken: (token) => emit({ type: "report_token", text: token }),
            onFailover: failoverHandler(emit, signal),
          }
        );
        markdown = result?.text ?? "";
        if (result) runStats.providers = [providerId(result.provider)];
        if (result?.partial) {
          emit({
            type: "error",
            message: "The model stream was interrupted; the paper may be incomplete.",
            recoverable: true,
          });
        }
        if (markdown.trim().length < 200) {
          markdown = "";
        }
      }
    } catch (error) {
      markdown = "";
      writeError = error;
    }
  }

  if (!markdown) {
    const reason = ctx.providers.length === 0 ? ZERO_KEY_NOTE : MODEL_FAILURE_NOTE;
    const providerDetail =
      writeError instanceof ProviderError && writeError.detail
        ? ` Provider message: ${writeError.detail}.`
        : "";
    const fullReason = `${reason}${providerDetail}`;
    const retryAfterSeconds =
      writeError instanceof ProviderError ? writeError.retryAfterSeconds : undefined;

    emit({ type: "error", message: fullReason, recoverable: true });
    emitChunked(
      buildFailureGuidance({
        reason: fullReason,
        zeroKey: ctx.providers.length === 0,
        ...(ctx.modelNotes ? { modelNotes: ctx.modelNotes } : {}),
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      }),
      emit,
      "token"
    );
    emitChunked(
      buildSourceDigest({
        topic,
        sources,
        reason: fullReason,
        ...(ctx.modelNotes ? { modelNotes: ctx.modelNotes } : {}),
        zeroKey: ctx.providers.length === 0,
      }),
      emit,
      "token"
    );
    step(emit, "write", "error", "No paper written", "No model produced synthesised text");
    todo.set("write", "error");
    todo.set("review", "error");
    return;
  }

  const drafted = cleanReportMarkdown(markdown, title);
  title = reportTitle(drafted, title);
  // The Methodology may have been written before a failover finished; make its
  // provider list match the providers that actually returned text.
  const cleaned = syncMethodologyProviders(drafted, runStats.providers);
  step(emit, "write", "done", "Paper drafted", `${cleaned.length.toLocaleString("en-US")} characters`);
  todo.set("write", "done");

  // -------------------------------------------------------------- review
  todo.set("review", "running");
  step(emit, "review", "running", "Checking citations");
  tool(emit, "fact_check", "fact-check", "citation and source audit", "running");

  const published = sources.map(toPublicSource);
  const check = checkCitations(cleaned, published, {
    pagesRequested: spec.pages,
    topic,
  });
  let quality: ReportQuality = mergeCritic(check, null);
  let criticFollowups: string[] | undefined;

  const runCritic = ctx.providers.length > 0 && sources.length > 0 && (mode === "deep" || spec.pages >= 5);
  if (runCritic) {
    try {
      const critic = await completeJsonWithFallback(
        ctx.providers,
        (provider) =>
          buildCriticMessages(provider, {
            topic,
            markdown: cleaned,
            sources: published,
          }),
        validateCritic,
        {
          signal,
          temperature: 0.1,
          maxTokens: 500,
          timeoutMs: 20_000,
          onFailover: failoverHandler(emit, signal),
        }
      );
      if (critic) {
        quality = mergeCritic(check, critic.data);
        criticFollowups = critic.data.followups;
      }
    } catch {
      // deterministic quality is enough; never lose the report
    }
  }

  tool(
    emit,
    "fact_check",
    "fact-check",
    "citation and source audit",
    "done",
    `${quality.citedSources}/${quality.totalSources} sources cited · score ${quality.score}/10`
  );
  step(
    emit,
    "review",
    "done",
    "Citations checked",
    `${quality.citedSources}/${quality.totalSources} sources cited · score ${quality.score}/10`
  );
  todo.set("review", "done");
  think(
    emit,
    `Citation audit: ${quality.citedSources} of ${quality.totalSources} sources cited, quality score ${quality.score}/10.`
  );

  const followups = pickFollowups(topic, plan.subtopics, criticFollowups);
  const version = nextVersion(request);
  emitReportEvent(emit, {
    version,
    title,
    markdown: cleaned,
    sources: published,
    ...(request.report ? { changes: ["Started a new research run"] } : {}),
    quality,
    followups,
    pagesRequested: spec.pages,
    pagesDelivered: check.pagesDelivered,
  });

  emitWrapUp(emit, {
    title,
    sources: published,
    quality,
    followups,
    readPages: readCount,
    pages: estimateReportPages(cleaned, published.length),
    pagesDelivered: check.pagesDelivered,
    pagesRequested: spec.pages,
    spec,
  });
}

/* ------------------------------------------------------------------------- */
/* Scoped research (deepen one section and merge it back)                    */
/* ------------------------------------------------------------------------- */

function maxSourceNumber(sources: Source[]): number {
  return sources.reduce((max, source) => {
    const value = Number((source.id.match(/\d+/) ?? ["0"])[0]);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
}

function cleanSectionOutput(text: string, heading: string): string {
  const fenced = text
    .replace(/\r\n?/g, "\n")
    .match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
  const body = (fenced?.[1] ?? text).replace(/\r\n?/g, "\n").trim();
  if (!body) return "";
  const first = body.split("\n")[0] ?? "";
  if (!/^#{1,6}\s+\S/.test(first)) return `## ${heading.replace(/^#+\s*/, "")}\n\n${body}`;
  return body;
}

async function runScopedResearch(
  request: AgentRequest,
  ctx: AgentContext,
  route: RouteResult,
  emit: EmitBody,
  signal: AbortSignal
): Promise<void> {
  const report = request.report;
  if (!report) return;

  const scope = route.scope || extractTopic(request.messages);
  const direct = findSection(report.markdown, scope);
  const fallback =
    direct ??
    (() => {
      const target = resolveEditTarget(scope, report.markdown);
      if (target.mode === "replace" && target.headings[0]) {
        return findSection(report.markdown, target.headings[0]);
      }
      return undefined;
    })();

  if (!fallback) {
    emit({
      type: "error",
      message: `I couldn't find a section called “${scope.slice(0, 80)}”. Ask me to research a section by name, or tell me to edit the paper instead.`,
      recoverable: true,
    });
    emitChunked(
      `The current paper has these sections: ${findSection(report.markdown, "Abstract") ? "Abstract, " : ""}Introduction, Methodology, Findings, Discussion, Limitations, Conclusion.`,
      emit,
      "token"
    );
    return;
  }

  const section = fallback;
  const baseSpec = request.spec
    ? normalizeSpec(request.spec)
    : specFromConversation(request.messages, request.mode, request.answers);
  const mode: Mode = baseSpec.mode || request.mode || "standard";
  const config = modeConfig(mode);
  const topic = baseSpec.topic || report.title;
  const scopedTopic = `${topic} — ${section.heading.replace(/^\s*\d+(?:\.\d+)*[.)]?\s*/, "")}`;
  const spec: ResearchSpec = { ...baseSpec, focus: section.heading, mustInclude: [] };
  const runId = ctx.runId ?? randomUUID();

  emit({ type: "run", runId, topic: scopedTopic, mode });
  think(
    emit,
    `I'll deepen “${section.heading}” with a focused search, then merge only that section back into the paper.`
  );

  const todo = new TodoList(emit, [
    { id: "plan", label: "Plan the focused search" },
    { id: "search_web", label: "Search for new evidence" },
    ...(config.includeAcademic ? [{ id: "search_academic", label: "Search academic literature" }] : []),
    { id: "read", label: "Read the best new sources" },
    { id: "write", label: "Merge evidence into the section" },
    { id: "review", label: "Re-check citations" },
  ]);

  // Plan.
  todo.set("plan", "running");
  step(emit, "plan", "running", "Planning focused research", section.heading);
  let plan: ResearchPlan;
  try {
    const planned = await createPlan(
      scopedTopic,
      mode,
      ctx.providers,
      signal,
      failoverHandler(emit, signal),
      spec
    );
    plan = planned.plan;
  } catch {
    plan = {
      objective: `Find stronger evidence for ${section.heading}.`,
      subtopics: [section.heading],
      queries: [`${scopedTopic} evidence`, `${scopedTopic} latest`],
      comparison: false,
    };
  }
  emit({ type: "plan", objective: plan.objective, subtopics: plan.subtopics, queries: plan.queries });
  step(emit, "plan", "done", "Focused search planned", `${plan.queries.length} queries`);
  todo.set("plan", "done");

  // Search, excluding URLs already in the paper.
  todo.set("search_web", "running");
  if (config.includeAcademic) todo.set("search_academic", "running");
  step(emit, "search", "running", "Searching for new sources");
  const existingUrls = new Set(report.sources.map((source) => source.url));
  let fresh: ResearchSource[] = [];
  let searchStats: SearchStats | undefined;
  try {
    const hits = await searchAll(plan.queries, {
      mode,
      tavilyKey: ctx.tavilyKey,
      signal,
      onProgress: (progress) => {
        tool(emit, progress.name, progress.id, progress.input, progress.status, progress.summary);
      },
      onRetry: (info) => {
        think(
          emit,
          `No results for “${info.query}” (${info.reason}). Retrying with “${info.nextQuery}”.`
        );
      },
      onStats: (stats) => {
        searchStats = stats;
      },
    });
    const unique = hits.filter((hit) => !existingUrls.has(hit.url));
    const offset = maxSourceNumber(report.sources);
    fresh = selectSources(unique, scopedTopic, mode).map((source, index) => ({
      ...source,
      id: `S${offset + index + 1}`,
    }));
  } catch {
    fresh = [];
  }
  for (const source of fresh) emit({ type: "source", source: toPublicSource(source) });
  step(
    emit,
    "search",
    fresh.length > 0 ? "done" : "error",
    fresh.length > 0 ? "New sources collected" : "No new sources found",
    `${fresh.length} new`
  );
  todo.set("search_web", fresh.length > 0 ? "done" : "error");
  if (config.includeAcademic) {
    todo.set(
      "search_academic",
      fresh.some((source) => source.kind === "academic") ? "done" : "error"
    );
  }

  if (fresh.length === 0) {
    emit({
      type: "error",
      message: "The focused search found no new sources, so I left the paper unchanged.",
      recoverable: true,
    });
    emitChunked(
      `I didn't find a source the paper doesn't already cite for “${section.heading}”. Try a more specific angle, or add a free Tavily key for broader web search.`,
      emit,
      "token"
    );
    return;
  }

  // Read.
  todo.set("read", "running");
  step(emit, "read", "running", "Reading new sources");
  let readCount = 0;
  if (config.readPages === 0) {
    think(emit, "Quick mode uses snippets, so I'll merge the strongest new snippets directly.");
    step(emit, "read", "done", "New snippets ready");
    todo.set("read", "done");
  } else {
    try {
      const read = await readSources(fresh, Math.max(2, Math.min(4, config.readPages)), signal, (progress) => {
        tool(emit, "read_page", `scoped-${progress.sourceId}`, progress.url, progress.status, progress.summary);
      });
      readCount = read.read;
    } catch {
      readCount = 0;
    }
    step(emit, "read", "done", "New sources read", `${readCount} pages read`);
    todo.set("read", "done");
  }

  // Analyze.
  let evidence: Array<{ sourceId: string; text: string }> = [];
  try {
    evidence = extractEvidence(fresh, scopedTopic, [section.heading], 4, 18);
  } catch {
    evidence = [];
  }
  step(emit, "analyze", "done", "Evidence extracted", `${evidence.length} new snippets`);

  // Write just the section.
  todo.set("write", "running");
  step(emit, "write", "running", "Merging into the section");
  if (ctx.providers.length === 0) {
    emit({ type: "error", message: ZERO_KEY_NOTE, recoverable: true });
    emitChunked(
      buildFailureGuidance({
        reason: ZERO_KEY_NOTE,
        zeroKey: true,
        ...(ctx.modelNotes ? { modelNotes: ctx.modelNotes } : {}),
      }),
      emit,
      "token"
    );
    step(emit, "write", "error", "Section unchanged", "No language model available");
    todo.set("write", "error");
    todo.set("review", "error");
    return;
  }

  let replacement = "";
  try {
    const result = await streamWithFallback(
      ctx.providers,
      (provider) =>
        buildScopedResearchMessages(provider, {
          topic: scopedTopic,
          heading: section.heading,
          existing: section.markdown,
          sources: fresh,
          evidence,
          runStats: {
            mode,
            queries: plan.queries.length,
            sources: report.sources.length + fresh.length,
            readPages: readCount,
            providers: Array.from(new Set(ctx.providers.map(providerId))),
            tavily: Boolean(ctx.tavilyKey),
            academic: config.includeAcademic,
            ...(searchStats ? { providerCounts: Object.values(searchStats) } : {}),
          },
          spec,
        }),
      {
        signal,
        temperature: 0.3,
        maxTokens: 1600,
        onToken: (token) => emit({ type: "report_token", text: token }),
        onFailover: failoverHandler(emit, signal),
      }
    );
    replacement = cleanSectionOutput(result?.text ?? "", section.heading);
  } catch {
    replacement = "";
  }

  if (!replacement) {
    const reason =
      "No model returned synthesised text for this section, so I left the paper unchanged rather than paste source sentences.";
    emit({ type: "error", message: reason, recoverable: true });
    emitChunked(
      buildFailureGuidance({
        reason,
        ...(ctx.modelNotes ? { modelNotes: ctx.modelNotes } : {}),
      }),
      emit,
      "token"
    );
    step(emit, "write", "error", "Section unchanged", "No synthesised text returned");
    todo.set("write", "error");
    todo.set("review", "error");
    return;
  }

  const merged = replaceSection(report.markdown, section.heading, replacement);
  if (merged === report.markdown) {
    emit({
      type: "error",
      message: "I couldn't merge the new evidence into that section, so the paper is unchanged.",
      recoverable: true,
    });
    return;
  }

  const updatedSection = findSection(merged, section.heading);
  if (updatedSection) {
    emit({ type: "section_update", heading: updatedSection.heading, markdown: updatedSection.markdown });
  }
  todo.set("write", "done");

  // Review.
  todo.set("review", "running");
  step(emit, "review", "running", "Re-checking citations");
  const combinedSources = publicSources([...report.sources, ...fresh.map(toPublicSource)]);
  const pagesRequested = report.pagesRequested ?? report.pagesEstimated;
  const check = checkCitations(merged, combinedSources, {
    ...(pagesRequested ? { pagesRequested } : {}),
  });
  const quality = mergeCritic(check, null);
  tool(
    emit,
    "fact_check",
    "fact-check-scoped",
    "citation and source audit",
    "done",
    `${quality.citedSources}/${quality.totalSources} sources cited · score ${quality.score}/10`
  );
  step(
    emit,
    "review",
    "done",
    "Citations checked",
    `${quality.citedSources}/${quality.totalSources} sources cited`
  );
  todo.set("review", "done");

  const title = reportTitle(merged, report.title);
  const followups =
    report.followups && report.followups.length === 3
      ? report.followups
      : pickFollowups(report.title, plan.subtopics, []);
  const changes = [
    `Deepened “${section.heading}” with ${fresh.length} new source${fresh.length === 1 ? "" : "s"}`,
  ];

  emitReportEvent(emit, {
    version: nextVersion(request),
    title,
    markdown: merged,
    sources: combinedSources,
    changes,
    quality,
    followups,
    pagesRequested: pagesRequested ?? check.pagesDelivered,
    pagesDelivered: check.pagesDelivered,
  });

  emitWrapUp(emit, {
    title,
    sources: combinedSources,
    quality,
    followups,
    readPages: readCount,
    pages: estimateReportPages(merged, combinedSources.length),
    pagesDelivered: check.pagesDelivered,
    pagesRequested: pagesRequested ?? check.pagesDelivered,
    spec,
    changeNote: `I expanded “${section.heading}” with ${fresh.length} new source${fresh.length === 1 ? "" : "s"}.`,
  });
}

/* ------------------------------------------------------------------------- */
/* Report edits                                                              */
/* ------------------------------------------------------------------------- */

async function runEdit(
  request: AgentRequest,
  ctx: AgentContext,
  route: RouteResult,
  emit: EmitBody,
  signal: AbortSignal
): Promise<void> {
  const report = request.report;
  if (!report) {
    emit({
      type: "error",
      message: "There is no paper to edit. Ask me to research something first.",
      recoverable: true,
    });
    return;
  }

  const instruction = route.instruction || lastUserText(request);
  const target = resolveEditTarget(instruction, report.markdown);
  const sources = publicSources(report.sources);
  const spec = request.spec ?? null;

  let markdown = report.markdown;
  const changes: string[] = [];
  const touched: string[] = [];

  if (target.mode === "remove" && target.headings[0]) {
    const heading = target.headings[0];
    think(emit, `Removing “${heading}” and leaving every other section byte-identical.`);
    markdown = removeSection(markdown, heading);
    changes.push(`Removed “${heading}”`);
    touched.push(heading);
  } else if (target.mode === "add" && target.newHeading) {
    const heading = target.newHeading;
    if (ctx.providers.length === 0) {
      emit({ type: "error", message: ZERO_KEY_NOTE, recoverable: true });
      emitChunked("Writing a new section needs a language model. Add a free Groq or OpenRouter key in Settings.", emit, "token");
      return;
    }
    think(emit, `I'll write a new “${heading}” section from the paper's existing sources.`);
    let text = "";
    try {
      const result = await streamWithFallback(
        ctx.providers,
        (provider) =>
          buildAddSectionMessages(provider, {
            instruction,
            heading,
            report: { title: report.title, markdown: report.markdown, sources },
            spec,
          }),
        {
          signal,
          temperature: 0.25,
          maxTokens: 1400,
          onToken: (token) => emit({ type: "report_token", text: token }),
          onFailover: failoverHandler(emit, signal),
        }
      );
      text = result?.text ?? "";
    } catch {
      text = "";
    }
    const section = cleanSectionOutput(text, heading);
    if (!section) {
      emit({
        type: "error",
        message: "The new section could not be written, so the paper is unchanged.",
        recoverable: true,
      });
      return;
    }
    markdown = insertSection(markdown, heading, section);
    changes.push(`Added a section: ${heading}`);
    touched.push(heading);
  } else if (target.mode === "replace" && target.headings.length > 0) {
    if (ctx.providers.length === 0) {
      emit({ type: "error", message: ZERO_KEY_NOTE, recoverable: true });
      emitChunked(
        "Rewriting a section needs a language model. Add a free Groq or OpenRouter key in Settings; removal-only edits still work without one.",
        emit,
        "token"
      );
      return;
    }

    for (const heading of target.headings.slice(0, 2)) {
      const current = findSection(markdown, heading);
      if (!current) continue;
      think(emit, `Editing only “${current.heading}”; the rest of the paper stays byte-identical.`);
      let text = "";
      try {
        const result = await streamWithFallback(
          ctx.providers,
          (provider) =>
            buildSectionEditMessages(provider, {
              instruction,
              heading: current.heading,
              section: current.markdown,
              report: { title: report.title, markdown: report.markdown, sources },
              spec,
            }),
          {
            signal,
            temperature: 0.25,
            maxTokens: 1600,
            onToken: (token) => emit({ type: "report_token", text: token }),
            onFailover: failoverHandler(emit, signal),
          }
        );
        text = result?.text ?? "";
      } catch {
        text = "";
      }
      const replacement = cleanSectionOutput(text, current.heading);
      if (!replacement) {
        emit({
          type: "error",
          message: `“${current.heading}” could not be rewritten, so that section is unchanged.`,
          recoverable: true,
        });
        continue;
      }
      markdown = replaceSection(markdown, current.heading, replacement);
      changes.push(`Updated “${current.heading}”`);
      touched.push(current.heading);
    }

    if (touched.length === 0) {
      emitChunked("I couldn't apply that section edit, so the paper is unchanged.", emit, "token");
      return;
    }
  } else {
    // Whole-report edit.
    if (ctx.providers.length === 0) {
      emit({ type: "error", message: ZERO_KEY_NOTE, recoverable: true });
      emitChunked("Editing the whole paper needs a language model. Add a free Groq or OpenRouter key in Settings.", emit, "token");
      return;
    }
    think(emit, "I'll rewrite the full paper according to your instruction and stream the new version.");
    let text = "";
    try {
      const result = await streamWithFallback(
        ctx.providers,
        (provider) =>
          buildEditMessages(provider, {
            instruction,
            report: { title: report.title, markdown: report.markdown, sources },
            spec,
          }),
        {
          signal,
          temperature: 0.25,
          onToken: (token) => emit({ type: "report_token", text: token }),
          onFailover: failoverHandler(emit, signal),
        }
      );
      text = result?.text ?? "";
    } catch {
      text = "";
    }
    if (text.trim().length < 120) {
      emit({
        type: "error",
        message: "The edit could not be applied, so the original paper is unchanged.",
        recoverable: true,
      });
      return;
    }
    markdown = cleanReportMarkdown(text, report.title);
    changes.push(`Applied: ${instruction.slice(0, 140)}`);
    for (const heading of changedSections(report.markdown, markdown)) touched.push(heading);
  }

  const cleaned = markdown;
  const title = reportTitle(cleaned, report.title);
  const pagesRequested = report.pagesRequested ?? report.pagesEstimated;
  const check = checkCitations(cleaned, sources, {
    ...(pagesRequested ? { pagesRequested } : {}),
  });
  const quality = mergeCritic(check, null);

  for (const heading of Array.from(new Set(touched))) {
    const updated = findSection(cleaned, heading);
    emit({ type: "section_update", heading: updated?.heading ?? heading, markdown: updated?.markdown ?? "" });
  }

  const followups =
    report.followups && report.followups.length === 3
      ? report.followups
      : pickFollowups(title, [], []);

  const version = Math.max(1, Math.floor((report.version ?? 0) + 1));
  emitReportEvent(emit, {
    version,
    title,
    markdown: cleaned,
    sources,
    changes,
    quality,
    followups,
    pagesRequested: pagesRequested ?? check.pagesDelivered,
    pagesDelivered: check.pagesDelivered,
  });

  emitWrapUp(emit, {
    title,
    sources,
    quality,
    followups,
    readPages: 0,
    pages: estimateReportPages(cleaned, sources.length),
    pagesDelivered: check.pagesDelivered,
    pagesRequested: pagesRequested ?? check.pagesDelivered,
    spec: spec ?? undefined,
    changeNote: changes[0] ? `I changed only what you asked: ${changes.join("; ")}.` : "I kept the paper as it was.",
  });
}

/* ------------------------------------------------------------------------- */
/* Entry point                                                               */
/* ------------------------------------------------------------------------- */

export async function runAgent(
  request: AgentRequest,
  ctx: AgentContext,
  emit: Emit,
  signal: AbortSignal
): Promise<void> {
  // One server-generated run id per request. Every event, including the `run`
  // payload and the SSE heartbeat, carries the same ids.
  const runId = ctx.runId ?? randomUUID();
  const context: AgentContext = { ...ctx, runId };
  const bodyEmit: EmitBody = (event) => {
    emit({ ...event, chatId: request.chatId, runId } as AgentEvent);
  };

  const route = routeRequest({
    messages: request.messages,
    mode: request.mode,
    hasReport: Boolean(request.report),
    spec: request.spec ?? null,
    answers: request.answers,
  });

  try {
    // The title is emitted once, after the first user message.
    if (userMessages(request).length === 1) {
      bodyEmit({ type: "title", title: chatTitle(request) });
    }

    bodyEmit({ type: "intent", intent: route.intent });

    switch (route.intent) {
      case "clarify":
        emitClarify(route, bodyEmit);
        break;
      case "research":
        if (route.proposalEdit) {
          runProposal(request, route, bodyEmit);
        } else if (!request.report && !route.autoApprove && !request.spec) {
          runProposal(request, route, bodyEmit);
        } else if (route.scope && request.report) {
          await runScopedResearch(request, context, route, bodyEmit, signal);
        } else {
          await runResearch(request, context, route, bodyEmit, signal);
        }
        break;
      case "edit_report":
        await runEdit(request, context, route, bodyEmit, signal);
        break;
      case "followup":
        await streamFollowup(request, context, route, bodyEmit, signal);
        break;
      case "chat":
      default:
        await streamChat(request, context, bodyEmit, signal);
        break;
    }
  } catch (error) {
    if (!signal.aborted) {
      bodyEmit({
        type: "error",
        message: friendlyError(error),
        recoverable: true,
      });
    }
  } finally {
    if (!signal.aborted) bodyEmit({ type: "done" });
  }
}
