import { getElevenLabsClient } from "@/lib/integrations/elevenlabs";
import { getServerEnv } from "@/lib/env/server";

export type PortalElevenLabsVoice = {
  voiceId: string;
  name: string;
  category: string;
  description: string | null;
  /** From ElevenLabs voice labels, e.g. female / male / neutral */
  gender: string | null;
};

/**
 * Lists voices from the ElevenLabs account linked to `ELEVENLABS_API_KEY`.
 * Returns an empty list when the key is missing or the vendor call fails.
 */
export async function listPortalElevenLabsVoices(): Promise<{
  voices: PortalElevenLabsVoice[];
  error: string | null;
}> {
  const env = getServerEnv();
  if (!env.ELEVENLABS_API_KEY?.trim()) {
    return { voices: [], error: null };
  }

  try {
    const client = getElevenLabsClient();
    const res = await client.voices.getAll({ showLegacy: true });
    const raw = res.voices ?? [];

    const voices: PortalElevenLabsVoice[] = [];
    for (const v of raw) {
      const voiceId =
        v.voiceId ??
        (v as unknown as { voice_id?: string }).voice_id ??
        "";
      if (!voiceId) continue;
      const rawLabels = (v as { labels?: Record<string, string> }).labels;
      const gender =
        rawLabels && typeof rawLabels.gender === "string"
          ? rawLabels.gender.trim().toLowerCase()
          : null;

      voices.push({
        voiceId,
        name: (v.name && v.name.trim()) || voiceId,
        category: v.category != null ? String(v.category) : "",
        description: v.description ?? null,
        gender: gender || null,
      });
    }

    voices.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );

    return { voices, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "ElevenLabs request failed";
    return { voices: [], error: message };
  }
}
