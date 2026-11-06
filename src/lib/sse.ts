/**
 * Server-Sent Events transport for the agent contract.
 *
 * Each event is exactly one line: `data: <json>\n\n`.
 * A real `heartbeat` event is sent every 15 seconds so proxies keep the stream
 * open and the UI can show that work is still in progress.
 */

import type { AgentEvent, AgentEventBody, AgentEventMeta } from "./contract";

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export function serializeEvent(event: AgentEvent | AgentEventBody): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export type Emit = (event: AgentEvent) => void;
/** Producers may emit either a fully enveloped event or a bare body. */
export type StreamEmit = (event: AgentEventBody | AgentEvent) => void;

export interface SSEOptions {
  signal?: AbortSignal;
  /** Defaults to 15s. Tests can shorten it. */
  heartbeatMs?: number;
  /** Fallback identifiers for events emitted by non-agent producers. */
  meta?: AgentEventMeta;
}

/**
 * Wrap an async producer in a text/event-stream Response.
 * The producer receives an emit function and an abort signal tied to the
 * client connection. Errors are emitted as a recoverable `error` event and
 * `done` is always the final event.
 */
export function createSSEStream(
  run: (emit: StreamEmit, signal: AbortSignal) => Promise<void>,
  options: SSEOptions = {}
): Response {
  const encoder = new TextEncoder();
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const controllerRef: { current: ReadableStreamDefaultController<Uint8Array> | null } = {
    current: null,
  };
  const abort = new AbortController();
  let closed = false;

  if (options.signal) {
    if (options.signal.aborted) abort.abort();
    else options.signal.addEventListener("abort", () => abort.abort(), { once: true });
  }

  /**
   * Defensive envelope: direct producers and the agent already set these, but
   * the transport guarantees every serialized event carries both strings.
   */
  const withMeta = (event: AgentEventBody | AgentEvent): AgentEvent => {
    const partial = event as Partial<AgentEventMeta>;
    return {
      ...event,
      chatId: partial.chatId ?? options.meta?.chatId ?? "unknown",
      runId: partial.runId ?? options.meta?.runId ?? "unknown",
    } as AgentEvent;
  };

  const emit: StreamEmit = (event) => {
    if (closed || !controllerRef.current) return;
    try {
      controllerRef.current.enqueue(encoder.encode(serializeEvent(withMeta(event))));
    } catch {
      closed = true;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef.current = controller;

      const heartbeat = setInterval(() => {
        if (closed || !controllerRef.current) return;
        emit({
          type: "heartbeat",
          message: "Still working — the research run is waiting on a provider.",
        });
      }, heartbeatMs);

      try {
        await run(emit, abort.signal);
      } catch (error) {
        if (!abort.signal.aborted) {
          emit({
            type: "error",
            message: error instanceof Error ? error.message : "Unexpected error",
            recoverable: true,
          });
        }
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          try {
            controllerRef.current?.close();
          } catch {
            // already closed by the runtime
          }
        }
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
