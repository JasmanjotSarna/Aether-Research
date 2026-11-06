/** Application identity — shared by the marketing site and the workspace. */

export const APP_NAME = "Aether";
export const APP_TAGLINE = "Think deeper. Discover further.";
export const APP_DESCRIPTION = "Autonomous Research Intelligence";

export const MODES = [
  {
    id: "quick",
    name: "Quick",
    duration: "~30s",
    description: "Fast, focused answer from a handful of sources.",
    sourcesTarget: "4 sources",
  },
  {
    id: "standard",
    name: "Standard",
    duration: "~1–2m",
    description: "Balanced multi-source research with page reading.",
    sourcesTarget: "8 sources",
  },
  {
    id: "deep",
    name: "Deep",
    duration: "~3–5m",
    description: "Wide search including academic literature, more pages read.",
    sourcesTarget: "12 sources",
  },
] as const;

export const SUGGESTED_RESEARCH_PROMPTS = [
  {
    title: "Compare RAG vs fine-tuning",
    subtitle: "Retrieval accuracy and cost trade-offs",
    mode: "standard" as const,
  },
  {
    title: "The state of small language models",
    subtitle: "Benchmarks, deployment limits and outlook",
    mode: "deep" as const,
  },
  {
    title: "How do mRNA vaccines work?",
    subtitle: "Mechanism, evidence and public-health impact",
    mode: "quick" as const,
  },
];
