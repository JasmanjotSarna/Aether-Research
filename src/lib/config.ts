/**
 * Runtime configuration. Nothing in this module is logged or returned to the
 * client except booleans. BYOK headers override server environment keys on a
 * per-provider basis.
 *
 * Providers are free-only by design:
 *   Primary   — Groq free tier (GROQ_API_KEY / GROQ_MODEL).
 *   Secondary — OpenRouter free models (OPENROUTER_API_KEY / OPENROUTER_MODELS).
 *               Any id that is not "openrouter/free" or "<model>:free" is
 *               ignored, so a misconfigured paid model can never be billed.
 */

import type { HealthResponse, Mode } from "./contract";

export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
/** OpenRouter's zero-cost router. Used when OPENROUTER_MODELS is empty. */
export const DEFAULT_OPENROUTER_MODEL = "openrouter/free";

export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Timeouts shared by every layer of a run. */
export const SEARCH_TIMEOUT_MS = 12_000;
export const READ_TIMEOUT_MS = 8_000;
export const LLM_TIMEOUT_MS = 60_000;

/** A paper needs at least this many relevant sources; below it we refuse to pad. */
export const MIN_RELEVANT_SOURCES = 3;

export const BYOK_HEADERS = {
  groq: "x-groq-key",
  openrouter: "x-openrouter-key",
  tavily: "x-tavily-key",
} as const;

export interface KeyBundle {
  groq?: string;
  openrouter?: string;
  tavily?: string;
}

function clean(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512) return undefined;
  // Keys are opaque; reject control characters only.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  return trimmed;
}

function cleanModel(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160) return undefined;
  if (!/^[a-zA-Z0-9._/:@+-]+$/.test(trimmed)) return undefined;
  return trimmed;
}

/** Read optional BYOK headers. Never log the result. */
export function keysFromHeaders(headers: Headers): KeyBundle {
  return {
    groq: clean(headers.get(BYOK_HEADERS.groq)),
    openrouter: clean(headers.get(BYOK_HEADERS.openrouter)),
    tavily: clean(headers.get(BYOK_HEADERS.tavily)),
  };
}

export function hasByok(headers: Headers): boolean {
  const keys = keysFromHeaders(headers);
  return Boolean(keys.groq || keys.openrouter || keys.tavily);
}

export function envKeys(): KeyBundle {
  return {
    groq: clean(process.env.GROQ_API_KEY),
    openrouter: clean(process.env.OPENROUTER_API_KEY),
    tavily: clean(process.env.TAVILY_API_KEY),
  };
}

/** BYOK wins over the server key for the same provider. */
export function resolveKeys(headers: Headers): KeyBundle {
  const env = envKeys();
  const byok = keysFromHeaders(headers);
  return {
    groq: byok.groq ?? env.groq,
    openrouter: byok.openrouter ?? env.openrouter,
    tavily: byok.tavily ?? env.tavily,
  };
}

export function groqModel(): string {
  return cleanModel(process.env.GROQ_MODEL) ?? DEFAULT_GROQ_MODEL;
}

/**
 * Optional small/fast model for the planner and other JSON calls. When unset
 * the main Groq model is used, which keeps configuration to one variable.
 */
export function groqJsonModel(): string {
  return cleanModel(process.env.GROQ_JSON_MODEL) ?? groqModel();
}

/**
 * True only for OpenRouter models that cost nothing. This is the guard that
 * keeps the deployment at ₹0 even if a paid model id is configured by mistake.
 */
export function isFreeOpenRouterModel(model: string): boolean {
  return model === DEFAULT_OPENROUTER_MODEL || model.endsWith(":free");
}

/**
 * OpenRouter models, in the order they were configured. Paid ids are dropped;
 * duplicates are removed. When no list is configured the free router is used.
 */
export function openRouterModels(): string[] {
  const raw = process.env.OPENROUTER_MODELS ?? process.env.OPENROUTER_MODEL ?? "";
  const models = raw
    .split(",")
    .map((model) => cleanModel(model))
    .filter((model): model is string => Boolean(model) && isFreeOpenRouterModel(model as string));

  const unique = Array.from(new Set(models));
  return unique.length > 0 ? unique.slice(0, 4) : [DEFAULT_OPENROUTER_MODEL];
}

/** The first configured free OpenRouter model. */
export function openRouterModel(): string {
  return openRouterModels()[0] ?? DEFAULT_OPENROUTER_MODEL;
}

/**
 * Optional small/fast OpenRouter model for JSON calls. Must itself be a free
 * id; otherwise the first configured model is used.
 */
export function openRouterJsonModel(): string {
  const configured = cleanModel(process.env.OPENROUTER_JSON_MODEL);
  return configured && isFreeOpenRouterModel(configured) ? configured : openRouterModel();
}

export function groqEndpoint(): string {
  return clean(process.env.GROQ_BASE_URL) ?? GROQ_ENDPOINT;
}

export function openRouterEndpoint(): string {
  return clean(process.env.OPENROUTER_BASE_URL) ?? OPENROUTER_ENDPOINT;
}

export interface ModeConfig {
  mode: Mode;
  label: string;
  description: string;
  queryCount: number;
  targetSources: number;
  readPages: number;
  includeAcademic: boolean;
  reportWords: number;
}

export const MODES: Record<Mode, ModeConfig> = {
  quick: {
    mode: "quick",
    label: "Quick",
    description: "Fast, focused paper from a handful of sources.",
    queryCount: 2,
    targetSources: 4,
    readPages: 0,
    includeAcademic: true,
    reportWords: 600,
  },
  standard: {
    mode: "standard",
    label: "Standard",
    description: "Balanced multi-source paper with page reading.",
    queryCount: 4,
    targetSources: 8,
    readPages: 4,
    includeAcademic: true,
    reportWords: 1500,
  },
  deep: {
    mode: "deep",
    label: "Deep",
    description:
      "Wide search including academic literature, more pages read, section-by-section paper.",
    queryCount: 6,
    targetSources: 12,
    readPages: 8,
    includeAcademic: true,
    reportWords: 3000,
  },
};

export function modeConfig(mode: Mode | undefined): ModeConfig {
  return MODES[mode ?? "standard"] ?? MODES.standard;
}

export function healthSnapshot(): HealthResponse {
  const env = envKeys();
  const model = env.groq ? groqModel() : env.openrouter ? openRouterModel() : "none (no LLM key)";

  return {
    llm: {
      groq: Boolean(env.groq),
      openrouter: Boolean(env.openrouter),
    },
    search: { tavily: Boolean(env.tavily), keyless: true },
    model,
  };
}
