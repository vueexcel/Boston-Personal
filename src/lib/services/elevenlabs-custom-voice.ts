import { getElevenLabsClient } from "@/lib/integrations/elevenlabs";
import { getServerEnv } from "@/lib/env/server";
import { invalidateElevenLabsVoiceCache } from "@/lib/services/elevenlabs-voice-resolve";

export type CreateInstantVoiceCloneResult =
  | { ok: true; voiceId: string; requiresVerification: boolean }
  | { ok: false; error: string };

/**
 * Creates an Instant Voice Clone in the ElevenLabs workspace linked to ELEVENLABS_API_KEY.
 * @see https://elevenlabs.io/docs/overview/capabilities/voices
 */
export async function createElevenLabsInstantVoiceClone(input: {
  displayName: string;
  sample: Buffer;
  filename: string;
  mimeType: string;
}): Promise<CreateInstantVoiceCloneResult> {
  const env = getServerEnv();
  if (!env.ELEVENLABS_API_KEY?.trim()) {
    return { ok: false, error: "ELEVENLABS_API_KEY is not configured" };
  }

  const name = input.displayName.trim();
  if (!name) {
    return { ok: false, error: "Voice name is required" };
  }

  const safeName = input.filename.trim() || "sample.mp3";

  try {
    const client = getElevenLabsClient();
    const created = await client.voices.ivc.create({
      name,
      files: [
        {
          data: input.sample,
          filename: safeName,
          contentType: input.mimeType || "application/octet-stream",
        },
      ],
    });
    invalidateElevenLabsVoiceCache();
    return {
      ok: true,
      voiceId: created.voiceId,
      requiresVerification: created.requiresVerification,
    };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "ElevenLabs voice creation failed";
    return { ok: false, error: message };
  }
}
