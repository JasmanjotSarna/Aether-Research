/**
 * Plain-fetch client for OpenAI-compatible chat endpoints.
 *
 * Order: Groq free tier first, then every configured free OpenRouter model.
 * Failover happens on 429, 5xx, timeouts, network errors and rejected keys.
 * A 429 is retried once on the same provider when `retry-after` asks for a
 * short wait; otherwise the next provider is tried immediately and the caller
 * is told why so it can surface a `thinking` event. If a streaming fallback
 * fails after tokens were already emitted, we do not restart (that would
 * duplicate text); the partial text is returned instead.
 */

import { ProviderError, redactSecrets } from "../errors";
import { fetchWithTimeout, isAbort } from "../net";
import { providerId, providerLabel, type LLMProvider } from "./provider";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Use the provider's small/fast JSON model. */
  json?: boolean;
  /** Called when a provider is skipped or fails over to the next one. */
  onFailover?: (info: FailoverInfo) => void;
}

export interface FailoverInfo {
  from: string;
  to?: string;
  reason: string;
  status?: number;
  retryAfterSeconds?: number;
}

export interface CompletionResult {
  content: string;
  provider: LLMProvider;
}

export interface StreamResult {
  text: string;
  provider: LLMProvider;
  /** True when a provider failed after emitting some text. */
  partial: boolean;
  error?: Error;
}

const DEFAULT_COMPLETE_TIMEOUT = 60_000;
const DEFAULT_STREAM_TIMEOUT = 60_000;
/**
 * A 429 is retried on the same provider when `retry-after` is short enough.
 * Longer waits fail over immediately so the user sees progress instead of a
 * silent two-minute pause.
 */
const MAX_SAME_PROVIDER_WAIT_MS = 20_000;
const DEFAULT_429_WAIT_MS = 700;
const MAX_ATTEMPTS = 3;

function authHeaders(provider: LLMProvider): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${provider.apiKey}`,
  };
  if (provider.name === "openrouter") {
    // Required/strongly recommended by OpenRouter for attribution.
    headers["HTTP-Referer"] = process.env.APP_URL ?? "https://aether-research.vercel.app";
    headers["X-Title"] = process.env.APP_NAME ?? "Aether Research";
  }
  return headers;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(86_400, Math.round(seconds));
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.min(86_400, Math.round((date - Date.now()) / 1000)));
  }
  return undefined;
}

/** Pull a short human message out of a provider error body, without secrets. */
function providerDetail(body: string): string | undefined {
  if (!body.trim()) return undefined;
  let message = body;
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown } | string;
      message?: unknown;
    };
    if (typeof parsed.error === "string") message = parsed.error;
    else if (parsed.error && typeof parsed.error.message === "string") message = parsed.error.message;
    else if (typeof parsed.message === "string") message = parsed.message;
  } catch {
    // Not JSON: keep the raw body but trim it.
  }
  const clean = redactSecrets(message).replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, 160) : undefined;
}

async function request(
  provider: LLMProvider,
  messages: ChatMessage[],
  options: CompletionOptions & { stream: boolean }
): Promise<Response> {
  const timeoutMs =
    options.timeoutMs ?? (options.stream ? DEFAULT_STREAM_TIMEOUT : DEFAULT_COMPLETE_TIMEOUT);
  const body: Record<string, unknown> = {
    model: options.json ? provider.jsonModel : provider.model,
    messages,
    stream: options.stream,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? provider.maxOutputTokens,
  };

  try {
    const response = await fetchWithTimeout(
      provider.endpoint,
      {
        method: "POST",
        headers: authHeaders(provider),
        body: JSON.stringify(body),
      },
      timeoutMs,
      options.signal
    );
    if (!response.ok) {
      const retryable =
        response.status === 429 ||
        response.status === 408 ||
        response.status === 409 ||
        response.status >= 500;
      const body = await response.text().catch(() => "");
      const detail = providerDetail(body);
      throw new ProviderError(provider.name, `HTTP ${response.status}`, {
        status: response.status,
        retryable,
        retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
        ...(detail ? { detail } : {}),
      });
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (isAbort(error)) {
      if (options.signal?.aborted) throw error;
      throw new ProviderError(provider.name, "Request timed out", { retryable: true });
    }
    throw new ProviderError(provider.name, "Network failure", { retryable: true });
  }
}

function waitForRetry(
  error: Error,
  signal?: AbortSignal,
  attempt = 0
): Promise<void> | null {
  if (!(error instanceof ProviderError) || error.status !== 429) return null;
  const seconds = error.retryAfterSeconds;
  const requested = seconds === undefined ? undefined : seconds * 1000;
  const backoff = Math.min(DEFAULT_429_WAIT_MS * 2 ** attempt, 8_000);
  const delay = requested === undefined ? backoff : requested;
  // Respect a long retry-after by failing over instead of freezing the run.
  if (delay > MAX_SAME_PROVIDER_WAIT_MS) return null;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delay);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true }
      );
    }
  });
}

function describeFailure(error: Error): string {
  if (error instanceof ProviderError) {
    const detail = error.detail ? `: ${error.detail}` : "";
    if (error.status === 429) {
      const wait =
        error.retryAfterSeconds !== undefined ? `, retry-after ${error.retryAfterSeconds}s` : "";
      return `429 rate limit${wait}${detail}`;
    }
    if (error.status) return `HTTP ${error.status}${detail}`;
    return `${error.message}${detail}`;
  }
  return error.message;
}

function notifyFailover(
  options: CompletionOptions,
  failed: LLMProvider,
  next: LLMProvider | undefined,
  error: Error
): void {
  options.onFailover?.({
    from: providerId(failed),
    ...(next ? { to: providerId(next) } : {}),
    reason: describeFailure(error),
    ...(error instanceof ProviderError && error.status !== undefined
      ? { status: error.status }
      : {}),
    ...(error instanceof ProviderError && error.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: error.retryAfterSeconds }
      : {}),
  });
}

/** One non-streaming provider call. */
export async function completeOnce(
  provider: LLMProvider,
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<string> {
  const response = await request(provider, messages, { ...options, stream: false });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ProviderError(provider.name, "Provider returned invalid JSON", { retryable: true });
  }
  const content = extractMessageContent(data);
  if (!content) {
    throw new ProviderError(provider.name, "Provider returned an empty response", {
      retryable: true,
    });
  }
  return content;
}

function extractMessageContent(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : ""
      )
      .join("");
  }
  return "";
}

/** Try providers in order for a short non-streaming call. */
export async function completeWithFallback(
  providers: LLMProvider[],
  build: (provider: LLMProvider) => ChatMessage[],
  options: CompletionOptions = {}
): Promise<CompletionResult | null> {
  let lastError: Error | undefined;

  for (let index = 0; index < providers.length; index++) {
    const provider = providers[index];
    if (!provider) continue;
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const content = await completeOnce(provider, build(provider), options);
        return { content, provider };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (isAbort(error) && options.signal?.aborted) throw error;

        const retry =
          attempt < MAX_ATTEMPTS - 1 ? waitForRetry(lastError, options.signal, attempt) : null;
        if (retry) {
          try {
            await retry;
            continue;
          } catch (abortError) {
            throw abortError;
          }
        }
        break;
      }
    }

    const next = providers[index + 1];
    if (lastError) notifyFailover(options, provider, next, lastError);
  }

  if (lastError) throw lastError;
  return null;
}

/** Extract the first JSON object from a model response (handles code fences). */
export function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? content;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model response");
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Try providers in order and validate the JSON payload using the small model. */
export async function completeJsonWithFallback<T>(
  providers: LLMProvider[],
  build: (provider: LLMProvider) => ChatMessage[],
  validate: (value: unknown) => T | null,
  options: CompletionOptions = {}
): Promise<{ data: T; provider: LLMProvider } | null> {
  let lastError: Error | undefined;

  for (let index = 0; index < providers.length; index++) {
    const provider = providers[index];
    if (!provider) continue;
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const content = await completeOnce(provider, build(provider), { ...options, json: true });
        const parsed = validate(extractJson(content));
        if (parsed) return { data: parsed, provider };
        lastError = new Error("Provider returned unusable JSON");
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (isAbort(error) && options.signal?.aborted) throw error;

        const retry =
          attempt < MAX_ATTEMPTS - 1 ? waitForRetry(lastError, options.signal, attempt) : null;
        if (retry) {
          try {
            await retry;
            continue;
          } catch (abortError) {
            throw abortError;
          }
        }
        break;
      }
    }

    const next = providers[index + 1];
    if (lastError) notifyFailover(options, provider, next, lastError);
  }

  return null;
}

export interface StreamOptions extends CompletionOptions {
  onToken: (text: string) => void;
}

/** Try providers in order for a streaming call. */
export async function streamWithFallback(
  providers: LLMProvider[],
  build: (provider: LLMProvider) => ChatMessage[],
  options: StreamOptions
): Promise<StreamResult | null> {
  let lastError: Error | undefined;

  for (let index = 0; index < providers.length; index++) {
    const provider = providers[index];
    if (!provider) continue;
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    let emitted = "";

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const response = await request(provider, build(provider), {
          ...options,
          json: false,
          stream: true,
        });
        emitted = await readStream(
          response,
          (text) => {
            options.onToken(text);
          },
          options.signal
        );
        return { text: emitted, provider, partial: false };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (isAbort(error) && options.signal?.aborted) throw error;
        if (emitted.length > 0) {
          return { text: emitted, provider, partial: true, error: lastError };
        }

        const retry =
          attempt < MAX_ATTEMPTS - 1 ? waitForRetry(lastError, options.signal, attempt) : null;
        if (retry) {
          try {
            await retry;
            continue;
          } catch (abortError) {
            throw abortError;
          }
        }
        break;
      }
    }

    const next = providers[index + 1];
    if (lastError) notifyFailover(options, provider, next, lastError);
  }

  if (lastError) throw lastError;
  return null;
}

async function readStream(
  response: Response,
  onToken: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body has no reader");

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let text = "";

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) return false;
    if (!trimmed.startsWith("data:")) return false;
    const payload = trimmed.slice(5).trim();
    if (!payload) return false;
    if (payload === "[DONE]") return true;

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return false;
    }

    const asError = parsed as { error?: { message?: string } | string };
    if (asError.error) {
      const detail =
        typeof asError.error === "string"
          ? asError.error
          : typeof asError.error.message === "string"
            ? asError.error.message
            : "";
      throw new ProviderError("provider", "Provider stream error", {
        retryable: true,
        ...(detail ? { detail: redactSecrets(detail).slice(0, 160) } : {}),
      });
    }

    const choices = (parsed as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) return false;
    const delta = (choices[0] as { delta?: { content?: unknown } }).delta;
    const content = delta?.content;
    if (typeof content === "string" && content.length > 0) {
      text += content;
      onToken(content);
    }
    return false;
  };

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (consumeLine(line)) return text;
      }
    }
    if (buffer) consumeLine(buffer);
    return text;
  } catch (error) {
    if (isAbort(error) && signal?.aborted) throw error;
    throw error;
  }
}

/** Human label used by the UI/tests for the currently active provider. */
export function providerName(provider: LLMProvider): string {
  return providerLabel(provider);
}
