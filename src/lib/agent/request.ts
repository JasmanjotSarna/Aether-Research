/** Zod validation for the two public POST endpoints. */

import { z } from "zod";
import type { AgentRequest, PdfRequest } from "../contract";

const sourceSchema = z.object({
  id: z.string().min(1).max(24),
  title: z.string().min(1).max(500),
  url: z.string().url().max(2048),
  domain: z.string().min(1).max(255),
  kind: z.enum(["web", "academic", "encyclopedia", "docs"]),
  snippet: z.string().max(10_000),
  credibility: z.number().min(0).max(1),
  credibilityReason: z.string().max(2_000),
  publishedAt: z.string().max(120).optional(),
});

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(30_000),
});

const reportSchema = z.object({
  title: z.string().min(1).max(400),
  markdown: z.string().min(1).max(400_000),
  sources: z.array(sourceSchema).max(120),
  version: z.number().int().min(1).max(999).optional(),
  pagesEstimated: z.number().min(1).max(80).optional(),
  changes: z.array(z.string().max(300)).max(30).optional(),
  quality: z
    .object({
      score: z.number().min(0).max(10),
      citedSources: z.number().int().min(0).max(200),
      totalSources: z.number().int().min(0).max(200),
      notes: z.array(z.string().max(500)).max(20),
    })
    .optional(),
  followups: z.array(z.string().max(300)).max(6).optional(),
});

const outlineSchema = z.object({
  heading: z.string().min(1).max(200),
  pages: z.number().min(0.1).max(100),
});

const specSchema = z.object({
  topic: z.string().min(1).max(300),
  mode: z.enum(["quick", "standard", "deep"]),
  pages: z.number().min(1).max(100),
  audience: z.string().min(1).max(120),
  purpose: z.string().min(1).max(120),
  tone: z.string().min(1).max(80),
  citationStyle: z.enum(["numbered", "apa", "ieee"]),
  language: z.string().min(1).max(60),
  focus: z.string().max(300).optional(),
  mustInclude: z.array(z.string().min(1).max(120)).max(12).optional(),
  exclude: z.array(z.string().min(1).max(120)).max(12).optional(),
  timeRange: z.string().max(80).optional(),
  outline: z.array(outlineSchema).min(1).max(24),
});

const clarifyAnswerSchema = z.object({
  questionId: z.string().min(1).max(80),
  question: z.string().max(500).optional(),
  answer: z.union([z.string().max(2_000), z.array(z.string().max(2_000)).max(12)]),
});

const agentSchema = z.object({
  chatId: z.string().min(1).max(120),
  messages: z.array(messageSchema).min(1).max(400),
  mode: z.enum(["quick", "standard", "deep"]).optional(),
  report: reportSchema.nullish(),
  spec: specSchema.nullish(),
  answers: z.array(clarifyAnswerSchema).max(12).optional(),
});

const pdfSchema = z.object({
  title: z.string().min(1).max(400),
  markdown: z.string().min(1).max(500_000),
  sources: z.array(sourceSchema).max(160),
  pages: z.number().min(1).max(100).optional(),
  citationStyle: z.enum(["numbered", "apa", "ieee"]).optional(),
});

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; status: number };

function summarize(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request body.";
  const path = issue.path.join(".");
  return path ? `Invalid request: ${path} — ${issue.message}` : `Invalid request: ${issue.message}`;
}

export function parseAgentRequest(body: unknown): ParseResult<AgentRequest> {
  const parsed = agentSchema.safeParse(body);
  if (!parsed.success) return { ok: false, message: summarize(parsed.error), status: 400 };

  const total = parsed.data.messages.reduce((sum, message) => sum + message.content.length, 0);
  if (total > 1_200_000) {
    return { ok: false, message: "Conversation is too large. Start a new chat.", status: 413 };
  }

  return {
    ok: true,
    data: {
      chatId: parsed.data.chatId,
      messages: parsed.data.messages,
      mode: parsed.data.mode,
      report: parsed.data.report ?? null,
      spec: parsed.data.spec ?? null,
      ...(parsed.data.answers ? { answers: parsed.data.answers } : {}),
    },
  };
}

export function parsePdfRequest(body: unknown): ParseResult<PdfRequest> {
  const parsed = pdfSchema.safeParse(body);
  if (!parsed.success) return { ok: false, message: summarize(parsed.error), status: 400 };

  const total = parsed.data.markdown.length + parsed.data.sources.length * 2_000;
  if (total > 1_200_000) {
    return { ok: false, message: "Report is too large to export.", status: 413 };
  }

  return { ok: true, data: parsed.data };
}

export { sourceSchema, reportSchema, specSchema, agentSchema, pdfSchema };
