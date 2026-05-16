import OpenAI from "openai";

type GlobalOpenAI = typeof globalThis & { __bostelOpenAI?: OpenAI };

/**
 * Returns a shared OpenAI client (server-only).
 *
 * @throws When `OPENAI_API_KEY` is not set.
 */
export function getOpenAIClient(): OpenAI {
  const g = globalThis as GlobalOpenAI;
  if (g.__bostelOpenAI) {
    return g.__bostelOpenAI;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const client = new OpenAI({ apiKey: key });
  g.__bostelOpenAI = client;
  return client;
}
