/**
 * Best-effort in-memory rate limit for research runs.
 *
 * Vercel may run several instances, so this is a per-instance guard, not a
 * global quota. Requests that carry any BYOK header are not counted.
 */

const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 6;

const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
}

function prune(list: number[], now: number): number[] {
  const cutoff = now - WINDOW_MS;
  let index = 0;
  while (index < list.length && (list[index] ?? 0) <= cutoff) index += 1;
  return index > 0 ? list.slice(index) : list;
}

export function checkResearchRate(ip: string, now = Date.now()): RateLimitResult {
  const key = ip.trim().slice(0, 80) || "unknown";
  const list = prune(buckets.get(key) ?? [], now);

  if (list.length >= LIMIT) {
    buckets.set(key, list);
    const oldest = list[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
      limit: LIMIT,
    };
  }

  list.push(now);
  buckets.set(key, list);

  // Opportunistic cleanup so a long-lived instance does not leak keys.
  if (buckets.size > 5_000) {
    for (const [bucketKey, timestamps] of buckets) {
      if (prune(timestamps, now).length === 0) buckets.delete(bucketKey);
    }
  }

  return {
    allowed: true,
    remaining: LIMIT - list.length,
    retryAfterSeconds: 0,
    limit: LIMIT,
  };
}

export function resetRateLimit(): void {
  buckets.clear();
}

/** Resolve the best available client IP from proxy headers. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && first.length <= 64) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real && real.length <= 64) return real;
  return "unknown";
}
