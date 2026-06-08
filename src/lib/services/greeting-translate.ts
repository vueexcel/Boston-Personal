import { createHash } from "node:crypto";
import { getOpenAIClient } from "@/lib/integrations/openai";
import {
  flashV25LanguageLabel,
  toElevenLabsTtsLanguageCode,
  type ElevenFlashV25LanguageCode,
} from "@/lib/integrations/elevenlabs-flash-v25-languages";
import { getServerEnv } from "@/lib/env/server";
import {
  ENGLISH_GENERIC_GREETING,
  getLocalizedFallbackPhrase,
} from "@/lib/tenant-portal/agent-greeting-defaults";

export type ResolveLocalizedGreetingParams = {
  text: string | null | undefined;
  targetLanguage: string | null | undefined;
  sourceLanguage?: string | null;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
  value: string;
  expiresAt: number;
};

const greetingCache = new Map<string, CacheEntry>();

/** Cache key for tests and debugging. */
export function greetingCacheKey(
  text: string,
  targetLanguage: ElevenFlashV25LanguageCode,
): string {
  const hash = createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);
  return `${targetLanguage}:${hash}`;
}

function readCache(key: string): string | null {
  const entry = greetingCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    greetingCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key: string, value: string): void {
  greetingCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/** Clears in-memory greeting translation cache (tests). */
export function clearGreetingTranslationCache(): void {
  greetingCache.clear();
}

async function translateGreetingWithOpenAi(
  text: string,
  targetLanguage: ElevenFlashV25LanguageCode,
  sourceLanguage: ElevenFlashV25LanguageCode,
): Promise<string | null> {
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY?.trim()) {
    console.warn(
      "[greeting-translate] OPENAI_API_KEY not configured; using stored greeting",
    );
    return null;
  }

  const targetLabel = flashV25LanguageLabel(targetLanguage);
  const sourceLabel = flashV25LanguageLabel(sourceLanguage);

  try {
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You translate business phone-agent opening greetings.
Translate from ${sourceLabel} to ${targetLabel}.
Keep a warm, professional phone tone. Preserve intent and length (1-2 short sentences).
Output ONLY the translated greeting text — no quotes, labels, or explanation.`,
        },
        { role: "user", content: text },
      ],
    });

    const translated = completion.choices[0]?.message?.content?.trim();
    return translated || null;
  } catch (err) {
    console.warn(
      "[greeting-translate] translation failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Resolves the greeting spoken at call/runtime for the agent's configured language.
 * Stored portal text is unchanged; English passes through when target is English.
 */
export async function resolveLocalizedGreeting(
  params: ResolveLocalizedGreetingParams,
): Promise<string> {
  const targetCode = toElevenLabsTtsLanguageCode(params.targetLanguage);
  const sourceCode = toElevenLabsTtsLanguageCode(
    params.sourceLanguage ?? "en",
  );
  const trimmed = params.text?.trim() ?? "";

  if (!trimmed) {
    return getLocalizedFallbackPhrase(targetCode);
  }

  if (targetCode === "en") {
    return trimmed;
  }

  const cacheKey = greetingCacheKey(trimmed, targetCode);
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const translated = await translateGreetingWithOpenAi(
    trimmed,
    targetCode,
    sourceCode,
  );

  const result = translated ?? trimmed;
  writeCache(cacheKey, result);
  return result;
}

/** English default when callers need a explicit constant. */
export { ENGLISH_GENERIC_GREETING };
