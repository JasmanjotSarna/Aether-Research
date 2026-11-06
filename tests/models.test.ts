import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "@/lib/llm/provider";
import {
  modelsEndpoint,
  resetModelCache,
  validateProviderModels,
} from "@/lib/llm/models";
import { DEFAULT_GROQ_MODEL, DEFAULT_OPENROUTER_MODEL } from "@/lib/config";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/net")>();
  return { ...actual, fetchWithTimeout: fetchMock };
});

function provider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    name: "groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: "test-key",
    model: "retired-model",
    charBudget: 14_000,
    maxOutputTokens: 2048,
    jsonModel: "retired-model",
    ...overrides,
  };
}

function modelList(ids: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: ids.map((id) => ({ id })) }),
    text: async () => "",
  };
}

beforeEach(() => {
  resetModelCache();
  fetchMock.mockReset();
});

describe("provider model validation", () => {
  it("derives the /models endpoint from a chat-completions URL", () => {
    expect(modelsEndpoint("https://api.groq.com/openai/v1/chat/completions")).toBe(
      "https://api.groq.com/openai/v1/models"
    );
    expect(modelsEndpoint("https://openrouter.ai/api/v1/")).toBe(
      "https://openrouter.ai/api/v1/models"
    );
  });

  it("replaces a nonexistent id with a working free model", async () => {
    fetchMock.mockResolvedValue(
      modelList([DEFAULT_GROQ_MODEL, "whisper-large-v3", "llama-3.1-8b-instant"])
    );

    const result = await validateProviderModels([provider()]);

    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]?.model).toBe(DEFAULT_GROQ_MODEL);
    expect(result.providers[0]?.jsonModel).toBe(DEFAULT_GROQ_MODEL);
    expect(result.summary.checked).toBe(true);
    expect(result.summary.groq).toMatchObject({
      configured: ["retired-model"],
      active: [DEFAULT_GROQ_MODEL],
      dropped: [],
      fallbacks: [{ from: "retired-model", to: DEFAULT_GROQ_MODEL }],
      checked: true,
    });
    expect(result.summary.notes.join(" ")).toMatch(
      /Groq model retired-model does not exist; using llama-3\.3-70b-versatile\./
    );
  });

  it("keeps the configured provider when /models is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await validateProviderModels([provider()]);

    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]?.model).toBe("retired-model");
    expect(result.summary.checked).toBe(false);
    expect(result.summary.groq?.checked).toBe(false);
    expect(result.summary.notes.join(" ")).toMatch(/\/models unavailable/i);
  });

  it("drops a provider when no usable free model exists", async () => {
    fetchMock.mockResolvedValue(modelList(["whisper-large-v3", "tts-1"]));

    const result = await validateProviderModels([provider()]);

    expect(result.providers).toEqual([]);
    expect(result.summary.groq?.dropped).toEqual(["retired-model"]);
    expect(result.summary.notes.join(" ")).toMatch(/retired-model does not exist and was dropped/);
    expect(result.summary.notes.join(" ")).toMatch(/No configured model id is available/);
  });

  it("accepts OpenRouter's free router even when it is not listed", async () => {
    fetchMock.mockResolvedValue(modelList(["some/model:free"]));

    const result = await validateProviderModels([
      provider({
        name: "openrouter",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: DEFAULT_OPENROUTER_MODEL,
      }),
    ]);

    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]?.model).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(result.summary.openrouter?.fallbacks).toEqual([]);
  });

  it("falls back to another free OpenRouter model when the configured one is gone", async () => {
    fetchMock.mockResolvedValue(modelList(["meta/llama:free", "paid/model"]));

    const result = await validateProviderModels([
      provider({
        name: "openrouter",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: "retired/model:free",
      }),
    ]);

    expect([DEFAULT_OPENROUTER_MODEL, "meta/llama:free"]).toContain(result.providers[0]?.model);
    expect(result.summary.openrouter?.fallbacks).toEqual([
      { from: "retired/model:free", to: result.providers[0]?.model },
    ]);
  });
});
