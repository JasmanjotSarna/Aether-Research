import { describe, expect, it } from "vitest";
import { createSSEStream, serializeEvent } from "@/lib/sse";
import type { AgentEvent } from "@/lib/contract";

function parseEvents(raw: string): AgentEvent[] {
  return raw
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block.startsWith("data:"))
    .map((block) => JSON.parse(block.slice(5).trim()) as AgentEvent);
}

describe("SSE transport", () => {
  it("serialises exactly one JSON event per data line", () => {
    expect(serializeEvent({ type: "done" })).toBe('data: {"type":"done"}\n\n');
  });

  it("preserves newlines inside report_token text through serialisation", () => {
    const text = "First line\n\nSecond line\n- third line\n";
    const raw = serializeEvent({ type: "report_token", text });
    expect(raw.startsWith("data: ")).toBe(true);
    expect(raw.endsWith("\n\n")).toBe(true);

    const parsed = parseEvents(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ type: "report_token", text });
    expect(parsed[0]?.type === "report_token" ? parsed[0].text : "").toBe(text);
  });

  it("streams events in order", async () => {
    const response = createSSEStream(async (emit) => {
      emit({ type: "intent", intent: "chat" });
      emit({ type: "token", text: "Hello" });
      emit({ type: "done" });
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = parseEvents(await response.text());
    expect(events.map((event) => event.type)).toEqual(["intent", "token", "done"]);
  });

  it("adds the request meta to bare producer bodies", async () => {
    const response = createSSEStream(
      async (emit) => {
        emit({ type: "intent", intent: "research" });
        emit({ type: "done" });
      },
      { meta: { chatId: "chat-sse", runId: "run-sse" } }
    );

    const events = parseEvents(await response.text());
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.chatId === "chat-sse")).toBe(true);
    expect(events.every((event) => event.runId === "run-sse")).toBe(true);
  });

  it("keeps ids already present on an enveloped event", async () => {
    const response = createSSEStream(
      async (emit) => {
        emit({ type: "done", chatId: "own-chat", runId: "own-run" });
      },
      { meta: { chatId: "fallback", runId: "fallback" } }
    );

    const events = parseEvents(await response.text());
    expect(events[0]).toMatchObject({ chatId: "own-chat", runId: "own-run" });
  });

  it("sends a heartbeat with the same ids while a provider call is slow", async () => {
    const response = createSSEStream(
      async (emit) => {
        await new Promise((resolve) => setTimeout(resolve, 35));
        emit({ type: "done" });
      },
      { heartbeatMs: 10, meta: { chatId: "chat-heartbeat", runId: "run-heartbeat" } }
    );

    const events = parseEvents(await response.text());
    const heartbeats = events.filter((event) => event.type === "heartbeat");
    expect(heartbeats.length).toBeGreaterThan(0);
    for (const heartbeat of heartbeats) {
      expect(heartbeat.chatId).toBe("chat-heartbeat");
      expect(heartbeat.runId).toBe("run-heartbeat");
      if (heartbeat.type === "heartbeat") expect(heartbeat.message.length).toBeGreaterThan(0);
    }
    expect(events.at(-1)?.type).toBe("done");
  });

  it("turns an uncaught producer error into a recoverable error event", async () => {
    const response = createSSEStream(async () => {
      throw new Error("boom");
    });
    const events = parseEvents(await response.text());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", recoverable: true });
  });
});
