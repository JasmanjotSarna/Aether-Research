/**
 * Deterministic evidence extraction (free, no LLM).
 * Pulls the most topic-relevant sentences from each source and keeps the
 * citation id attached, so the writer receives auditable quotations.
 */

import type { ResearchSource } from "../search/types";
import { cleanSourceText } from "../security/content";

export interface Evidence {
  sourceId: string;
  text: string;
}

const BOILERPLATE = [
  "cookie",
  "subscribe",
  "sign in",
  "log in",
  "all rights reserved",
  "privacy policy",
  "terms of service",
  "javascript",
  "enable javascript",
  "advertisement",
];

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘(])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 360);
}

function terms(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff]+/i)
        .filter((term) => term.length > 2)
    )
  );
}

function scoreSentence(sentence: string, topicTerms: string[]): number {
  const lower = sentence.toLowerCase();
  let score = 0;
  for (const term of topicTerms) if (lower.includes(term)) score += 1;
  if (/\d/.test(sentence)) score += 0.6;
  if (/(percent|%|million|billion|study|report|according to|compared|increase|decrease)/i.test(sentence)) {
    score += 0.5;
  }
  if (/(however|although|limitation|risk|challenge|disadvantage)/i.test(sentence)) score += 0.4;
  if (sentence.length > 260) score -= 0.2;
  return score;
}

export function extractEvidence(
  sources: ResearchSource[],
  topic: string,
  subtopics: string[] = [],
  perSource = 3,
  maxTotal = 30
): Evidence[] {
  const topicTerms = terms(`${topic} ${subtopics.join(" ")}`);
  const results: Evidence[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    const text = cleanSourceText(source.content || source.snippet, 12_000);
    const sentences = splitSentences(text).filter(
      (sentence) => !BOILERPLATE.some((phrase) => sentence.toLowerCase().includes(phrase))
    );

    const ranked = sentences
      .map((sentence) => ({ sentence, score: scoreSentence(sentence, topicTerms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, perSource);

    for (const item of ranked) {
      const key = item.sentence.toLowerCase().slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ sourceId: source.id, text: item.sentence });
      if (results.length >= maxTotal) return results;
    }

    if (ranked.length === 0) {
      const fallback = sentences[0] ?? source.snippet;
      if (fallback) {
        const key = fallback.toLowerCase().slice(0, 120);
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ sourceId: source.id, text: fallback.slice(0, 300) });
        }
      }
    }
  }

  return results;
}
