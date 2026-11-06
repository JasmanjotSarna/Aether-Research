/**
 * Provider model validation.
 *
 * A model id that no longer exists produces a confusing "HTTP 404" deep inside
 * a run. Here we ask each provider's `/models` endpoint once, cache the answer,
 * drop ids the provider does not know, and fall back to a free model that it
 * does know. Validation is best-effort: if `/models` itself is unreachable we
 * keep the configured provider rather than blocking the whole app.
 */

import type { KeyBundle } from "../config";
import { DEFAULT_GROQ_MODEL, DEFAULT_OPENROUTER_MODEL } from "../config";
import { ProviderError } from "../errors";
import { fetchWithTimeout, isAbort } from "../net";
import { availableProviders, providerLabel, type LLMProvider, type ProviderName } from "./provider";

export interface ProviderModelCheck {
  configured: string[];
  active: string[];
  dropped: string[];
  /** Configured ids replaced by a working free id. */
  fallbacks: Array<{ from: string; to: string }>;
  checked: boolean;
  error?: string;
}

export interface ModelValidationSummary {
  checked: boolean;
  groq?: ProviderModelCheck;
  openrouter?: ProviderModelCheck;
  notes: string[];
}

export interface ValidatedProviders {
  providers: LLMProvider[];
  summary: ModelValidationSummary;
}

interface CacheEntry {
  ids: string[] | null;
  fetchedAt: number;
  error?: string;
}

const CACHE_TTL_MS = 10 * 60_000;
const MODEL_TIMEOUT_MS = 10_000;
const cache = new Map<string, CacheEntry>();

/** Test/restart hook: forget every cached `/models` response. */
export function resetModelCache(): void {
  cache.clear();
}

export function modelsEndpoint(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return `${trimmed.slice(0, -"/chat/completions".length)}/models`;
  }
  return `${trimmed}/models`;
}

function cacheKey(provider: LLMProvider): string {
  return `${provider.name}|${provider.endpoint}|${provider.apiKey}`;
}

function extractModelIds(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const list = (data as { data?: unknown }).data;
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const id = (item as { id?: unknown }).id;
      return typeof id === "string" ? id.trim() : "";
    })
    .filter(Boolean);
}

async function fetchModelIds(provider: LLMProvider): Promise<CacheEntry> {
  const key = cacheKey(provider);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  let entry: CacheEntry = { ids: null, fetchedAt: Date.now() };
  try {
    const response = await fetchWithTimeout(
      modelsEndpoint(provider.endpoint),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          ...(provider.name === "openrouter"
            ? {
                "HTTP-Referer": process.env.APP_URL ?? "https://aether-research.vercel.app",
                "X-Title": process.env.APP_NAME ?? "Aether Research",
              }
            : {}),
        },
      },
      MODEL_TIMEOUT_MS
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      entry = {
        ids: null,
        fetchedAt: Date.now(),
        error: `${providerLabel(provider)} /models returned HTTP ${response.status}${
          body ? `: ${body.slice(0, 160).replace(/\s+/g, " ")}` : ""
        }`,
      };
    } else {
      const ids = extractModelIds(await response.json().catch(() => null));
      entry = {
        ids: ids.length > 0 ? ids : null,
        fetchedAt: Date.now(),
        ...(ids.length === 0 ? { error: `${providerLabel(provider)} /models returned no ids` } : {}),
      };
    }
  } catch (error) {
    if (isAbort(error)) {
      entry = { ids: null, fetchedAt: Date.now(), error: `${providerLabel(provider)} /models timed out` };
    } else {
      const message = error instanceof ProviderError ? error.message : "network error";
      entry = {
        ids: null,
        fetchedAt: Date.now(),
        error: `${providerLabel(provider)} /models unavailable (${message})`,
      };
    }
  }

  cache.set(key, entry);
  return entry;
}

/** Groq model ids that look like chat models, not audio or guard models. */
function usableGroqModels(ids: string[], configured: string[]): string[] {
  const withoutConfigured = ids.filter((id) => !configured.includes(id));
  const banned = /(whisper|tts|guard|embed|moderation|prompt-guard)/i;
  const preferred = withoutConfigured.filter(
    (id) => !banned.test(id) && /(llama|mixtral|gemma|qwen|deepseek|kimi|mistral)/i.test(id)
  );
  const rest = withoutConfigured.filter((id) => !banned.test(id) && !preferred.includes(id));
  return [...preferred, ...rest];
}

function usableOpenRouterModels(ids: string[]): string[] {
  return ids.filter((id) => id.endsWith(":free"));
}

function cloneProvider(
  provider: LLMProvider,
  model: string,
  ids: string[] | null
): LLMProvider {
  const jsonModel =
    provider.jsonModel === provider.model
      ? model
      : ids && !ids.includes(provider.jsonModel)
        ? model
        : provider.jsonModel;
  return { ...provider, model, jsonModel };
}

function emptyCheck(): ProviderModelCheck {
  return { configured: [], active: [], dropped: [], fallbacks: [], checked: false };
}

/**
 * Validate every configured provider against its `/models` endpoint.
 * Invalid ids are replaced by a working free id, or dropped when none exists.
 */
export async function validateProviderModels(
  providers: LLMProvider[]
): Promise<ValidatedProviders> {
  const byName = new Map<ProviderName, ProviderModelCheck>();
  const active: LLMProvider[] = [];
  const notes: string[] = [];

  for (const provider of providers) {
    const check = byName.get(provider.name) ?? emptyCheck();
    check.configured.push(provider.model);
    byName.set(provider.name, check);
  }

  for (const provider of providers) {
    const check = byName.get(provider.name);
    if (!check) continue;

    const entry = await fetchModelIds(provider);
    if (!entry.ids) {
      check.checked = false;
      if (entry.error) check.error = entry.error;
      active.push(provider);
      check.active.push(provider.model);
      continue;
    }

    check.checked = true;
    const configured = check.configured;

    // OpenRouter's zero-cost router is a valid id even though it may not be
    // listed as a concrete model.
    if (provider.name === "openrouter" && provider.model === DEFAULT_OPENROUTER_MODEL) {
      active.push(provider);
      check.active.push(provider.model);
      continue;
    }

    if (entry.ids.includes(provider.model)) {
      active.push(provider);
      check.active.push(provider.model);
      continue;
    }

    const candidates =
      provider.name === "groq"
        ? [...(entry.ids.includes(DEFAULT_GROQ_MODEL) ? [DEFAULT_GROQ_MODEL] : []), ...usableGroqModels(entry.ids, configured)]
        : [DEFAULT_OPENROUTER_MODEL, ...usableOpenRouterModels(entry.ids)];
    const replacement = candidates.find((id) => id && id !== provider.model);

    if (replacement) {
      const next = cloneProvider(provider, replacement, entry.ids);
      active.push(next);
      check.active.push(next.model);
      check.fallbacks.push({ from: provider.model, to: next.model });
      continue;
    }

    check.dropped.push(provider.model);
  }

  for (const [name, check] of byName) {
    if (!check.checked) {
      if (check.error) notes.push(check.error);
      continue;
    }
    for (const fallback of check.fallbacks) {
      const label = name === "groq" ? "Groq" : "OpenRouter";
      notes.push(`${label} model ${fallback.from} does not exist; using ${fallback.to}.`);
    }
    for (const dropped of check.dropped) {
      const label = name === "groq" ? "Groq" : "OpenRouter";
      notes.push(`${label} model ${dropped} does not exist and was dropped.`);
    }
  }

  if (providers.length > 0 && active.length === 0) {
    notes.push("No configured model id is available at the provider; add a working free model in Settings.");
  }

  return {
    providers: active,
    summary: {
      checked: Array.from(byName.values()).some((check) => check.checked),
      ...(byName.get("groq") ? { groq: byName.get("groq") } : {}),
      ...(byName.get("openrouter") ? { openrouter: byName.get("openrouter") } : {}),
      notes: Array.from(new Set(notes)).slice(0, 8),
    },
  };
}

/** Convenience for the health route and the agent route. */
export async function validatedProviders(keys: KeyBundle): Promise<ValidatedProviders> {
  return validateProviderModels(availableProviders(keys));
}
