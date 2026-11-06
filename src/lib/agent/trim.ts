/**
 * Dependency-free conversation trimming.
 *
 * Lives in its own module so prompt builders can import it without pulling in
 * the stored-chat helpers (and their dependency on spec normalisation), which
 * would create an import cycle.
 */

import type { AgentMessage } from "../contract";

export interface TrimOptions {
  /** Total character budget for returned message contents. */
  maxChars?: number;
  /** Number of recent messages kept verbatim. Default 10. */
  keepLast?: number;
  /** Characters reserved for the report/spec/system prompt. */
  reservedChars?: number;
}

export interface TrimResult {
  messages: AgentMessage[];
  /** Number of older messages folded into the summary. */
  removed: number;
  /** Deterministic summary of the removed turns, or undefined. */
  summary?: string;
}

function totalChars(messages: AgentMessage[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function summarize(messages: AgentMessage[]): string {
  const lines: string[] = [];
  const users = messages.filter((message) => message.role === "user");
  const first = users[0];
  const last = users.at(-1);

  lines.push(
    `Earlier conversation summary (${messages.length} message${messages.length === 1 ? "" : "s"} omitted).`
  );
  if (first) lines.push(`The user first asked: “${clip(first.content, 240)}”.`);
  if (users.length > 1) {
    const middle = users.slice(1, -1).slice(-4);
    if (middle.length > 0) {
      lines.push(
        `They then discussed: ${middle.map((message) => `“${clip(message.content, 120)}”`).join("; ")}.`
      );
    }
  }
  if (last && last !== first) lines.push(`Most recent omitted request: “${clip(last.content, 240)}”.`);
  const assistant = messages.filter((message) => message.role === "assistant").at(-1);
  if (assistant) lines.push(`The assistant last replied: “${clip(assistant.content, 200)}”.`);

  return lines.join(" ");
}

/**
 * Trim oldest turns into a summary while keeping the last `keepLast` messages
 * verbatim. The most recent user message is never dropped.
 */
export function trimConversation(
  messages: AgentMessage[],
  options: TrimOptions = {}
): TrimResult {
  const keepLast = Math.max(2, options.keepLast ?? 10);
  const reserved = Math.max(0, options.reservedChars ?? 0);
  const maxChars = Math.max(600, (options.maxChars ?? 12_000) - reserved);

  if (messages.length === 0) return { messages: [], removed: 0 };

  if (totalChars(messages) <= maxChars && messages.length <= keepLast) {
    return { messages: [...messages], removed: 0 };
  }

  const split = Math.max(0, messages.length - keepLast);
  const older = messages.slice(0, split);
  const recent = messages.slice(split);
  const summary = older.length > 0 ? summarize(older) : undefined;

  // Leave room for the deterministic summary, never letting it crowd out the
  // messages themselves.
  const summaryCost = summary ? summary.length + 1 : 0;
  const budget = Math.max(150, maxChars - summaryCost);

  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  const latestUserIndex = latestUser ? recent.indexOf(latestUser) : -1;

  const kept: Array<AgentMessage | null> = new Array(recent.length).fill(null);
  let remaining = budget;

  // The newest user message is the one instruction that must never be lost.
  // Reserve at most half of the budget so older context can still fit.
  if (latestUser && latestUserIndex >= 0) {
    const allowance = Math.max(120, Math.min(latestUser.content.length, Math.floor(budget / 2)));
    const content =
      latestUser.content.length <= allowance ? latestUser.content : clip(latestUser.content, allowance);
    kept[latestUserIndex] = { role: "user", content };
    remaining -= content.length;
  }

  // Fill the remaining budget from the newest turn backwards.
  for (let index = recent.length - 1; index >= 0 && remaining > 40; index--) {
    if (kept[index]) continue;
    const message = recent[index];
    if (!message) continue;
    const content =
      message.content.length <= remaining ? message.content : clip(message.content, remaining);
    kept[index] = { role: message.role, content };
    remaining -= content.length;
  }

  const result: AgentMessage[] = [];
  if (summary) result.push({ role: "assistant", content: summary });
  for (const message of kept) {
    if (message) result.push(message);
  }

  return { messages: result, removed: older.length, ...(summary ? { summary } : {}) };
}

/** Reserve space for the paper/spec so history trimming never evicts them. */
export function trimForReportPrompt(
  messages: AgentMessage[],
  budgetChars: number,
  reportChars: number
): TrimResult {
  return trimConversation(messages, {
    maxChars: budgetChars,
    reservedChars: reportChars,
    keepLast: 10,
  });
}
