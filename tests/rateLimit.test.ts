import { beforeEach, describe, expect, it } from "vitest";
import { checkResearchRate, clientIp, resetRateLimit } from "@/lib/http/rateLimit";

describe("research rate limit", () => {
  beforeEach(() => resetRateLimit());

  it("allows six runs per IP per hour and rejects the seventh", () => {
    const start = 1_700_000_000_000;
    for (let index = 0; index < 6; index++) {
      expect(checkResearchRate("203.0.113.7", start + index).allowed).toBe(true);
    }
    const blocked = checkResearchRate("203.0.113.7", start + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks IPs independently", () => {
    const start = 1_700_000_000_000;
    for (let index = 0; index < 6; index++) checkResearchRate("198.51.100.1", start);
    expect(checkResearchRate("198.51.100.1", start).allowed).toBe(false);
    expect(checkResearchRate("198.51.100.2", start).allowed).toBe(true);
  });

  it("expires entries after the window", () => {
    const start = 1_700_000_000_000;
    for (let index = 0; index < 6; index++) checkResearchRate("192.0.2.4", start);
    expect(checkResearchRate("192.0.2.4", start + 60 * 60 * 1000 + 1).allowed).toBe(true);
  });

  it("reads the first forwarded IP safely", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientIp(headers)).toBe("203.0.113.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
