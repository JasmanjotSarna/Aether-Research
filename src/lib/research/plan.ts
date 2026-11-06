/** Research planning: one cheap JSON call with a deterministic fallback. */

import type { AgentMessage, Mode, ResearchSpec } from "../contract";
import { modeConfig } from "../config";
import { completeJsonWithFallback, type FailoverInfo } from "../llm/client";
import type { LLMProvider } from "../llm/provider";
import { buildPlannerMessages } from "../prompts";
import { keywordQuery } from "../search/query";

export interface ResearchPlan {
  objective: string;
  subtopics: string[];
  queries: string[];
  comparison: boolean;
}

export function detectComparison(text: string): boolean {
  return /\b(vs\.?|versus|compare|compared\s+(?:to|with)|comparison|differences?\s+between|pros\s+and\s+cons|trade-?offs?\s+between)\b/i.test(
    text
  );
}

export function comparisonEntities(topic: string): [string, string] | null {
  const cleaned = topic
    .replace(/^\s*(?:please\s+)?(?:compare|comparing|comparison\s+of)\s+/i, "")
    .replace(/\?+$/, "")
    .trim();
  const match = cleaned.match(/^(.{2,80}?)\s+(?:vs\.?|versus|and|or)\s+(.{2,80})$/i);
  if (!match) return null;
  const left = match[1]?.trim();
  const right = match[2]?.trim();
  if (!left || !right) return null;
  return [left.slice(0, 60), right.slice(0, 60)];
}

export function extractTopic(messages: AgentMessage[]): string {
  const lastUser = [...messages].reverse().find((message) => message.role === "user" && message.content.trim());
  if (!lastUser) return "";
  let topic = lastUser.content.trim();
  topic = topic
    .replace(/^(?:please\s+)?(?:can|could|would)\s+you\s+/i, "")
    .replace(
      /^(?:please\s+)?(?:research|investigate|look\s+into|find\s+out\s+about|deep\s+dive\s+into|analy[sz]e|study)\s+/i,
      ""
    )
    .replace(
      /^(?:please\s+)?(?:write|prepare|produce|draft|create|make|give\s+me)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:\d{1,4}[\s-]*(?:pages?|pgs?)\s+)?(?:(?:short|long|brief|detailed|technical|research|comparative)\s+)?(?:report|paper|brief|memo|summary|analysis|overview|essay)\s+(?:on|about|of|for)\s+/i,
      ""
    )
    .replace(/^(?:a|an)\s+(?:\d{1,4}[\s-]*(?:pages?|pgs?)\s+)?(?:(?:short|long|brief|detailed|technical|research|comparative)\s+)?(?:report|paper|brief|memo|summary|analysis|overview|essay)\s+(?:on|about|of|for)\s+/i, "")
    .replace(/^(?:report|paper|brief|memo|summary|analysis|overview|essay)\s+(?:on|about|of|for)\s+/i, "")
    .replace(/^\s*(?:\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:a4\s*)?(?:pages?|pgs?)\s*(?:on|about|of|for)?\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[?.!]+$/, "")
    .trim();
  return (topic || lastUser.content.trim()).slice(0, 300);
}

export function titleFromTopic(topic: string): string {
  const cleaned = topic.trim().replace(/\s+/g, " ");
  if (!cleaned) return "Untitled research";
  const title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return title.length > 100 ? `${title.slice(0, 97).trimEnd()}…` : title;
}

function defaultPlan(
  topic: string,
  mode: Mode,
  comparison: boolean,
  spec?: ResearchSpec
): ResearchPlan {
  const config = modeConfig(mode);
  const entities = comparison ? comparisonEntities(topic) : null;

  let queries: string[];
  if (entities) {
    const [left, right] = entities;
    queries = [
      `${left} vs ${right} comparison`,
      `${left} strengths weaknesses evidence`,
      `${right} strengths weaknesses evidence`,
      `${left} ${right} cost performance trade-offs`,
      `${left} ${right} benchmark study`,
      `${left} ${right} alternatives limitations`,
    ];
  } else {
    queries = [
      `${topic} overview`,
      `${topic} latest developments 2026`,
      `${topic} evidence and benchmarks`,
      `${topic} challenges and limitations`,
      `${topic} alternatives and comparison`,
      `${topic} future outlook`,
    ];
  }

  const plannedSubtopics =
    spec && spec.outline.length > 0
      ? spec.outline
          .map((entry) => entry.heading)
          .filter((heading) => !/^(?:abstract|introduction|methodology|conclusion)/i.test(heading))
      : [];

  const subtopics = comparison && entities
    ? [
        `Background: ${entities[0]} and ${entities[1]}`,
        `How ${entities[0]} works and where it is used`,
        `How ${entities[1]} works and where it is used`,
        "Head-to-head trade-offs, costs and performance",
        "Limitations, risks and open questions",
      ]
    : plannedSubtopics.length > 0
      ? [
          ...plannedSubtopics,
          ...(spec?.mustInclude ?? []),
          spec?.focus ? `Focus: ${spec.focus}` : "Limitations, risks and open questions",
        ]
      : [
          `Foundations and background of ${topic}`,
          `Current state of the art and key developments`,
          `Evidence, benchmarks and real-world results`,
          `Challenges, risks and limitations`,
          `Alternatives, comparison and outlook`,
        ];

  const focusQueries = spec?.focus
    ? [`${topic} ${spec.focus}`, `${spec.focus} evidence`]
    : [];
  const timeQueries = spec?.timeRange ? [`${topic} ${spec.timeRange}`] : [];

  return {
    objective: spec?.focus
      ? `Produce a balanced, source-grounded assessment of ${topic}, focused on ${spec.focus}.`
      : `Produce a balanced, source-grounded assessment of ${topic}.`,
    subtopics: Array.from(new Set(subtopics)).slice(
      0,
      Math.max(3, Math.min(6, config.queryCount + 2))
    ),
    queries: Array.from(
      new Set(
        [...focusQueries, ...timeQueries, ...queries]
          .map((query) => keywordQuery(query))
          .filter(Boolean)
      )
    ).slice(0, config.queryCount),
    comparison,
  };
}

function normalizePlan(value: unknown, fallback: ResearchPlan, mode: Mode): ResearchPlan | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { objective?: unknown; subtopics?: unknown; queries?: unknown };
  const objective = typeof record.objective === "string" ? record.objective.trim() : "";
  const subtopics = Array.isArray(record.subtopics)
    ? record.subtopics.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const queries = Array.isArray(record.queries)
    ? record.queries.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (!objective || subtopics.length === 0 || queries.length === 0) return null;

  const config = modeConfig(mode);
  const mergedQueries = Array.from(
    new Set(
      [...queries.map((q) => keywordQuery(q)), ...fallback.queries].filter(Boolean)
    )
  ).slice(0, config.queryCount);
  const mergedSubtopics = Array.from(
    new Set([...subtopics.map((s) => s.trim()), ...fallback.subtopics])
  ).slice(0, Math.min(5, config.queryCount + 1));

  return {
    objective: objective.slice(0, 400),
    subtopics: mergedSubtopics,
    queries: mergedQueries,
    comparison: fallback.comparison,
  };
}

export async function createPlan(
  topic: string,
  mode: Mode,
  providers: LLMProvider[],
  signal?: AbortSignal,
  onFailover?: (info: FailoverInfo) => void,
  spec?: ResearchSpec
): Promise<{ plan: ResearchPlan; provider?: LLMProvider }> {
  const comparison = detectComparison(spec?.focus ? `${topic} ${spec.focus}` : topic);
  const fallback = defaultPlan(topic, mode, comparison, spec);
  if (providers.length === 0 || signal?.aborted) return { plan: fallback };

  try {
    const result = await completeJsonWithFallback(
      providers,
      () =>
        buildPlannerMessages({
          topic,
          mode,
          comparison,
          spec,
        }),
      (value) => normalizePlan(value, fallback, mode),
      { temperature: 0.2, maxTokens: 700, timeoutMs: 60_000, signal, onFailover }
    );
    if (result) return { plan: result.data, provider: result.provider };
  } catch {
    // deterministic fallback is always available
  }

  return { plan: fallback };
}
