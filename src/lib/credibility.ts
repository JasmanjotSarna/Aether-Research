/**
 * Transparent source credibility scoring (ported from the Python project).
 *
 * The score describes structural reliability of the publisher — not proof that
 * every statement is true. It is intentionally explainable.
 */

import type { SourceKind } from "./contract";
import { looksLikeHttpUrl } from "./security/url";

const ACADEMIC_DOMAINS = new Set([
  "arxiv.org",
  "nature.com",
  "science.org",
  "sciencemag.org",
  "acm.org",
  "ieee.org",
  "nih.gov",
  "ncbi.nlm.nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "cdc.gov",
  "who.int",
  "nasa.gov",
  "openalex.org",
  "semanticscholar.org",
  "jstor.org",
  "springer.com",
  "link.springer.com",
  "sciencedirect.com",
  "plos.org",
  "frontiersin.org",
  "mdpi.com",
  "cell.com",
  "thelancet.com",
  "nejm.org",
  "mit.edu",
  "stanford.edu",
  "harvard.edu",
  "berkeley.edu",
  "ox.ac.uk",
  "cam.ac.uk",
]);

const OFFICIAL_DOCS = new Set([
  "docs.python.org",
  "developer.mozilla.org",
  "github.com",
  "kubernetes.io",
  "react.dev",
  "nextjs.org",
  "vercel.com",
  "pytorch.org",
  "tensorflow.org",
  "huggingface.co",
  "openai.com",
  "anthropic.com",
  "google.com",
  "cloud.google.com",
  "aws.amazon.com",
  "learn.microsoft.com",
  "microsoft.com",
  "nodejs.org",
  "w3.org",
  "ietf.org",
  "rfc-editor.org",
]);

const ENCYCLOPEDIAS = new Set([
  "wikipedia.org",
  "britannica.com",
  "plato.stanford.edu",
  "encyclopedia.com",
]);

const RESPECTED_NEWS = new Set([
  "reuters.com",
  "apnews.com",
  "bloomberg.com",
  "bbc.com",
  "bbc.co.uk",
  "nytimes.com",
  "wsj.com",
  "ft.com",
  "theguardian.com",
  "theverge.com",
  "arstechnica.com",
  "wired.com",
  "nature.com",
  "scientificamerican.com",
]);

const BLOG_PLATFORMS = ["medium.com", "substack.com", "blogspot.com", "wordpress.com", "tumblr.com"];

function normalizeDomain(input: string): string {
  let host = input.trim().toLowerCase();
  try {
    if (host.includes("://")) host = new URL(host).hostname;
  } catch {
    // keep raw
  }
  return host.replace(/^www\./, "").replace(/\.$/, "");
}

function inferKind(domain: string, pathname: string, provided?: SourceKind): SourceKind {
  if (provided === "academic" || provided === "encyclopedia" || provided === "docs") return provided;
  if (
    ACADEMIC_DOMAINS.has(domain) ||
    domain.endsWith(".edu") ||
    domain.endsWith(".ac.uk") ||
    domain.endsWith(".ac.jp") ||
    domain.endsWith(".edu.au")
  ) {
    return "academic";
  }
  if (ENCYCLOPEDIAS.has(domain) || domain.endsWith(".wikipedia.org")) return "encyclopedia";
  if (
    OFFICIAL_DOCS.has(domain) ||
    domain.endsWith(".gov") ||
    domain.endsWith(".gov.uk") ||
    domain.endsWith(".gov.in") ||
    /^\/(docs?|documentation|reference|api)(\/|$)/i.test(pathname)
  ) {
    return "docs";
  }
  return "web";
}

export interface CredibilityResult {
  score: number;
  reason: string;
  kind: SourceKind;
}

export function assessSource(
  url: string,
  options: {
    title?: string;
    kind?: SourceKind;
    publishedAt?: string;
  } = {}
): CredibilityResult {
  let domain = "";
  let pathname = "";
  try {
    const parsed = new URL(url);
    domain = normalizeDomain(parsed.hostname);
    pathname = parsed.pathname;
  } catch {
    domain = normalizeDomain(url);
  }

  const kind = inferKind(domain, pathname, options.kind);
  const reasons: string[] = [];
  let score = 0.5;

  if (ACADEMIC_DOMAINS.has(domain)) {
    score += 0.35;
    reasons.push(`Recognised academic or scientific publisher (${domain})`);
  } else if (domain.endsWith(".edu") || domain.endsWith(".ac.uk") || domain.endsWith(".ac.jp")) {
    score += 0.3;
    reasons.push("Accredited educational domain (.edu/.ac)");
  } else if (domain.endsWith(".gov") || domain.endsWith(".gov.uk") || domain.endsWith(".gov.in")) {
    score += 0.3;
    reasons.push("Government or public-agency domain (.gov)");
  } else if (OFFICIAL_DOCS.has(domain) || /^\/(docs?|documentation|reference|api)(\/|$)/i.test(pathname)) {
    score += 0.25;
    reasons.push(`Official developer or vendor documentation (${domain})`);
  } else if (ENCYCLOPEDIAS.has(domain) || domain.endsWith(".wikipedia.org")) {
    score += 0.2;
    reasons.push("Peer-moderated encyclopedic source");
  } else if (RESPECTED_NEWS.has(domain)) {
    score += 0.1;
    reasons.push(`Established news organisation (${domain})`);
  } else if (BLOG_PLATFORMS.some((platform) => domain === platform || domain.endsWith(`.${platform}`))) {
    score -= 0.15;
    reasons.push("Self-published blog platform; verify independently");
  } else {
    reasons.push("General web source; no recognised publisher signal");
  }

  if (options.publishedAt) {
    score += 0.05;
    reasons.push(`Publication date available (${options.publishedAt.slice(0, 10)})`);
  } else {
    reasons.push("Publication date not machine-verifiable");
  }

  if (kind === "academic") {
    reasons.push("Classified as academic literature");
  } else if (kind === "encyclopedia") {
    reasons.push("Classified as an encyclopedia entry");
  } else if (kind === "docs") {
    reasons.push("Classified as primary documentation");
  }

  return {
    score: Math.max(0.1, Math.min(0.98, Math.round(score * 100) / 100)),
    reason: reasons.join(" · "),
    kind,
  };
}

export function isHttpUrl(url: string): boolean {
  return looksLikeHttpUrl(url);
}
