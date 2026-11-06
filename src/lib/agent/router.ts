/**
 * Deterministic intent router.
 *
 * A rules-based router is fast, free and predictable. It is intentionally
 * conservative: it only asks for scoping when the message leaves the length,
 * audience and focus open, and it never makes a network call.
 */

import type { AgentMessage, ClarifyAnswer, Intent, Mode, ResearchSpec } from "../contract";
import { detectComparison, extractTopic } from "../research/plan";
import {
  answersToText,
  buildClarifyQuestions,
  clarifyIntro,
  FREE_TIER_MAX_PAGES,
  hasScopingAnswers,
  isApproval,
  isJustDoIt,
  needsClarification,
  pageChoice,
  pageFeasibility,
  requestedPageCount,
  type PageChoice,
  type PageFeasibility,
} from "../research/spec";

export interface RouteInput {
  messages: AgentMessage[];
  mode?: Mode;
  hasReport: boolean;
  /** Present once the user approved (or is still editing) a proposal. */
  spec?: ResearchSpec | null;
  /** Structured answers from the clarify card. */
  answers?: ClarifyAnswer[];
}

export interface ClarifyPayload {
  intro?: string;
  notice?: string;
  questions: Array<{
    id: string;
    question: string;
    options: string[];
    multiSelect?: boolean;
  }>;
}

export interface RouteResult {
  intent: Intent;
  /** Research topic (research intent) or question (follow-up intent). */
  topic?: string;
  question?: string;
  instruction?: string;
  clarify?: ClarifyPayload;
  /** Run immediately: the prompt is fully specified, or the user approved. */
  autoApprove?: boolean;
  /** The user is revising the proposal card rather than approving it. */
  proposalEdit?: boolean;
  /** Scoped research: a heading or section name to deepen. */
  scope?: string;
}

const EDIT_CUES =
  /\b(edit|rewrite|revise|reword|tighten|shorten|expand|lengthen|reformat|restructure|change\s+the\s+(?:title|tone|structure)|make\s+(?:it|the\s+report)\s+(?:shorter|longer|clearer|more\s+\w+|\d+\s+pages?)|add\s+(?:a\s+)?(?:section|paragraph|table|bullet)|remove\s+(?:the\s+)?(?:section|paragraph|table|bullet)|turn\s+(?:this|it)\s+into|drop\s+(?:the\s+)?section|delete\s+(?:the\s+)?section|use\s+(?:apa|ieee|numbered)|(?:remove|delete|drop|cut)\s+(?:the\s+)?[^.;\n]{1,60}\bsection\b)\b/i;

const EXPLICIT_RESEARCH =
  /^\s*(?:please\s+)?(?:can\s+you\s+|could\s+you\s+|would\s+you\s+)?(?:research|investigate|look\s+into|find\s+out|deep[\s-]?dive\s+into|write\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(?:research\s+)?(?:report|paper|brief|essay|summary)\s+(?:on|about)|report\s+on|compare|comparison\s+of)\b/i;

const RESEARCH_SIGNAL =
  /\b(research|investigate|look\s+into|find\s+out|deep[\s-]?dive|explore|study|analy[sz]e|gather\s+(?:information|evidence|sources)|report\s+on|state\s+of\s+the\s+art|latest\s+(?:on|developments?|research)|evidence\s+(?:on|for|about)|sources?\s+(?:on|for|about))\b/i;

const FOLLOWUP_SIGNAL =
  /\b(it|this|that|these|those|report|above|you|your|findings?|sources?|citations?|section|summary|evidence|paragraph)\b/i;

const META_CHAT =
  /^\s*(?:hi|hello|hey|yo|thanks|thank\s+you|cheers|ok(?:ay)?|cool|great|nice|bye|goodbye|good\s+morning|good\s+evening|who\s+are\s+you|what\s+can\s+you\s+do|what\s+are\s+you|how\s+does\s+this\s+work|help\s+me\s+understand\s+you)\b/i;

const QUESTION_START =
  /^\s*(?:what|why|how|when|where|who|which|is|are|was|were|does|do|did|can|could|should|would|will|tell\s+me\s+about|explain)\b/i;

const SCOPED_RESEARCH =
  /\b(?:research|look\s+into|dig|dive|go|search)\s+(?:deeper|more|further)\s+(?:on|into|about)?\s*([^.;\n]{2,120})|\b(?:more|deeper|further)\s+(?:research|sources?|evidence)\s+(?:on|about|into)\s+([^.;\n]{2,120})|\b(?:expand|deepen|extend)\s+(?:the\s+)?([^.;\n]{2,120}?)\s+section\b|\bresearch\s+(?:the\s+)?([^.;\n]{2,120}?)\s+section\b/i;

const NEW_RESEARCH = /\b(?:new|another|separate|different)\s+(?:research|report|paper|topic)\b/i;

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function lastUser(messages: AgentMessage[]): string {
  const message = [...messages].reverse().find((item) => item.role === "user");
  return message?.content.trim() ?? "";
}

function isVague(text: string): boolean {
  const list = words(text);
  if (list.length === 0) return true;
  if (list.length <= 2) return true;
  return /^(?:research|look\s+into|investigate|find\s+out|study|analy[sz]e|do\s+some\s+research|research\s+something|tell\s+me\s+something|anything|something|a\s+topic|some\s+topic)\b/i.test(
    text
  );
}

function genericClarify(text: string): ClarifyPayload {
  return {
    intro: "I can research that properly. First, a couple of quick choices.",
    questions: [
      {
        id: "topic",
        question: "What topic should I research?",
        options: [
          "A scientific or technical topic, with evidence and sources",
          "A comparison between two options",
          "A company, market or policy question",
          "A concept I should explain from scratch",
        ],
      },
      ...buildClarifyQuestions(text).slice(0, 3),
    ].slice(0, 4),
  };
}

function clarifyFor(text: string, mode?: Mode, answers?: ClarifyAnswer[]): ClarifyPayload {
  if (isVague(text)) return genericClarify(text);
  const questions = buildClarifyQuestions(text, mode, answers);
  if (questions.length === 0) return genericClarify(text);
  return { intro: clarifyIntro(text), questions };
}

interface PageRequestState {
  feasibility: PageFeasibility | null;
  choice?: PageChoice;
}

/**
 * Work out whether the original request exceeds the free-tier page budget and
 * whether the user has already made a feasibility choice. The original number
 * is never silently replaced; a choice must be explicit (or "just do it").
 */
function pageRequestState(input: RouteInput, text: string): PageRequestState {
  const users = input.messages.filter(
    (message) => message.role === "user" && message.content.trim()
  );
  const first = users[0]?.content ?? text;
  const laterText = users.slice(1).map((message) => message.content).join("\n");
  const structured = answersToText(input.answers);
  const answerText = [laterText, structured].filter(Boolean).join("\n");

  const original = requestedPageCount(first) ?? requestedPageCount(laterText);
  const answerPages = requestedPageCount(answerText);
  const resolvedSmaller =
    answerPages !== undefined && answerPages <= FREE_TIER_MAX_PAGES;
  const feasibility =
    !resolvedSmaller && original !== undefined && original > FREE_TIER_MAX_PAGES
      ? pageFeasibility(`${original} pages`)
      : null;
  // Re-stating an oversized number means "give me the full outline", which is
  // the only honest way to deliver 100 pages in one run.
  const insisted =
    !resolvedSmaller &&
    original !== undefined &&
    answerPages !== undefined &&
    answerPages >= original;
  const choice = resolvedSmaller
    ? undefined
    : (pageChoice(answerText) ?? (insisted ? "outline" : undefined));

  return { feasibility, choice };
}

/** One clarify batch: the feasibility question first, then unanswered scoping. */
function feasibilityClarify(
  text: string,
  mode: Mode | undefined,
  answers: ClarifyAnswer[] | undefined,
  feasibility: PageFeasibility
): ClarifyPayload {
  const base: ClarifyPayload = isVague(text)
    ? genericClarify(text)
    : (() => {
        const questions = buildClarifyQuestions(text, mode, answers);
        return questions.length > 0
          ? { intro: clarifyIntro(text), questions }
          : genericClarify(text);
      })();

  const answered = new Set((answers ?? []).map((answer) => answer.questionId));
  const questions = [
    feasibility.question,
    ...base.questions.filter(
      (question) => question.id !== "feasibility" && !answered.has(question.id)
    ),
  ].slice(0, 4);

  return {
    intro: base.intro,
    notice: feasibility.notice,
    questions,
  };
}

function scopedHeading(text: string): string | undefined {
  const match = text.match(SCOPED_RESEARCH);
  if (!match) return undefined;
  const value = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? "").trim();
  return value.length >= 2 ? value.slice(0, 120) : undefined;
}

/** Route a validated request to one of the five contract intents. */
export function routeRequest(input: RouteInput): RouteResult {
  const text = lastUser(input.messages);
  if (!text) {
    return { intent: "clarify", clarify: genericClarify("") };
  }

  if (input.hasReport) {
    // Scoped research first: it is a research intent, not a full restart.
    const scope = scopedHeading(text);
    if (scope && !EDIT_CUES.test(text)) {
      return { intent: "research", topic: extractTopic(input.messages), scope, autoApprove: true };
    }

    // An explicit new research request wins over a follow-up.
    if (EXPLICIT_RESEARCH.test(text) || NEW_RESEARCH.test(text)) {
      return { intent: "research", topic: extractTopic(input.messages), autoApprove: true };
    }

    if (EDIT_CUES.test(text)) {
      return { intent: "edit_report", instruction: text };
    }

    return { intent: "followup", question: text };
  }

  // No finished report yet.
  if (input.spec) {
    // The client sends the spec that is currently on the proposal card. If the
    // user approves it, run; otherwise treat the message as a revision.
    if (isApproval(text)) {
      return { intent: "research", topic: input.spec.topic, autoApprove: true };
    }
    return {
      intent: "research",
      topic: input.spec.topic,
      proposalEdit: true,
      instruction: text,
    };
  }

  // Oversized page requests are resolved honestly before any proposal exists.
  const pages = pageRequestState(input, text);
  if (pages.feasibility && !pages.choice) {
    if (isJustDoIt(text) || isApproval(text)) {
      // "Just do it" means the comprehensive option at the free-tier budget,
      // but the user still sees the final target on the proposal card.
      return { intent: "research", topic: extractTopic(input.messages) };
    }
    return {
      intent: "clarify",
      clarify: feasibilityClarify(text, input.mode, input.answers, pages.feasibility),
    };
  }
  if (pages.feasibility && pages.choice) {
    // A valid choice still goes through the proposal so the final target is
    // visible before the run starts.
    return { intent: "research", topic: extractTopic(input.messages) };
  }

  if (META_CHAT.test(text) && words(text).length <= 8) {
    return { intent: "chat" };
  }

  if (isJustDoIt(text)) {
    return { intent: "research", topic: extractTopic(input.messages), autoApprove: true };
  }

  // At most one clarify batch. Once the user has answered, move to a proposal.
  if (hasScopingAnswers(input.messages, input.answers)) {
    return { intent: "research", topic: extractTopic(input.messages) };
  }

  if (needsClarification(text, input.mode)) {
    return { intent: "clarify", clarify: clarifyFor(text, input.mode, input.answers) };
  }

  // Length, audience and focus are already specified: skip scoping AND the
  // proposal card, and start immediately.
  const isComparison = detectComparison(text);
  const isQuestion = QUESTION_START.test(text);
  const substantive = words(text).length >= 3;

  if (
    EXPLICIT_RESEARCH.test(text) ||
    RESEARCH_SIGNAL.test(text) ||
    isComparison ||
    (isQuestion && substantive) ||
    words(text).length >= 3
  ) {
    return { intent: "research", topic: extractTopic(input.messages), autoApprove: true };
  }

  return { intent: "chat" };
}

export function hasReport(request: { report?: unknown }): boolean {
  return Boolean(request.report && typeof request.report === "object");
}
