import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { PdfRequest } from "@/lib/contract";
import { pdfFilename, renderReportPdf, renderReportPdfWithMeta } from "@/lib/pdf/render";
import { POST } from "@/app/api/pdf/route";

const request: PdfRequest = {
  title: "Quantum computing: an evidence review",
  markdown: [
    "# Quantum computing: an evidence review",
    "",
    "## Abstract",
    "Quantum computing uses superposition and entanglement to perform computation [S1]. Practical systems remain limited by error rates and decoherence, and current evidence supports cautious optimism rather than near-term replacement of classical computers [S1][S2].",
    "",
    "## 1. Introduction",
    "Quantum computing is an experimental paradigm that encodes information in qubits [S1]. This paper reviews the public evidence on its maturity and limits [S2].",
    "",
    "## 2. Methodology",
    'The searches were: "quantum computing overview", "quantum error correction benchmarks". Sources were deduplicated by URL and ranked by publisher credibility [S1][S2].',
    "",
    "## 3. Findings",
    "- Logical qubit lifetimes have improved in recent experiments [S2].",
    "- Error correction overhead remains substantial [S2].",
    "- Enthusiast coverage often overstates near-term capability [S1].",
    "",
    "### Evidence and benchmarks",
    "Recent experiments report a reduction in logical error rates [S2]. The result is preliminary and has not been independently replicated [S1].",
    "",
    "### Comparison",
    "",
    "| Criterion | Classical | Quantum |",
    "| --- | --- | --- |",
    "| Maturity | Production ready [S1] | Experimental [S2] |",
    "| Error rate | Very low [S1] | Still high [S2] |",
    "",
    "## 4. Discussion",
    "The sources agree that error rates are falling and disagree about how quickly fault tolerance will scale [S1][S2].",
    "",
    "## 5. Limitations",
    "1. Fault tolerance at scale is unproven [S2].",
    "2. The evidence base is small and fast-moving [S1].",
    "",
    "## 6. Conclusion & future directions",
    "The evidence supports cautious optimism, not near-term replacement of classical computers [S1][S2].",
    "",
  ].join("\n"),
  sources: [
    {
      id: "S1",
      title: "Quantum computing overview",
      url: "https://en.wikipedia.org/wiki/Quantum_computing",
      domain: "en.wikipedia.org",
      kind: "encyclopedia",
      snippet: "Overview",
      credibility: 0.7,
      credibilityReason: "Peer-moderated encyclopedia",
    },
    {
      id: "S2",
      title: "Advances in quantum error correction",
      url: "https://arxiv.org/abs/2401.00001",
      domain: "arxiv.org",
      kind: "academic",
      snippet: "Preprint",
      credibility: 0.85,
      credibilityReason: "Recognised academic publisher",
      publishedAt: "2025-01-10",
    },
  ],
};

describe("PDF renderer", () => {
  it("returns a valid multi-page PDF with clickable citation annotations", async () => {
    const bytes = await renderReportPdf(request);
    expect(Buffer.from(bytes).subarray(0, 4).toString("latin1")).toBe("%PDF");

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toContain("Quantum computing");
    expect(doc.getAuthor()).toContain("Aether");
  });

  it("renders a paper without methodology trivia or sources", async () => {
    const minimal: PdfRequest = {
      title: "No evidence",
      markdown: "# No evidence\n\n## Abstract\n\nNo usable sources were found [S1].\n",
      sources: [],
    };
    const bytes = await renderReportPdf(minimal);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("creates a safe download filename", () => {
    expect(pdfFilename("Quantum computing: an evidence review")).toBe(
      "quantum-computing-an-evidence-review.pdf"
    );
    expect(pdfFilename("///")).toBe("research-report.pdf");
  });

  it("serves application/pdf from the API route", async () => {
    const response = await POST(
      new Request("http://localhost/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      'attachment; filename="quantum-computing-an-evidence-review.pdf"'
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes).subarray(0, 4).toString("latin1")).toBe("%PDF");
    await expect(PDFDocument.load(bytes)).resolves.toBeDefined();
    const doc = await PDFDocument.load(bytes);
    expect(response.headers.get("x-pdf-pages")).toBe(String(doc.getPageCount()));
  });

  it("renders at real typography and reports honest content pages", async () => {
    const paragraphs = Array.from({ length: 26 }, (_, index) => {
      const claim =
        index % 3 === 0
          ? "Quantum error correction remains the central engineering bottleneck for practical systems [S2]."
          : index % 3 === 1
            ? "Classical computers still outperform quantum prototypes on nearly every production workload [S1]."
            : "The evidence base is small, fast-moving and often reported with more certainty than it supports [S1][S2].";
      return `Paragraph ${index + 1}. ${claim} ${"Additional analysis and context. ".repeat(6)}`;
    }).join("\n\n");

    const longRequest: PdfRequest = {
      ...request,
      title: "Long quantum evidence review",
      pages: 6,
      markdown: [
        "# Long quantum evidence review",
        "",
        "## Abstract",
        "A long abstract summarising the evidence [S1][S2].",
        "",
        "## 1. Introduction",
        paragraphs,
        "",
        "## 2. Methodology",
        "The searches were run against public indexes [S1][S2].",
        "",
        "## 3. Findings",
        paragraphs,
        "",
        "## 4. Discussion",
        paragraphs,
        "",
        "## 5. Limitations",
        "The evidence is incomplete [S2].",
        "",
        "## 6. Conclusion & future directions",
        "Cautious optimism is warranted [S1].",
      ].join("\n"),
    };

    const rendered = await renderReportPdfWithMeta(longRequest);
    expect(Buffer.from(rendered.bytes).subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(rendered.contentPages).toBeGreaterThan(1);
    expect(rendered.onTarget).toBe(Math.abs(rendered.pages - 6) <= 1);
  });

  it("never stretches a short paper to a larger requested page count", async () => {
    const rendered = await renderReportPdfWithMeta({
      ...request,
      pages: 15,
      markdown: "# Short note\n\n## Abstract\n\nA short but honest note [S1].\n",
    });
    expect(rendered.pages).toBeLessThan(15);
    expect(rendered.contentPages).toBeLessThan(1);
    expect(rendered.onTarget).toBe(false);
  });

  it("renders every citation style", async () => {
    for (const style of ["numbered", "apa", "ieee"] as const) {
      const rendered = await renderReportPdfWithMeta({ ...request, citationStyle: style });
      expect(Buffer.from(rendered.bytes).subarray(0, 4).toString("latin1"), style).toBe("%PDF");
      const doc = await PDFDocument.load(rendered.bytes);
      expect(doc.getPageCount()).toBeGreaterThan(1);
    }
  });

  it("rejects malformed PDF requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", markdown: "", sources: "nope" }),
      })
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/Invalid request/i);
  });
});
