/** Public error helpers. Secrets are redacted before anything reaches the client. */

export class ProviderError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly provider: string;
  /** Seconds requested by a `retry-after` header, when present. */
  readonly retryAfterSeconds?: number;
  /** Short, redacted provider message, e.g. "model not found". */
  readonly detail?: string;

  constructor(
    provider: string,
    message: string,
    options: {
      status?: number;
      retryable?: boolean;
      retryAfterSeconds?: number;
      detail?: string;
    } = {}
  ) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = options.status;
    this.retryable = options.retryable ?? true;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.detail = options.detail;
  }
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const SECRET_PATTERNS: RegExp[] = [
  /(?:gsk|sk-or|tvly|AIza)[-_a-zA-Z0-9]{8,}/g,
  /api[_-]?key["'\s:=]+[^\s"',}]+/gi,
  /authorization["'\s:=]+bearer\s+[^\s"',}]+/gi,
];

export function redactSecrets(input: string): string {
  let value = input;
  for (const pattern of SECRET_PATTERNS) value = value.replace(pattern, "[redacted]");
  return value;
}

/** Human-facing, safe error text. Never includes keys or raw provider bodies. */
export function friendlyError(error: unknown): string {
  if (error instanceof ProviderError) {
    if (error.status === 429) {
      return "Free quota reached on the configured models. Try again in a minute, or add your own free Groq or OpenRouter key in Settings.";
    }
    if (error.status === 401 || error.status === 403) {
      return "An API key was rejected by its provider. Check the key in Settings.";
    }
    if (!error.status) {
      return "Could not reach the model providers. Check your connection and try again.";
    }
    return "The model providers returned an error. Please try again in a moment.";
  }
  if (error instanceof UnsafeUrlError) return "That URL was blocked by the safety check.";
  if (error instanceof Error) {
    const message = redactSecrets(error.message || "").trim();
    if (!message) return "Something went wrong. Please try again.";
    return message.slice(0, 400);
  }
  return "Something went wrong. Please try again.";
}

export function quotaMessage(): string {
  return "Free quota reached, try again in a minute or add your own free Groq or OpenRouter key in Settings.";
}
