import { envKeys, healthSnapshot } from "@/lib/config";
import { validatedProviders } from "@/lib/llm/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const base = healthSnapshot();
  const keys = envKeys();

  let body = base;
  if (keys.groq || keys.openrouter) {
    try {
      const validation = await validatedProviders(keys);
      const first = validation.providers[0]?.model;
      body = {
        ...base,
        ...(first ? { model: first } : {}),
        models: {
          checked: validation.summary.checked,
          ...(validation.summary.groq ? { groq: toHealthCheck(validation.summary.groq) } : {}),
          ...(validation.summary.openrouter
            ? { openrouter: toHealthCheck(validation.summary.openrouter) }
            : {}),
          notes: validation.summary.notes,
        },
      };
    } catch {
      // A health check must never fail because validation failed; the base
      // snapshot still reports which keys are configured.
    }
  }

  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function toHealthCheck(check: {
  configured: string[];
  active: string[];
  dropped: string[];
  checked: boolean;
  error?: string;
}) {
  return {
    configured: check.configured,
    active: check.active,
    dropped: check.dropped,
    checked: check.checked,
    ...(check.error ? { note: check.error } : {}),
  };
}
