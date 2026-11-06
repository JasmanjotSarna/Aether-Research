import { describe, expect, it } from "vitest";
import { assessSource } from "@/lib/credibility";

describe("credibility scoring", () => {
  it("ranks academic publishers above general web sources", () => {
    const academic = assessSource("https://arxiv.org/abs/2401.00001", { publishedAt: "2025-01-10" });
    const web = assessSource("https://example.com/blog/post");

    expect(academic.kind).toBe("academic");
    expect(academic.score).toBeGreaterThan(web.score);
    expect(academic.reason).toMatch(/academic|scientific|Publication date/i);
    expect(web.reason).toMatch(/General web source/i);
  });

  it("recognises encyclopedias and official documentation", () => {
    const wiki = assessSource("https://en.wikipedia.org/wiki/Quantum_computing");
    const docs = assessSource("https://docs.python.org/3/library/asyncio.html");

    expect(wiki.kind).toBe("encyclopedia");
    expect(docs.kind).toBe("docs");
    expect(wiki.score).toBeGreaterThan(0.5);
    expect(docs.score).toBeGreaterThan(0.5);
  });

  it("penalises self-published blog platforms", () => {
    const blog = assessSource("https://someone.medium.com/a-take");
    expect(blog.score).toBeLessThan(0.5);
    expect(blog.reason).toMatch(/Self-published/i);
  });

  it("stays inside the documented bounds", () => {
    for (const url of [
      "https://arxiv.org/abs/1",
      "https://example.com",
      "not a url at all",
      "https://x.medium.com/post",
    ]) {
      const result = assessSource(url);
      expect(result.score).toBeGreaterThanOrEqual(0.1);
      expect(result.score).toBeLessThanOrEqual(0.98);
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});
