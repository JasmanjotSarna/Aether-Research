/**
 * Search-query shaping shared by the planner and the search layer.
 *
 * Search indexes work best with 3–6 distinctive words. Long conversational
 * sentences are shortened deterministically, without an extra model call.
 */

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "please",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

/** Words that add no retrieval signal to an already-specific topic. */
const GENERIC = new Set([
  "compare",
  "comparing",
  "comparison",
  "overview",
  "latest",
  "developments",
  "evidence",
  "benchmarks",
  "benchmark",
  "challenges",
  "limitations",
  "alternatives",
  "future",
  "outlook",
  "research",
  "report",
  "paper",
  "study",
  "analysis",
  "review",
  "about",
]);

const MIN_WORDS = 3;
const MAX_WORDS = 6;

function tokens(text: string): string[] {
  return text
    .replace(/[“”"'`]/g, " ")
    .split(/[^a-zA-Z0-9\u00c0-\u024f\u4e00-\u9fff+#.-]+/)
    .map((token) => token.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((token) => token.length > 1);
}

function words(text: string): string[] {
  return tokens(text).filter((token) => !STOPWORDS.has(token.toLowerCase()));
}

/**
 * A 3–6 word keyword query. Very short topics are padded with "research" so
 * the provider always gets a usable query rather than an empty string.
 */
export function keywordQuery(text: string, maxWords = MAX_WORDS): string {
  const clean = words(text);
  if (clean.length === 0) return "";
  const limited = clean.slice(0, Math.max(MIN_WORDS, Math.min(MAX_WORDS, maxWords)));
  for (const padding of ["research", "evidence", "overview"]) {
    if (limited.length >= MIN_WORDS) break;
    if (!limited.some((word) => word.toLowerCase() === padding)) limited.push(padding);
  }
  return limited.join(" ");
}

/**
 * Rewrite a zero-result query for a retry. Each attempt removes one generic
 * term, then one less distinctive term, keeping 3–6 words. The result is
 * always different from the original so a retry is a real new search.
 */
export function rewriteQuery(query: string, attempt: number): string {
  const base = words(query);
  if (base.length === 0) return attempt >= 2 ? "research evidence" : "research";
  const step = Math.max(1, attempt);

  const specific = base.filter((word) => !GENERIC.has(word.toLowerCase()));
  const candidates = specific.length >= MIN_WORDS ? specific : base;
  const drop = Math.min(Math.max(0, candidates.length - MIN_WORDS), step);
  let kept = candidates.slice(drop);

  if (kept.length === base.length && base.length > MIN_WORDS) kept = base.slice(1);
  if (kept.length < MIN_WORDS) kept = [...base.slice(0, MIN_WORDS), "research"];
  if (kept.join(" ") === query.trim().replace(/\s+/g, " ")) {
    // A rewrite must be a genuinely new query, even for an already short one.
    kept = base.slice(1);
    while (kept.length < MIN_WORDS) kept.push("evidence");
  }

  return kept.slice(0, MAX_WORDS).join(" ");
}

/** True when a query already has 3–6 useful words. */
export function isKeywordQuery(query: string): boolean {
  const count = words(query).length;
  return count >= MIN_WORDS && count <= MAX_WORDS;
}
