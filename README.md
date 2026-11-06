# Aether Research — backend

A stateless, conversational research agent on the Next.js App Router. It runs on Vercel's free tier at **₹0**, with no database, no auth and no paid APIs.

- **Claude-like collaboration.** Ask for missing scope in one short batch, show a plan card, wait for approval, then research. Fully specified briefs and “just do it” skip the questions and start immediately.
- **Visible work.** First-person `thinking` notes, a live `todo` list, real `tool` events for searches, page reads and the citation audit, and a short conversational wrap-up after the paper.
- **Iterative papers.** Follow-up questions use only the paper's own sources. Plain-chat edits change only the named sections, emit `section_update` events and increment the report version. “Research deeper into the findings” runs a focused search and merges only that section.
- **Free LLMs only.** Groq is primary. Configured free OpenRouter models are tried in order on `429`, `5xx`, timeouts and rejected keys. No Gemini dependency.
- **Zero-key mode.** Without an LLM key, search still works through Wikipedia + arXiv + OpenAlex and a deterministic, fully cited extractive paper is written.
- **Stateless.** The server keeps no chat history. The browser sends the full conversation, the current `report` and the approved `spec`; the server trims old turns for prompt budgets and keeps the report/spec intact.
- **Server-generated PDF.** `pdf-lib` produces A4 papers with a title block, abstract box, numbered sections, H1–H3 headings, bullets, tables, clickable `[S#]` citations, numbered references, page numbers and a “Research log” appendix.

> The UI lives under `src/app/**` and `src/components/**`. The backend is `src/app/api/**` and `src/lib/**`.

---

## Endpoints

| Method | Path | Request | Success response |
| --- | --- | --- | --- |
| `POST` | `/api/agent` | `AgentRequest` JSON | `text/event-stream` of `AgentEvent` |
| `POST` | `/api/pdf` | `PdfRequest` JSON | `application/pdf` with `Content-Disposition: attachment` |
| `GET` | `/api/health` | — | `HealthResponse` JSON |

`GET /api/agent` returns a small `405` JSON description so a browser visit does not look broken.

### `POST /api/agent`

```json
{
  "messages": [{ "role": "user", "content": "Write a 5-page report on quantum computing for beginners" }],
  "mode": "standard",
  "report": null,
  "spec": null
}
```

`report` is `null` for a new conversation, or the existing `{ title, markdown, sources, version?, pagesEstimated?, changes? }` for a follow-up, edit or scoped research run.

`spec` is `null` until the user approves a proposal. Once the client has a plan card, it sends the approved `ResearchSpec` back. A non-approval message with a `spec` is treated as a proposal revision, not a research run.

```json
{
  "messages": [{ "role": "user", "content": "go ahead" }],
  "mode": "standard",
  "report": null,
  "spec": {
    "topic": "quantum computing",
    "mode": "standard",
    "pages": 5,
    "audience": "general readers",
    "purpose": "research briefing",
    "tone": "neutral, analytical",
    "citationStyle": "numbered",
    "language": "English",
    "outline": [
      { "heading": "Introduction", "pages": 1 },
      { "heading": "Findings", "pages": 2 },
      { "heading": "Discussion", "pages": 1 },
      { "heading": "Conclusion & future directions", "pages": 1 }
    ]
  }
}
```

#### Collaboration flow

1. **Clarify.** If length/pages, audience, focus or format are missing, the agent asks **one batch of at most four questions**. Every question includes a “Decide for me” option. If the prompt already specifies enough, no questions are asked.
2. **Proposal.** After the scoping answers, the agent emits a `proposal` card with an editable `ResearchSpec` and waits. It does not search yet.
3. **Approve.** The user edits the card or says “go ahead”. When the client sends the approved `spec`, research starts immediately. “Just do it” / “decide for me” / “go ahead” use sensible defaults and start without a separate approval step.
4. **Research.** The paper is written from real retrieved sources. After the `report` event, a 2–3 sentence wrap-up covers findings, caveats, assumptions and pages achieved, followed by three next-step questions.

The full discriminated union is in `src/lib/contract.ts`.

#### SSE events

Each event is exactly one line:

```text
data: {"type":"intent","intent":"research"}

data: {"type":"todo","items":[{"id":"plan","label":"Plan the research","status":"running"}]}

data: {"type":"tool","id":"web-1","name":"web_search","input":"quantum computing overview","status":"running"}
```

A research run emits, in order:

```text
title? → intent → run → todo → thinking → step(plan) → plan
       → step(search) → tool(web_search/academic_search)* → source*
       → step(read) → tool(read_page)* → step(analyze) → step(write)
       → report_token* → step(review) → tool(fact_check) → report
       → token* (conversational wrap-up) → done
```

Other paths:

```text
clarify:     title? → intent(clarify) → thinking → clarify → done
proposal:    title? → intent(research) → thinking → token* → proposal → done
follow-up:   title? → intent(followup) → thinking → token* → done
edit:        title? → intent(edit_report) → thinking → report_token* → section_update* → report → token* → done
scoped run:  title? → intent(research) → run → todos/tools → section_update* → report → token* → done
```

- `title` is emitted once, after the first user message.
- `thinking` notes only describe decisions the agent actually made.
- `todo` re-sends the full task list whenever an item changes.
- `tool` events correspond to real calls: Wikipedia/Tavily web search, arXiv/OpenAlex academic search, SSRF-guarded page reads and the deterministic citation audit.
- `clarify` carries the v2 `questions` array and legacy `question` / `options` mirrors for older clients.
- `proposal` carries the `spec` and a human summary; research does not start until the client sends that spec back.
- `section_update` is emitted for each section changed by an edit or scoped run. Untouched sections stay byte-identical.
- `report` carries `version`, `title`, `markdown`, `sources`, `pagesEstimated`, optional `changes`, `quality` and exactly three `followups`.
- `error` is recoverable (`recoverable: true`) where possible; the stream continues.
- `done` is always the last event, exactly once, on every path.
- The first event is emitted immediately. `: ping` is sent every 15 seconds.

#### Paper format

Generated markdown always follows this structure:

```text
# <paper title>

## Abstract                      (150–250 words)
## 1. Introduction
## 2. Methodology                 (real run stats: queries, sources, pages read, indexes, providers)
## 3. Findings                    (one ### subsection per subtopic; comparison table when requested)
## 4. Discussion                  (agreements, conflicts, implications)
## 5. Limitations
## 6. Conclusion & future directions
```

Every factual sentence carries at least one `[S#]` citation. There is deliberately **no References section in the markdown**; the UI and PDF build references from the structured `sources` array.

`pages` in the spec is the target A4 page count. The word budget is `pages × 450` (minimum 250 words), and `pagesEstimated` records a deterministic estimate of the rendered export. The PDF endpoint reports the real page count in `X-Pdf-Pages`.

### `POST /api/pdf`

```json
{
  "title": "Quantum computing: an evidence review",
  "markdown": "# Quantum computing...\n\n## Abstract...",
  "sources": [
    {
      "id": "S1",
      "title": "Quantum computing",
      "url": "https://en.wikipedia.org/wiki/Quantum_computing",
      "domain": "en.wikipedia.org",
      "kind": "encyclopedia",
      "snippet": "Overview",
      "credibility": 0.7,
      "credibilityReason": "Peer-moderated encyclopedia"
    }
  ],
  "pages": 6,
  "citationStyle": "apa"
}
```

Returns a valid multi-page `%PDF` file with selectable text, a title block and date, “Prepared by Aether”, an abstract box, numbered sections, H1–H3 headings, bullets, tables, clickable citations, numbered references with URLs and page numbers. The appendix heading is **Research log** and contains the queries quoted in the Methodology, the sources retrieved/cited and the deterministic quality score.

`pages` is honoured within ±1 page when the material allows: the renderer iteratively adjusts a bounded typography/spacing scale and never stretches a one-page note into thirty pages or shrinks a book into two. `citationStyle` controls reference formatting (`numbered`, `apa`, `ieee`); inline citations remain `[S#]` so they stay clickable. The filename is a slug of the title, e.g. `quantum-computing-an-evidence-review.pdf`.

### `GET /api/health`

```json
{
  "llm": { "groq": true, "openrouter": false },
  "search": { "tavily": false, "keyless": true },
  "model": "llama-3.3-70b-versatile"
}
```

Only booleans and the active model name are exposed. Keys are never returned or logged. With no LLM key, `model` is `"keyless-extractive"`.

---

## Configuration

Everything is optional. Copy `.env.example` to `.env.local` if you want keys.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | — | Free Groq key, primary provider |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model used for papers and chat |
| `GROQ_JSON_MODEL` | `GROQ_MODEL` | Optional smaller model for planner/critic JSON calls |
| `OPENROUTER_API_KEY` | — | OpenRouter key, tried after Groq (free models only) |
| `OPENROUTER_MODELS` | `openrouter/free` | Comma-separated free ids, tried in order. Paid ids are dropped |
| `OPENROUTER_JSON_MODEL` | first free model | Optional smaller free model for JSON calls |
| `TAVILY_API_KEY` | — | Optional broader web search |
| `APP_URL` | `https://aether-research.vercel.app` | OpenRouter `HTTP-Referer` attribution |
| `APP_NAME` | `Aether Research` | OpenRouter `X-Title` attribution |
| `GROQ_BASE_URL` | Groq endpoint | Development override (mock server) |
| `OPENROUTER_BASE_URL` | OpenRouter endpoint | Development override (mock server) |

> **OpenRouter is free-only.** Any model id that is not `openrouter/free` or `<model>:free` is ignored. If the whole list is paid, the app falls back to `openrouter/free`. A misconfigured paid model can never be billed.

### Bring your own key (BYOK)

A browser can supply keys per request instead of using server env vars:

| Header | Provider |
| --- | --- |
| `x-groq-key` | Groq |
| `x-openrouter-key` | OpenRouter (free models only) |
| `x-tavily-key` | Tavily |

BYOK headers override the env key for that provider and are never echoed back. Requests with any BYOK header skip the server-side research rate limit.

### Failover

Providers are tried in order: Groq, then each configured free OpenRouter model. Failover happens on `429`, `408`, `409`, `5xx`, timeouts, network failures and rejected keys. A `retry-after` value shorter than two seconds is honoured once on the same provider; longer waits fail over immediately. Every failover emits a `thinking` note naming the provider and reason. If a stream fails after tokens were emitted, the partial text is kept rather than duplicated.

### Free-tier budgets

| Provider | Prompt character budget | Output cap |
| --- | --- | --- |
| Groq | ~14,000 | 2,048 tokens |
| OpenRouter (free) | ~40,000 | 4,096 tokens |

The writer prompt is rebuilt per provider so Groq never receives an OpenRouter-sized context. The planner and critic use the optional smaller JSON model, and the number of LLM calls per run is kept low.

### Zero-key behaviour

With no LLM key:

1. Search still runs through Wikipedia, arXiv and OpenAlex.
2. The stream emits a recoverable error:
   > No LLM key configured. Add a free Groq or OpenRouter key in Settings for full AI synthesis; showing a source-grounded extractive paper instead.
3. A deterministic extractive paper is written from retrieved evidence, with `[S#]` citations and no invented facts. Its Methodology reports the real run stats.
4. The normal `report` event and PDF export still work.

If search or a provider fails, the run continues with whatever evidence it has. If there are zero sources, the paper says so honestly and makes no factual claims.

---

## Architecture

```text
src/app/api/agent/route.ts    SSE endpoint, validation, BYOK, rate limit
src/app/api/pdf/route.ts      PDF endpoint
src/app/api/health/route.ts   capability snapshot
src/lib/agent/router.ts       rules-based intent, scoping and approval router
src/lib/agent/runner.ts       orchestration, todos, tools, deep sections, edits
src/lib/agent/request.ts      zod validation for both POST bodies
src/lib/agent/trim.ts         dependency-free history trimming
src/lib/agent/history.ts      StoredChat create/normalise/parse/serialise
src/lib/research/spec.ts      scoping questions, defaults, outline, proposal edits
src/lib/research/sections.ts  byte-preserving section parse/replace/remove/insert
src/lib/research/plan.ts      planner call + deterministic fallback
src/lib/llm/                  OpenAI-compatible Groq/OpenRouter client + failover
src/lib/search/               Tavily (optional), Wikipedia, arXiv, OpenAlex
src/lib/reader/               SSRF-safe page reader with per-source progress
src/lib/research/             evidence extraction, extractive writer, cleanup
src/lib/security/             SSRF URL guard, HTML cleaning, prompt-injection filtering
src/lib/pdf/render.ts         pdf-lib paper renderer + page targeting
src/lib/pdf/pages.ts          deterministic page estimate helpers
src/lib/quality.ts            deterministic citation checks + critic merge
src/lib/sse.ts                SSE transport and heartbeat
src/lib/contract.ts           public API types
src/lib/prompts.ts            paper format, run stats, writer/editor prompts
```

### Request flow

1. Validate the body with zod.
2. Resolve BYOK headers over env keys.
3. Route the last user message to `chat | clarify | research | followup | edit_report`, using the current report and any approved spec.
4. Apply the best-effort research rate limit (6 per IP per hour, skipped for BYOK).
5. Run the agent and stream events.
6. Keep the connection alive with heartbeat comments.
7. Always finish with `done`.

### Research pipeline

| Step | What happens | Free? |
| --- | --- | --- |
| `plan` | One small JSON call; deterministic fallback if no key/failure | yes |
| `search` | Keyless indexes first, Tavily when configured; dedupe by normalised URL | yes |
| `source` | Ranked sources with stable `S1…Sn` ids and credibility reasons | yes |
| `read` | SSRF-guarded page fetch, capped at 2 MB / 6 s per page | yes |
| `analyze` | Deterministic sentence-level evidence extraction | yes |
| `write` | Groq → OpenRouter streaming; extractive fallback | yes |
| `review` | Deterministic citation audit; LLM critic for deep or 5+ page papers | yes |

Modes:

| Mode | Queries | Sources | Pages read | Academic search | Target words |
| --- | --- | --- | --- | --- | --- |
| Quick | 2 | 4 | 0 | no | ≈600 |
| Standard | 4 | 8 | 4 | no | ≈1500 |
| Deep | 6 | 12 | 8 | yes | ≈3000+, six sections |

### Edits, versions and stored chats

- A plain-chat edit is routed to `edit_report`. Section-level edits rewrite only the named H2 section; the rest of the markdown is preserved byte for byte.
- Every edit re-runs the deterministic citation audit, increments `report.version`, emits `section_update` for each touched section and then the full new `report`.
- A whole-report edit (for example “make it shorter”) necessarily rewrites the document, but still produces a full new version and a recoverable error if the model cannot apply it.
- Scoped research (`research deeper into the findings section`) is a research intent with a `scope`. It searches for new evidence, reads the best new sources and merges only the target section.
- `src/lib/contract.ts` defines browser-storage types (`StoredChat`, `StoredMessage`, `ReportVersion`, `StoredProposal`, `StoredClarify`) and `CHAT_SCHEMA_VERSION = 1`. The server never stores them; the client replays its own history.

### History trimming

Every request carries the whole conversation. Before building a prompt, `trimConversation` keeps the most recent turns verbatim (about ten) and folds older turns into a deterministic summary. The current report and approved spec are included separately and are never evicted by trimming. The latest user instruction is always preserved.

---

## Security

- **SSRF guard.** Blocks loopback, RFC1918, link-local, cloud metadata, reserved ranges, IPv6 unique-local/link-local, `.local`/`.internal`, credentials in URLs and non-HTTP protocols. DNS is resolved before every hop and every redirect is re-validated. Fetching stops after three redirects, six seconds and 2 MB.
- **Prompt-injection filtering.** Retrieved text is cleaned, instruction-like bait is neutralised, and every source is wrapped in an explicit `<untrusted_source>` data block. System prompts say to treat it as data.
- **Output sanitising.** Markdown images and non-HTTP links are removed before a paper is stored.
- **Secret redaction.** Provider errors are mapped to safe messages; keys are never included in responses or logs.
- **Bounded work.** Fetch timeouts, response size caps, redirect caps and a per-IP research limit prevent runaway cost.
- **Best-effort rate limit.** Six research runs per hour per IP, in memory, per serverless instance. BYOK requests are exempt. There is no database and no global quota.

---

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, or call the API directly.

### Offline full-pipeline test with the mock LLM

The mock server speaks the OpenAI chat-completions protocol, including SSE streaming, planner/critic JSON, full papers and section-by-section prompts:

```bash
# terminal 1
npm run mock

# terminal 2 (PowerShell)
$env:GROQ_API_KEY="mock"
$env:GROQ_BASE_URL="http://127.0.0.1:4010/v1/chat/completions"
npm run dev
```

The mock is development-only and makes no network calls.

### Tests

```bash
npm test          # vitest, 93 tests
npm run typecheck # tsc --noEmit
npm run build     # production Next build
```

Covered:

- Scoping questions, “decide for me”, “just do it”, proposal edits and spec normalisation.
- Word budget, outline/page allocation and page parsing.
- Router behaviour for all five intents, approvals, proposal revisions and scoped research.
- History trimming, latest-user preservation and `StoredChat` JSON round-trips.
- Section replace/remove/insert, changed-section detection and byte-identical untouched sections.
- SSRF host/IP/protocol/credential rejection and redirect limits.
- Prompt-injection filtering and HTML cleaning.
- Citation checks, invalid ids, missing sections, no-source scoring, credibility and critic merge.
- SSE serialisation, ordering, heartbeat and error recovery.
- Rate-limit window and IP isolation.
- Zero-key research event order (thinking/todo/tool/source/report), cited paper sections, deep-mode todos, follow-ups and edit fallbacks.
- Provider order (Groq → OpenRouter), free-only filtering, comma lists and health snapshot.
- PDF `%PDF` signature, multi-page output, page targeting within ±1, citation styles, download filename and API route.

### Manual smoke calls

```bash
curl -N -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Write a quick 2-page brief on quantum computing for beginners"}]}'

curl http://localhost:3000/api/health

curl -X POST http://localhost:3000/api/pdf \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","markdown":"# Test\n\n## Abstract\n\nHello [S1].","sources":[{"id":"S1","title":"Example","url":"https://example.com","domain":"example.com","kind":"web","snippet":"x","credibility":0.5,"credibilityReason":"test"}],"pages":1}' \
  --output paper.pdf
```

---

## Deploy to Vercel

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Optionally add `GROQ_API_KEY`, `OPENROUTER_API_KEY` and `TAVILY_API_KEY` in project settings. Keep `OPENROUTER_MODELS` to free ids only.
4. Deploy. No database, cron job or paid add-on is required.

`vercel.json` sets `maxDuration` to 300 s for the agent and 60 s for PDF generation. Route handlers also export `maxDuration` so the limit travels with the code.

---

## Deviations and implementation notes

- **Deterministic router.** Intent classification, scoping and approval checks use rules rather than an LLM call. This is faster, free and predictable.
- **Extractive zero-key papers.** The contract asks for a clear “add a free Groq or OpenRouter key” message. This implementation also produces an honest cited paper from retrieved evidence instead of stopping at an error.
- **LLM critic scope.** Deterministic citation checks always run. The extra LLM critic call runs only for deep mode or papers of five pages or more, to protect free quotas. A critic failure never discards the report.
- **Rate-limit scope.** It is per serverless instance, not global, because no database or shared store is allowed. It is skipped for BYOK requests.
- **PDF library.** `pdf-lib` is used for pure-JS generation. Text is selectable; citations are link annotations; the research log is derived from the paper and structured sources rather than invented.
- **Page targeting.** Typography scaling is bounded. A report is guaranteed to be valid, and is within ±1 page when its content is within a sensible range of the target.
- **Extra UI convenience types.** `src/lib/contract.ts` also exports `ResearchPlan` and `ResearchReport` aliases so the UI can type plans and stored papers without duplicating shapes. Legacy `clarify.question`/`clarify.options` and optional `report.version` are retained for older clients.
- **`GET /api/agent`.** Returns a `405` JSON explanation instead of an empty response.
- **No persistence.** There is no database, auth, cookie, server session or cross-request cache. The client owns conversation state.
- **OpenRouter is optional and free-only.** It is used only when `OPENROUTER_API_KEY` (or `x-openrouter-key`) is present, and only with `openrouter/free` or `:free` models. Paid ids are refused in code, so no request can be billed.
