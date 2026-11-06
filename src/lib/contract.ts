/**
 * Aether Research — public API contract.
 *
 * This file is the single source of truth for the HTTP contract used by the
 * UI. It is intentionally dependency-free and safe to import from client
 * components.
 *
 * v2 adds Claude-style collaboration: scoping questions, a proposal that must
 * be approved before a run, report versions, section-level edits and
 * browser-stored chat types. Legacy fields (`clarify.question`,
 * `clarify.options`, `report.version` optional) are kept so older clients keep
 * compiling and rendering.
 */

export type Mode = "quick" | "standard" | "deep";

/**
 * Client-visible intent. `proposal` is reserved for client-side previews that
 * render a proposal card; the server itself emits `research` and then a
 * `proposal` event once the brief is scoped.
 */
export type Intent = "chat" | "clarify" | "research" | "followup" | "edit_report" | "proposal";

export type StepId = "plan" | "search" | "read" | "analyze" | "write" | "review";

export type StepStatus = "running" | "done" | "error";

export type SourceKind = "web" | "academic" | "encyclopedia" | "docs";

export type ToolName = "web_search" | "academic_search" | "read_page" | "fact_check";

export type ToolStatus = "running" | "done" | "error";

export type TodoStatus = "pending" | "running" | "done" | "error";

export type CitationStyle = "numbered" | "apa" | "ieee";

export interface TodoItem {
  id: string;
  label: string;
  status: TodoStatus;
}

export interface Source {
  /** Stable citation id: S1, S2, ... */
  id: string;
  title: string;
  url: string;
  domain: string;
  kind: SourceKind;
  snippet: string;
  /** 0..1 — structural reliability of the publisher, not proof of truth. */
  credibility: number;
  credibilityReason: string;
  publishedAt?: string;
}

/**
 * Everything the agent needs to run a paper without asking again. Produced by
 * scoping, editable in the proposal card, and sent back by the client once the
 * user approves it.
 */
export interface ResearchSpec {
  topic: string;
  mode: Mode;
  /** Target A4 pages, including references and the research log. */
  pages: number;
  /** e.g. "students", "executives", "general readers". */
  audience: string;
  /** e.g. "academic submission", "decision briefing", "explainer". */
  purpose: string;
  /** e.g. "academic", "neutral", "conversational", "technical". */
  tone: string;
  citationStyle: CitationStyle;
  /** Default "English". */
  language: string;
  focus?: string;
  mustInclude?: string[];
  exclude?: string[];
  /** e.g. "last 3 years", "2010–2020", "current". */
  timeRange?: string;
  outline: { heading: string; pages: number }[];
}

/** One scoping question. The UI always adds "Other / type your own" and "Decide for me". */
export interface ClarifyQuestion {
  id: string;
  question: string;
  options: string[];
  multiSelect?: boolean;
}

export interface ClarifyPayload {
  intro?: string;
  /** An honest note about a limitation the questions resolve, e.g. an oversized page request. */
  notice?: string;
  /** At most 4 questions, each with 2–4 options. */
  questions: ClarifyQuestion[];
}

/** One structured answer the client sends back after a clarify card. */
export interface ClarifyAnswer {
  questionId: string;
  question?: string;
  /** Free text or one/more selected option labels. */
  answer: string | string[];
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

/** The paper as the client sends it back. Only title/markdown/sources are required. */
export interface ReportPayload {
  title: string;
  markdown: string;
  sources: Source[];
  /** 1 for the first version. Older clients omit it. */
  version?: number;
  /**
   * Total exported A4 pages, including the cover, reference list and research
   * log. Kept for backward compatibility with older clients.
   */
  pagesEstimated?: number;
  /** Content pages of synthesised prose (~450 words/page), excluding extras. */
  pagesDelivered?: number;
  /** Target content pages the brief asked for. */
  pagesRequested?: number;
  changes?: string[];
  quality?: ReportQuality;
  followups?: string[];
}

export interface AgentRequest {
  /**
   * Client-owned conversation id. Required on every request so concurrent
   * streams can never be mistaken for one another. The server echoes it on
   * every event.
   */
  chatId: string;
  messages: AgentMessage[];
  /** Defaults to "standard". */
  mode?: Mode;
  /** Current report, if the conversation already has one. */
  report?: ReportPayload | null;
  /** Present once the user approved a proposal; skips scoping and proposal. */
  spec?: ResearchSpec | null;
  /** Structured answers from the clarify card (preferred over free text). */
  answers?: ClarifyAnswer[];
}

export interface ReportQuality {
  /** 0..10 */
  score: number;
  citedSources: number;
  totalSources: number;
  notes: string[];
}

/** The structured plan emitted by the `plan` event. */
export interface ResearchPlan {
  objective: string;
  subtopics: string[];
  queries: string[];
}

/**
 * A completed report, as stored by the client and returned in `report`.
 * `version`/`pagesEstimated` stay optional only so older clients that build a
 * report object without them keep compiling. New runs always set both.
 */
export interface ResearchReport extends ReportPayload {
  version?: number;
  quality: ReportQuality;
  followups: string[];
}

/** Identifiers echoed on every event so concurrent streams stay separated. */
export interface AgentEventMeta {
  chatId: string;
  runId: string;
}

export type AgentEventBody =
  /** Short chat title (max 6 words), emitted after the first exchange. */
  | { type: "title"; title: string }
  | { type: "intent"; intent: Intent }
  | { type: "token"; text: string }
  /**
   * Scoping questions. `questions` is the v2 shape; `question`/`options` carry
   * the first question for older clients.
   */
  | {
      type: "clarify";
      intro?: string;
      /** An honest note about a limitation the questions resolve. */
      notice?: string;
      questions: ClarifyQuestion[];
      /** Legacy mirror of the first question, always present. */
      question: string;
      /** Legacy mirror of the first question's options, always present. */
      options: string[];
    }
  /** Plan card awaiting approval. The UI sends the approved `spec` back. */
  | { type: "proposal"; spec: ResearchSpec; summary: string }
  /** One changed section during an edit or a scoped research run. */
  | { type: "section_update"; heading: string; markdown: string }
  | { type: "run"; runId: string; topic: string; mode: Mode }
  | {
      type: "step";
      id: StepId;
      status: StepStatus;
      title: string;
      detail?: string;
    }
  /** A short, first-person note describing a decision the agent actually made. */
  | { type: "thinking"; text: string }
  /** Keeps the connection alive during a long provider call. */
  | { type: "heartbeat"; message: string }
  /** The full task list, re-sent every time any item changes. */
  | { type: "todo"; items: TodoItem[] }
  /** A real tool invocation: search, read or the deterministic fact check. */
  | {
      type: "tool";
      id: string;
      name: ToolName;
      input: string;
      status: ToolStatus;
      summary?: string;
    }
  | { type: "plan"; objective: string; subtopics: string[]; queries: string[] }
  | { type: "source"; source: Source }
  | { type: "report_token"; text: string }
  | {
      type: "report";
      version: number;
      title: string;
      markdown: string;
      sources: Source[];
      /** Deterministic estimate of the exported A4 page count. */
      pagesEstimated: number;
      /** Content pages of synthesised prose actually delivered. */
      pagesDelivered: number;
      /** Content pages the approved brief asked for. */
      pagesRequested: number;
      /** Short descriptions of what changed versus the previous version. */
      changes?: string[];
      quality: ReportQuality;
      /** Exactly three suggested follow-up questions. */
      followups: string[];
    }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "done" };

type WithMeta<T> = T extends unknown ? T & AgentEventMeta : never;

/** A public event always carries `chatId` and `runId`. */
export type AgentEvent = WithMeta<AgentEventBody>;

export type AgentEventType = AgentEventBody["type"];

export interface HealthModelCheck {
  configured: string[];
  active: string[];
  dropped: string[];
  checked: boolean;
  note?: string;
}

export interface HealthResponse {
  llm: { groq: boolean; openrouter: boolean };
  search: { tavily: boolean; keyless: true };
  /** First validated model id, or "none (no LLM key)" without a key. */
  model: string;
  /** Summary of the provider `/models` validation, when it ran. */
  models?: {
    checked: boolean;
    groq?: HealthModelCheck;
    openrouter?: HealthModelCheck;
    notes: string[];
  };
}

export interface PdfRequest {
  title: string;
  markdown: string;
  sources: Source[];
  /** Target page count. The renderer gets within ±1 when the material allows. */
  pages?: number;
  citationStyle?: CitationStyle;
}

/* ------------------------------------------------------------------------- */
/* Browser-stored chats. The server is stateless; these types describe what   */
/* the client persists in IndexedDB/localStorage and replays on reopen.       */
/* ------------------------------------------------------------------------- */

export const CHAT_SCHEMA_VERSION = 1;

export interface StoredClarifyAnswer {
  questionId: string;
  question: string;
  /** Free text or chosen option(s). */
  answer: string | string[];
}

export interface StoredClarify {
  intro?: string;
  questions: ClarifyQuestion[];
  answers?: StoredClarifyAnswer[];
}

export interface StoredProposal {
  spec: ResearchSpec;
  summary: string;
  createdAt?: string;
  approved?: boolean;
}

export interface StoredToolCall {
  id: string;
  name: ToolName;
  input: string;
  status: ToolStatus;
  summary?: string;
}

/**
 * A message holds everything needed to re-render the exact original view:
 * text, clarify answers, proposal, todo snapshots, thinking notes, tool calls,
 * sources and the report version it produced.
 */
export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  updatedAt?: string;
  clarify?: StoredClarify;
  proposal?: StoredProposal;
  todos?: TodoItem[];
  thinking?: string[];
  tools?: StoredToolCall[];
  sources?: Source[];
  reportVersion?: number;
  followups?: string[];
  error?: string;
}

export interface ReportVersion {
  version: number;
  title: string;
  markdown: string;
  sources: Source[];
  createdAt: string;
  changes?: string[];
  pagesEstimated?: number;
  quality?: ReportQuality;
  followups?: string[];
}

export interface StoredChat {
  id: string;
  schemaVersion: typeof CHAT_SCHEMA_VERSION;
  title: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  mode: Mode;
  spec?: ResearchSpec | null;
  messages: StoredMessage[];
  reports: ReportVersion[];
}
