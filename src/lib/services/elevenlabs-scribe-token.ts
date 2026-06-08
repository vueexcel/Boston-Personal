import "server-only";
import { getServerEnv } from "@/lib/env/server";

const SCRIBE_TOKEN_URL =
  "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe";

/**
 * Mints a short-lived single-use token for browser Scribe Realtime (never expose API key).
 */
export async function createScribeSingleUseToken(): Promise<{ token: string }> {
  const env = getServerEnv();
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const response = await fetch(SCRIBE_TOKEN_URL, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs Scribe token failed (${response.status})${body ? `: ${body}` : ""}`,
    );
  }

  const data = (await response.json()) as { token?: string };
  const token = data.token?.trim();
  if (!token) {
    throw new Error("ElevenLabs returned an empty Scribe token");
  }

  return { token };
}
