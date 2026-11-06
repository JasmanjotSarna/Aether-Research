#!/usr/bin/env node
/**
 * Local OpenAI-compatible mock server for offline end-to-end testing.
 *
 * Usage:
 *   node scripts/mock-llm.mjs
 *   GROQ_API_KEY=mock \
 *   GROQ_BASE_URL=http://127.0.0.1:4010/v1/chat/completions \
 *   npm run dev
 *
 * It answers planner JSON, critic JSON, paper writing (full and
 * section-by-section), chat and edit requests. It never calls the internet,
 * uses no paid service, and is only for development.
 */

import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_LLM_PORT ?? 4010);
const HOST = process.env.MOCK_LLM_HOST ?? "127.0.0.1";

function sourceIds(text) {
  const ids = [...text.matchAll(/\[S(\d+)\]/g)].map((match) => `S${match[1]}`);
  return [...new Set(ids)].slice(0, 6);
}

function topicFrom(text) {
  const match = text.match(/TOPIC:\s*(.+)/i);
  return (match?.[1] ?? "the topic").trim();
}

function queriesFrom(text) {
  const match = text.match(/SEARCH QUERIES USED:\s*(.+)/i);
  if (!match?.[1]) return [];
  return match[1]
    .split("|")
    .map((query) => query.trim())
    .filter(Boolean);
}

function statFrom(text, label, fallback) {
  const pattern = new RegExp(`${label}:\\s*([^\\n]+)`, "i");
  return text.match(pattern)?.[1]?.trim() ?? fallback;
}

function plan(user) {
  const topic = topicFrom(user);
  const comparative = /COMPARISON REQUESTED:\s*YES/i.test(user);
  return {
    objective: `Assess ${topic} using the supplied sources.`,
    subtopics: comparative
      ? [
          "Background and definitions",
          "Option A: strengths and limits",
          "Option B: strengths and limits",
          "Head-to-head trade-offs",
          "Risks and open questions",
        ]
      : [
          "Foundations and definitions",
          "Current state of the art",
          "Evidence and benchmarks",
          "Limitations and risks",
          "Outlook",
        ],
    queries: [
      `${topic} overview`,
      `${topic} latest developments`,
      `${topic} evidence benchmarks`,
      `${topic} limitations`,
    ],
  };
}

function methods(user) {
  const queries = queriesFrom(user);
  const queryLine = queries.length
    ? `The searches were: ${queries.map((query) => `"${query}"`).join(", ")}.`
    : "The searches were planned from the topic and executed against keyless indexes.";
  const executed = statFrom(user, "Search queries executed", String(queries.length || 4));
  const selected = statFrom(user, "Sources selected", "the retrieved");
  const pages = statFrom(user, "Full pages read", "0");
  const indexes = statFrom(user, "Indexes used", "Wikipedia + OpenAlex");
  const providers = statFrom(user, "Language model providers used", "Groq");

  return `${queryLine} ${executed} queries were executed against ${indexes}. ${selected} sources were deduplicated by normalised URL, ranked by topical relevance and publisher credibility, then ${pages} full pages were read. Model providers used: ${providers}.`;
}

function findings(user) {
  const topic = topicFrom(user);
  const ids = sourceIds(user);
  const cited = (index) => `[${ids[index % Math.max(1, ids.length)] ?? "S1"}]`;
  const comparative = /COMPARISON REQUESTED:\s*YES/i.test(user);

  const lines = [
    "### Foundations and definitions",
    `The mock treats ${topic} as a structured research question with multiple viewpoints ${cited(1)}. Definitions come from the supplied excerpts, not from model memory ${cited(2)}.`,
    "",
    "### Current state of the art",
    `Recent work described in the sources points to active development ${cited(0)}. The mock does not add facts beyond those excerpts ${cited(3 % Math.max(1, ids.length))}.`,
    "",
    "### Evidence and benchmarks",
    `Evidence quality varies by publisher, which is why each source carries a credibility signal ${cited(1)}. The mock paper deliberately keeps claims generic ${cited(2)}.`,
    "",
    "### Limitations and risks",
    `The retrieved evidence is a sample, not a systematic review ${cited(0)}. Unknowns are stated rather than filled in ${cited(1)}.`,
    "",
  ];

  if (comparative) {
    lines.push(
      "### Head-to-head comparison",
      "",
      "| Criterion | Option A | Option B |",
      "| --- | --- | --- |",
      `| Evidence in sources | Covered by retrieved excerpts ${cited(0)} | Sparse in retrieved excerpts ${cited(1)} |`,
      `| Main strength | Clear documentation ${cited(2)} | Flexibility ${cited(0)} |`,
      `| Main limitation | Narrow coverage ${cited(1)} | Higher complexity ${cited(2)} |`,
      ""
    );
  }

  return lines.join("\n").trimEnd();
}

function report(user) {
  const topic = topicFrom(user);
  const ids = sourceIds(user);
  const cited = (index) => `[${ids[index % Math.max(1, ids.length)] ?? "S1"}]`;

  return [
    `# Mock paper: ${topic}`,
    "",
    "## Abstract",
    `This mock paper tests the full pipeline for ${topic}. It plans searches, retrieves sources, reads pages, extracts evidence, writes a cited paper and audits citations ${cited(0)}. Every factual sentence is tied to a supplied source id ${cited(1)}. It is deliberately generic because it exists to prove the integration works end to end, not to make a substantive claim about the topic ${cited(2)}. The same structure is used by the real writer, so the PDF exporter, citation checker and UI see representative input ${cited(0)}.`,
    "",
    "## 1. Introduction",
    `The question addressed here is what the publicly retrievable evidence says about ${topic} ${cited(1)}. The scope is limited to the sources returned by the run ${cited(2)}.`,
    "",
    "## 2. Methodology",
    methods(user),
    "",
    "## 3. Findings",
    findings(user),
    "",
    "## 4. Discussion",
    `The sources agree that the pipeline can retrieve and cite material for ${topic} ${cited(0)}. They do not establish any substantive conclusion, because this is a mock ${cited(1)}. Where evidence is thin, the paper says so instead of filling the gap ${cited(2)}.`,
    "",
    "## 5. Limitations",
    "- This paper was produced by a mock server for integration testing.",
    `- It does not represent real evidence and should never be published ${cited(0)}.`,
    `- Real runs replace this text with a model written from live sources ${cited(1)}.`,
    "",
    "## 6. Conclusion & future directions",
    `The pipeline works: planning, searching, reading, writing, review and export all complete ${cited(1)}. Replace the mock endpoint with a free Groq or OpenRouter key for real synthesis ${cited(0)}.`,
    "",
  ].join("\n");
}

function sectionReport(user, system) {
  const topic = topicFrom(user);
  const ids = sourceIds(user);
  const cited = (index) => `[${ids[index % Math.max(1, ids.length)] ?? "S1"}]`;
  const marker = system.indexOf("SECTION TO WRITE:");
  const section = marker === -1 ? "" : system.slice(marker);

  if (section.includes("## 2. Methodology")) {
    return `## 2. Methodology\n\n${methods(user)}`;
  }
  if (section.includes("## 3. Findings")) {
    return `## 3. Findings\n\n${findings(user)}`;
  }
  if (section.includes("## 4. Discussion")) {
    return [
      "## 4. Discussion",
      "",
      `The sources agree that the pipeline can retrieve and cite material for ${topic} ${cited(0)}. They do not establish a substantive conclusion, because this is a mock ${cited(1)}. Where evidence is thin, the paper says so instead of filling the gap ${cited(2)}.`,
    ].join("\n");
  }
  if (section.includes("## 5. Limitations")) {
    return [
      "## 5. Limitations",
      "",
      "- This paper was produced by a mock server for integration testing.",
      `- It does not represent real evidence and should never be published ${cited(0)}.`,
      `- Real runs replace this text with a model written from live sources ${cited(1)}.`,
    ].join("\n");
  }
  if (section.includes("## 6. Conclusion")) {
    return [
      "## 6. Conclusion & future directions",
      "",
      `The pipeline works: planning, searching, reading, writing, review and export all complete ${cited(1)}. Replace the mock endpoint with a free Groq or OpenRouter key for real synthesis ${cited(0)}.`,
    ].join("\n");
  }

  return [
    `# Mock paper: ${topic}`,
    "",
    "## Abstract",
    `This mock paper tests the full pipeline for ${topic}. It plans searches, retrieves sources, reads pages, extracts evidence, writes a cited paper and audits citations ${cited(0)}. Every factual sentence is tied to a supplied source id ${cited(1)}. It is deliberately generic because it exists to prove the integration works end to end ${cited(2)}. The same structure is used by the real writer ${cited(0)}.`,
    "",
    "## 1. Introduction",
    `The question addressed here is what the publicly retrievable evidence says about ${topic} ${cited(1)}. The scope is limited to the sources returned by the run ${cited(2)}.`,
  ].join("\n");
}

function critic() {
  return {
    score: 7.8,
    notes: [
      "Mock review: citation coverage looks complete.",
      "Mock review: structure matches the required sections.",
    ],
    followups: [
      "What evidence would change this conclusion?",
      "Which source is least credible, and why?",
      "What should be researched next?",
    ],
  };
}

function chat(messages) {
  const last = [...messages].reverse().find((message) => message.role === "user");
  return `This is a mock reply. You asked: “${(last?.content ?? "nothing").slice(
    0,
    240
  )}”. Configure a real free Groq or OpenRouter key to get a genuine answer.`;
}

function edited(user) {
  const current = user.match(/<current_report>([\s\S]*?)<\/current_report>/i);
  const body = current?.[1]?.trim() ?? "# Edited paper\n\nNo paper was supplied.";
  return `${body}\n\n> Mock edit: the paper was returned unchanged by the test server.\n`;
}

/** Rewrite one H2 section, preserving its heading. */
function sectionEdit(user) {
  const heading = user.match(/TARGET HEADING:\s*(.+)/i)?.[1]?.trim() ?? "Section";
  const current = user.match(/<current_section>([\s\S]*?)<\/current_section>/i)?.[1]?.trim();
  if (current) {
    return `${current}\n\n> Mock section edit: the test server kept this section and acknowledged the change.\n`;
  }
  const ids = sourceIds(user);
  const cite = ids[0] ? ` [${ids[0]}]` : "";
  return `## ${heading.replace(/^#+\s*/, "")}\n\nMock rewritten section produced for integration testing${cite}.\n`;
}

/** Insert one new H2 section. */
function addSection(user) {
  const heading = user.match(/NEW SECTION HEADING:\s*(.+)/i)?.[1]?.trim() ?? "New section";
  const ids = sourceIds(user);
  const cite = ids[0] ? ` [${ids[0]}]` : "";
  return `## ${heading.replace(/^#+\s*/, "")}\n\nMock added section produced for integration testing${cite}.\n`;
}

/** Deepen one existing section with newly retrieved evidence. */
function scopedReport(user) {
  const heading = user.match(/TARGET SECTION:\s*(.+)/i)?.[1]?.trim() ?? "Section";
  const ids = sourceIds(user);
  const cite = ids[0] ? ` [${ids[0]}]` : "";
  const current = user.match(/CURRENT SECTION:\s*\n([\s\S]*?)\n\nSOURCES:/i)?.[1]?.trim();
  const body =
    current && current.startsWith("##")
      ? current
      : `## ${heading.replace(/^#+\s*/, "")}\n\nMock deepened section produced for integration testing${cite}.`;
  return `${body}\n\nMock scoped research appended one new cited sentence${cite}.\n`;
}

function chooseResponse(messages) {
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const user = messages.find((message) => message.role === "user")?.content ?? "";

  if (/Research Planner/i.test(system)) return JSON.stringify(plan(user));
  if (/strict research critic/i.test(system)) return JSON.stringify(critic());
  if (/adding one new section/i.test(system)) return addSection(user);
  if (/deepening one section/i.test(system)) return scopedReport(user);
  if (/section editor/i.test(system)) return sectionEdit(user);
  if (/report editor|paper editor/i.test(system)) return edited(user);
  if (/SECTION TO WRITE:/i.test(system)) return sectionReport(user, system);
  if (/senior research writer/i.test(system)) return report(user);
  return chat(messages);
}

function tokenize(text) {
  const chunks = text.match(/[\s\S]{1,48}/g) ?? [text];
  return chunks;
}

function sse(res, content) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  for (const chunk of tokenize(content)) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

const server = createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "mock-llm", model: "mock-1" }));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Method not allowed" } }));
    return;
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 2_000_000) req.destroy();
  });
  req.on("end", () => {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Invalid JSON" } }));
      return;
    }

    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    let content;
    try {
      content = chooseResponse(messages);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: String(error?.message ?? error) } }));
      return;
    }

    if (payload.stream) {
      sse(res, content);
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "mock-completion",
        object: "chat.completion",
        model: payload.model ?? "mock-1",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    );
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Mock LLM listening on http://${HOST}:${PORT}`);
  console.log(`Use: GROQ_BASE_URL=http://${HOST}:${PORT}/v1/chat/completions`);
});
