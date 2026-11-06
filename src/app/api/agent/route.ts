import { randomUUID } from "node:crypto";
import type { AgentEvent } from "@/lib/contract";
import { availableProviders } from "@/lib/llm/provider";
import { validateProviderModels } from "@/lib/llm/models";
import { resolveKeys, hasByok } from "@/lib/config";
import { createSSEStream } from "@/lib/sse";
import { parseAgentRequest } from "@/lib/agent/request";
import { routeRequest } from "@/lib/agent/router";
import { runAgent } from "@/lib/agent/runner";
import { checkResearchRate, clientIp } from "@/lib/http/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: Request): Promise<Response> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = parseAgentRequest(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.message }, { status: parsed.status });
  }

  const keys = resolveKeys(request.headers);
  const configured = availableProviders(keys);
  const validated = configured.length > 0 ? await validateProviderModels(configured) : null;
  const providers = validated?.providers ?? configured;
  const modelNotes = validated?.summary.notes ?? [];
  // One server-generated id for the whole response, including heartbeats.
  const runId = randomUUID();
  const meta = { chatId: parsed.data.chatId, runId };
  const route = routeRequest({
    messages: parsed.data.messages,
    mode: parsed.data.mode,
    hasReport: Boolean(parsed.data.report),
    spec: parsed.data.spec ?? null,
    answers: parsed.data.answers,
  });

  // Best-effort quota: six research runs per IP per hour. BYOK requests are
  // not counted. This is per serverless instance, not a global limit.
  if (route.intent === "research" && !hasByok(request.headers)) {
    const limit = checkResearchRate(clientIp(request.headers));
    if (!limit.allowed) {
      return createSSEStream(async (emit) => {
        emit({ type: "intent", intent: "research" });
        emit({
          type: "error",
          message: `Rate limit reached: ${limit.limit} research runs per hour. Try again in about ${Math.ceil(
            limit.retryAfterSeconds / 60
          )} minute${limit.retryAfterSeconds > 120 ? "s" : ""}, or add your own free key in Settings.`,
          recoverable: true,
        });
        emit({ type: "done" });
      }, { signal: request.signal, meta });
    }
  }

  return createSSEStream(
    (emit, signal) =>
      runAgent(
        parsed.data,
        {
          providers,
          tavilyKey: keys.tavily,
          runId,
          modelNotes,
        },
        emit,
        signal
      ),
    { signal: request.signal, meta }
  );
}

/** A tiny GET response so accidental browser visits explain the endpoint. */
export async function GET(): Promise<Response> {
  const event: AgentEvent = {
    type: "error",
    chatId: "example-chat",
    runId: "example-run",
    message: "POST an AgentRequest here. This endpoint streams text/event-stream.",
    recoverable: true,
  };
  return Response.json(
    {
      endpoint: "/api/agent",
      method: "POST",
      contentTypes: ["application/json"],
      response: "text/event-stream",
      exampleEvent: event,
    },
    { status: 405 }
  );
}
