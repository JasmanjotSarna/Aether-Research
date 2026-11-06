/**
 * Deterministic page estimate for the exported PDF. Kept free of pdf-lib so
 * the agent can record `pagesEstimated` without rendering a document.
 */

const WORDS_PER_PAGE = 450;

function clampPages(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(60, value));
}

/**
 * Rough A4 page count: body words at 450/page plus a small allowance for the
 * cover, reference list and research log. Deterministic for the same input.
 */
export function estimateReportPages(markdown: string, sourceCount: number): number {
  const words = (markdown.match(/\S+/g) ?? []).length;
  const body = words / WORDS_PER_PAGE;
  const extras = 0.5 + Math.min(2, Math.max(0, sourceCount) / 25);
  return clampPages(Math.round(body + extras));
}

/** How far a rendered page count is from the requested target. */
export function withinPageTolerance(actual: number, target: number | undefined): boolean {
  if (!target) return true;
  return Math.abs(actual - target) <= 1;
}
