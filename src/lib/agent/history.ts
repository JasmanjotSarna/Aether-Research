/**
 * Stateless conversation helpers.
 *
 * The server keeps no chat history. Every request carries the whole
 * conversation, so long chats must be trimmed to the provider's context
 * budget without losing the report or the approved spec. The last ~10 turns
 * stay verbatim; older turns become a compact, deterministic summary.
 *
 * This module also owns tolerant (de)serialisation for browser-stored chats.
 */

import type {
  Mode,
  ReportVersion,
  ResearchSpec,
  Source,
  StoredChat,
  StoredMessage,
} from "../contract";
import { CHAT_SCHEMA_VERSION } from "../contract";
import { normalizeSpec } from "../research/spec";

export { trimConversation, trimForReportPrompt } from "./trim";
export type { TrimOptions, TrimResult } from "./trim";


/* ------------------------------------------------------------------------- */
/* Stored chat (browser) helpers                                              */
/* ------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asIso(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function asMode(value: unknown): Mode {
  return value === "quick" || value === "deep" ? value : "standard";
}

function asSource(value: unknown): Source | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const url = asString(value.url);
  const title = asString(value.title);
  if (!id || !url || !title) return null;
  const kind =
    value.kind === "academic" || value.kind === "encyclopedia" || value.kind === "docs"
      ? value.kind
      : "web";
  return {
    id,
    title,
    url,
    domain: asString(value.domain, safeDomain(url)),
    kind,
    snippet: asString(value.snippet),
    credibility:
      typeof value.credibility === "number" && Number.isFinite(value.credibility)
        ? Math.max(0, Math.min(1, value.credibility))
        : 0.5,
    credibilityReason: asString(value.credibilityReason, "Stored source"),
    ...(typeof value.publishedAt === "string" ? { publishedAt: value.publishedAt } : {}),
  };
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function asMessage(value: unknown, index: number, now: string): StoredMessage | null {
  if (!isRecord(value)) return null;
  const role = value.role === "assistant" ? "assistant" : value.role === "user" ? "user" : null;
  if (!role) return null;
  const message: StoredMessage = {
    id: asString(value.id, `msg_${index}`),
    role,
    text: asString(value.text, asString(value.content)),
    createdAt: asIso(value.createdAt, now),
  };
  if (typeof value.updatedAt === "string") message.updatedAt = asIso(value.updatedAt, message.createdAt);
  if (isRecord(value.clarify) && Array.isArray(value.clarify.questions)) {
    message.clarify = value.clarify as unknown as StoredMessage["clarify"];
  }
  if (isRecord(value.proposal)) {
    message.proposal = value.proposal as unknown as StoredMessage["proposal"];
  }
  if (Array.isArray(value.todos)) message.todos = value.todos as StoredMessage["todos"];
  if (Array.isArray(value.thinking)) {
    message.thinking = value.thinking.filter((note): note is string => typeof note === "string");
  }
  if (Array.isArray(value.tools)) message.tools = value.tools as StoredMessage["tools"];
  if (Array.isArray(value.sources)) {
    message.sources = value.sources
      .map(asSource)
      .filter((source): source is Source => source !== null);
  }
  if (typeof value.reportVersion === "number" && Number.isFinite(value.reportVersion)) {
    message.reportVersion = value.reportVersion;
  }
  if (Array.isArray(value.followups)) {
    message.followups = value.followups.filter((item): item is string => typeof item === "string");
  }
  if (typeof value.error === "string") message.error = value.error;
  return message;
}

function asVersion(value: unknown, fallbackVersion: number, now: string): ReportVersion | null {
  if (!isRecord(value)) return null;
  const title = asString(value.title);
  const markdown = asString(value.markdown);
  if (!title || !markdown) return null;
  const sources = Array.isArray(value.sources)
    ? value.sources.map(asSource).filter((source): source is Source => source !== null)
    : [];
  const version =
    typeof value.version === "number" && Number.isFinite(value.version)
      ? Math.max(1, Math.floor(value.version))
      : fallbackVersion;
  const report: ReportVersion = {
    version,
    title,
    markdown,
    sources,
    createdAt: asIso(value.createdAt, now),
  };
  if (value.pagesEstimated !== undefined) {
    const pages = Number(value.pagesEstimated);
    if (Number.isFinite(pages)) report.pagesEstimated = pages;
  }
  if (Array.isArray(value.changes)) {
    report.changes = value.changes.filter((item): item is string => typeof item === "string");
  }
  if (isRecord(value.quality)) report.quality = value.quality as unknown as ReportVersion["quality"];
  if (Array.isArray(value.followups)) {
    report.followups = value.followups.filter((item): item is string => typeof item === "string");
  }
  return report;
}

/** Create a new stored chat with sensible defaults. */
export function createStoredChat(overrides: Partial<StoredChat> = {}): StoredChat {
  const now = new Date().toISOString();
  const id = overrides.id ?? `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    schemaVersion: CHAT_SCHEMA_VERSION,
    title: overrides.title ?? "New research",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...(overrides.pinned !== undefined ? { pinned: overrides.pinned } : {}),
    mode: asMode(overrides.mode),
    spec: overrides.spec ?? null,
    messages: overrides.messages ?? [],
    reports: overrides.reports ?? [],
  };
}

/**
 * Tolerantly normalise any stored chat, including reports from an older
 * schema (missing version, pages, quality, followups, etc.).
 */
export function normalizeStoredChat(value: unknown, fallbackId = "chat_recovered"): StoredChat | null {
  if (!isRecord(value)) return null;
  const now = new Date().toISOString();
  const rawMessages = Array.isArray(value.messages) ? value.messages : [];
  const messages = rawMessages
    .map((message, index) => asMessage(message, index, now))
    .filter((message): message is StoredMessage => message !== null);
  const rawReports = Array.isArray(value.reports) ? value.reports : [];
  const reports = rawReports
    .map((report, index) => asVersion(report, index + 1, now))
    .filter((report): report is ReportVersion => report !== null);

  let spec: ResearchSpec | null = null;
  if (isRecord(value.spec)) {
    try {
      spec = normalizeSpec(value.spec as unknown as ResearchSpec);
    } catch {
      spec = null;
    }
  }

  const created = asIso(value.createdAt, now);
  const updated = asIso(value.updatedAt, created);

  return {
    id: asString(value.id, fallbackId),
    schemaVersion: CHAT_SCHEMA_VERSION,
    title: asString(value.title, "Recovered chat"),
    createdAt: created,
    updatedAt: updated,
    ...(typeof value.pinned === "boolean" ? { pinned: value.pinned } : {}),
    mode: asMode(value.mode),
    spec,
    messages,
    reports,
  };
}

export function parseStoredChat(raw: string | unknown): StoredChat | null {
  if (typeof raw === "string") {
    try {
      return normalizeStoredChat(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return normalizeStoredChat(raw);
}

export function serializeStoredChat(chat: StoredChat): string {
  return JSON.stringify(normalizeStoredChat(chat) ?? createStoredChat());
}

export function roundTripStoredChat(chat: StoredChat): StoredChat {
  return parseStoredChat(serializeStoredChat(chat)) ?? createStoredChat();
}
