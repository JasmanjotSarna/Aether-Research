/** Provider resolution and per-provider context budgets. */

import type { KeyBundle } from "../config";
import {
  groqEndpoint,
  groqJsonModel,
  groqModel,
  openRouterEndpoint,
  openRouterJsonModel,
  openRouterModels,
} from "../config";

export type ProviderName = "groq" | "openrouter";

export interface LLMProvider {
  name: ProviderName;
  endpoint: string;
  apiKey: string;
  /** Larger-context model used for the final paper. */
  model: string;
  /** Character budget for the whole prompt (system + user). */
  charBudget: number;
  /** Output cap for generated reports. */
  maxOutputTokens: number;
  /** Smaller/faster model for short JSON calls (planner, critic). */
  jsonModel: string;
}

/**
 * Providers in failover order: Groq first, then every configured free
 * OpenRouter model in the order the operator listed them.
 */
export function availableProviders(keys: KeyBundle): LLMProvider[] {
  const providers: LLMProvider[] = [];

  if (keys.groq) {
    providers.push({
      name: "groq",
      endpoint: groqEndpoint(),
      apiKey: keys.groq,
      model: groqModel(),
      charBudget: 14_000,
      maxOutputTokens: 2048,
      jsonModel: groqJsonModel(),
    });
  }

  if (keys.openrouter) {
    for (const model of openRouterModels()) {
      providers.push({
        name: "openrouter",
        endpoint: openRouterEndpoint(),
        apiKey: keys.openrouter,
        model,
        charBudget: 40_000,
        maxOutputTokens: 4096,
        jsonModel: openRouterJsonModel(),
      });
    }
  }

  return providers;
}

export function providerLabel(provider: LLMProvider): string {
  return provider.name === "groq" ? "Groq" : "OpenRouter";
}

/** A safe, human-readable identity for thinking/failover messages. */
export function providerId(provider: LLMProvider): string {
  return `${providerLabel(provider)} (${provider.model})`;
}
