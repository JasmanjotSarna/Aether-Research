/**
 * SSRF-safe outbound URL validation and fetching.
 *
 * Protects against loopback, RFC1918 private ranges, link-local/cloud metadata,
 * IPv6 unique-local/link-local, credentials in URLs, non-HTTP protocols,
 * redirect chains, oversized responses and slow hosts.
 *
 * DNS is resolved before every hop. Note: Node's fetch resolves again at
 * connect time, so a hostile DNS server could still rebind between check and
 * connect; this guard is best-effort in a serverless runtime, which is the
 * standard mitigation available without a custom socket agent.
 */

import dns from "node:dns/promises";
import net from "node:net";
import { UnsafeUrlError } from "../errors";
import { fetchWithTimeout, isAbort } from "../net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.google",
  "instance-data",
]);

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inV4Range(ip: string, base: string, bits: number): boolean {
  const n = ipv4ToNumber(ip);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (n & mask) === (ipv4ToNumber(base) & mask);
}

function isPrivateIpv4(ip: string): boolean {
  return (
    inV4Range(ip, "0.0.0.0", 8) ||
    inV4Range(ip, "10.0.0.0", 8) ||
    inV4Range(ip, "100.64.0.0", 10) ||
    inV4Range(ip, "127.0.0.0", 8) ||
    inV4Range(ip, "169.254.0.0", 16) ||
    inV4Range(ip, "172.16.0.0", 12) ||
    inV4Range(ip, "192.0.0.0", 24) ||
    inV4Range(ip, "192.0.2.0", 24) ||
    inV4Range(ip, "192.168.0.0", 16) ||
    inV4Range(ip, "198.18.0.0", 15) ||
    inV4Range(ip, "198.51.100.0", 24) ||
    inV4Range(ip, "203.0.113.0", 24) ||
    inV4Range(ip, "224.0.0.0", 4) ||
    inV4Range(ip, "240.0.0.0", 4)
  );
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split("%")[0] ?? "";
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (net.isIPv4(mapped)) return isPrivateIpv4(mapped);
  }
  if (/^f[cd]/.test(normalized)) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(normalized)) return true; // fe80::/10 link local
  if (/^ff/.test(normalized)) return true; // multicast
  if (normalized.startsWith("2001:db8")) return true; // documentation
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (net.isIPv6(ip)) return isPrivateIpv6(ip);
  return true;
}

export interface UrlSafety {
  safe: boolean;
  url?: URL;
  reason?: string;
}

/** Synchronous shape check used to filter search results before storage. */
export function looksLikeHttpUrl(raw: string): boolean {
  if (!raw || raw.length > 2048) return false;
  try {
    const url = new URL(raw);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
    if (!host) return false;
    if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
      return false;
    }
    if (net.isIP(host) && isPrivateIp(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function validateOutboundUrl(rawUrl: string): Promise<UrlSafety> {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { safe: false, reason: "URL is empty or invalid" };
  }
  if (rawUrl.length > 2048) {
    return { safe: false, reason: "URL exceeds the 2048 character limit" };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { safe: false, reason: `Blocked protocol: ${url.protocol}` };
  }
  if (url.username || url.password) {
    return { safe: false, reason: "URLs with embedded credentials are blocked" };
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!hostname) return { safe: false, reason: "URL has no hostname" };
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localhost")
  ) {
    return { safe: false, reason: `Blocked private hostname: ${hostname}` };
  }

  if (net.isIP(hostname)) {
    return isPrivateIp(hostname)
      ? { safe: false, reason: `Blocked private or reserved IP: ${hostname}` }
      : { safe: true, url };
  }

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!records.length) return { safe: false, reason: "Hostname did not resolve" };
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        return {
          safe: false,
          reason: `Hostname resolves to a private or reserved address (${record.address})`,
        };
      }
    }
  } catch {
    return { safe: false, reason: "Hostname could not be resolved" };
  }

  return { safe: true, url };
}

const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "application/xml",
  "text/xml",
  "application/json",
];

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  requireHtml?: boolean;
  accept?: string;
  signal?: AbortSignal;
}

export interface SafeFetchResult {
  status: number;
  finalUrl: string;
  contentType: string;
  text: string;
  truncated: boolean;
}

export const READER_TIMEOUT_MS = 8_000;
export const READER_MAX_REDIRECTS = 3;
export const READER_MAX_BYTES = 2_000_000;

export async function safeFetchText(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? READER_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? READER_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? READER_MAX_REDIRECTS;

  let current = rawUrl;
  let lastError: unknown;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safety = await validateOutboundUrl(current);
    if (!safety.safe || !safety.url) {
      throw new UnsafeUrlError(safety.reason ?? "Blocked outbound URL");
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(
        safety.url,
        {
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; AetherResearch/3.0; +https://github.com/aether-research) research-agent",
            Accept:
              options.accept ??
              "text/html,application/xhtml+xml,text/plain,application/xml;q=0.9,*/*;q=0.4",
            "Accept-Language": "en-US,en;q=0.8",
          },
        },
        timeoutMs,
        options.signal
      );
    } catch (error) {
      lastError = error;
      if (isAbort(error)) throw new UnsafeUrlError("Outbound request timed out");
      throw new UnsafeUrlError("Could not reach the requested URL");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new UnsafeUrlError("Redirect without a Location header");
      current = new URL(location, safety.url).toString();
      continue;
    }

    if (!response.ok) {
      throw new UnsafeUrlError(`Remote server returned HTTP ${response.status}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const baseType = contentType.split(";")[0]?.trim() ?? "";
    const allowed = ALLOWED_CONTENT_TYPES.some((type) => baseType.includes(type));
    if (!allowed) {
      throw new UnsafeUrlError(`Unsupported remote content type: ${baseType || "unknown"}`);
    }
    if (options.requireHtml && !baseType.includes("html") && !baseType.includes("xml")) {
      throw new UnsafeUrlError("Expected an HTML page");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new UnsafeUrlError("Remote response had no body");

    const chunks: Uint8Array[] = [];
    let received = 0;
    let truncated = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        const keep = Math.max(0, value.byteLength - (received - maxBytes));
        if (keep > 0) chunks.push(value.slice(0, keep));
        truncated = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
    }

    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      status: response.status,
      finalUrl: safety.url.toString(),
      contentType: baseType,
      text: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
      truncated,
    };
  }

  throw new UnsafeUrlError(
    lastError instanceof Error ? `Too many redirects: ${lastError.message}` : "Too many redirects"
  );
}
