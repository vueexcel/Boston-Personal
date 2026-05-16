import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

type GlobalEl = typeof globalThis & { __bostelElevenLabs?: ElevenLabsClient };

/**
 * Returns a shared ElevenLabs client for TTS / voice management (server-only).
 *
 * @throws When `ELEVENLABS_API_KEY` is not set.
 */
export function getElevenLabsClient(): ElevenLabsClient {
  const g = globalThis as GlobalEl;
  if (g.__bostelElevenLabs) {
    return g.__bostelElevenLabs;
  }
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }
  const client = new ElevenLabsClient({ apiKey: key });
  g.__bostelElevenLabs = client;
  return client;
}
