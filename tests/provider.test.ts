import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENROUTER_MODEL,
  healthSnapshot,
  isFreeOpenRouterModel,
  keysFromHeaders,
  openRouterModel,
  openRouterModels,
  resolveKeys,
} from "@/lib/config";
import { availableProviders, providerLabel } from "@/lib/llm/provider";

describe("provider selection", () => {
  it("returns no providers without keys", () => {
    expect(availableProviders({})).toEqual([]);
  });

  it("orders Groq before every free OpenRouter model with separate budgets", () => {
    process.env.OPENROUTER_MODELS =
      "meta-llama/llama-3.3-70b-instruct:free,google/gemma-4-31b-it:free";
    const providers = availableProviders({ groq: "q", openrouter: "o" });

    expect(providers.map((provider) => provider.name)).toEqual([
      "groq",
      "openrouter",
      "openrouter",
    ]);
    expect(providers[0]?.charBudget).toBe(14_000);
    expect(providers[1]?.charBudget).toBe(40_000);
    expect(providers[2]?.charBudget).toBe(40_000);
    expect(providers[1]?.model).toBe("meta-llama/llama-3.3-70b-instruct:free");
    expect(providers[2]?.model).toBe("google/gemma-4-31b-it:free");
    expect(providers.map(providerLabel)).toEqual(["Groq", "OpenRouter", "OpenRouter"]);
  });

  it("uses OpenRouter alone when it is the only key", () => {
    const providers = availableProviders({ openrouter: "o" });
    expect(providers).toHaveLength(1);
    expect(providers[0]?.name).toBe("openrouter");
    expect(providers[0]?.model).toBe(DEFAULT_OPENROUTER_MODEL);
  });
});

describe("OpenRouter free-only guard", () => {
  it("recognises free model ids", () => {
    expect(isFreeOpenRouterModel("openrouter/free")).toBe(true);
    expect(isFreeOpenRouterModel("nvidia/nemotron-3.5-lightning:free")).toBe(true);
  });

  it("rejects paid model ids", () => {
    expect(isFreeOpenRouterModel("openai/gpt-4o")).toBe(false);
    expect(isFreeOpenRouterModel("openrouter/auto")).toBe(false);
    expect(isFreeOpenRouterModel("anthropic/claude-3.5-sonnet")).toBe(false);
  });

  it("replaces a configured paid model with the free router", () => {
    process.env.OPENROUTER_MODEL = "openai/gpt-4o";
    expect(openRouterModel()).toBe(DEFAULT_OPENROUTER_MODEL);

    process.env.OPENROUTER_MODEL = "google/gemma-4-31b-it:free";
    expect(openRouterModel()).toBe("google/gemma-4-31b-it:free");
  });

  it("keeps only free ids from a comma-separated list and removes duplicates", () => {
    process.env.OPENROUTER_MODELS = [
      "openai/gpt-4o",
      "meta-llama/llama-3.3-70b-instruct:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "anthropic/claude-3.5-sonnet",
    ].join(",");

    expect(openRouterModels()).toEqual(["meta-llama/llama-3.3-70b-instruct:free"]);
  });
});

describe("keys and health", () => {
  it("reads the BYOK header and lets it override the env key", () => {
    process.env.OPENROUTER_API_KEY = "env-key";
    const headers = new Headers({ "x-openrouter-key": "byok-key" });
    expect(keysFromHeaders(headers).openrouter).toBe("byok-key");
    expect(resolveKeys(headers).openrouter).toBe("byok-key");
  });

  it("reports capability without exposing any key", () => {
    process.env.OPENROUTER_API_KEY = "secret-openrouter-key";
    const health = healthSnapshot();
    expect(health.llm).toEqual({ groq: false, openrouter: true });
    expect(health.search).toEqual({ tavily: false, keyless: true });
    expect(health.model).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(JSON.stringify(health)).not.toContain("secret-openrouter-key");
  });

  it("prefers the Groq model in the health snapshot", () => {
    process.env.GROQ_API_KEY = "gsk-secret";
    process.env.OPENROUTER_API_KEY = "secret-openrouter-key";
    const health = healthSnapshot();
    expect(health.llm).toEqual({ groq: true, openrouter: true });
    expect(health.model).toBe("llama-3.3-70b-versatile");
    expect(JSON.stringify(health)).not.toContain("gsk-secret");
  });

  it("reports the honest no-model state when no LLM key is configured", () => {
    expect(healthSnapshot().model).toBe("none (no LLM key)");
  });
});
