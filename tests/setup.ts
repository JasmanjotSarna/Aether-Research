import { beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.unstubAllEnvs();
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.TAVILY_API_KEY;
  delete process.env.GROQ_BASE_URL;
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.GROQ_MODEL;
  delete process.env.GROQ_JSON_MODEL;
  delete process.env.OPENROUTER_MODEL;
  delete process.env.OPENROUTER_MODELS;
  delete process.env.OPENROUTER_JSON_MODEL;
});
