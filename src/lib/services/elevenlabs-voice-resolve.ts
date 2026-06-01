import { listPortalElevenLabsVoices } from "@/lib/services/elevenlabs-voices";

export type ResolveConvaiVoiceResult = {
  /** Voice id to send to ConvAI `tts.voiceId`, or null to omit TTS voice override. */
  voiceId: string | null;
  /** Human-readable warning when the requested id was invalid or missing. */
  warning?: string;
};

let voiceIdCache: {
  expiresAt: number;
  ids: Set<string>;
  defaultVoiceId: string | null;
  labels: Map<string, string>;
} | null = null;

const VOICE_CACHE_TTL_MS = 60_000;

async function loadAccountVoiceIndex(): Promise<{
  ids: Set<string>;
  defaultVoiceId: string | null;
  labels: Map<string, string>;
}> {
  const now = Date.now();
  if (voiceIdCache && voiceIdCache.expiresAt > now) {
    return {
      ids: voiceIdCache.ids,
      defaultVoiceId: voiceIdCache.defaultVoiceId,
      labels: voiceIdCache.labels,
    };
  }

  const { voices, error } = await listPortalElevenLabsVoices();
  if (error) {
    throw new Error(error);
  }

  const ids = new Set<string>();
  const labels = new Map<string, string>();
  for (const v of voices) {
    ids.add(v.voiceId);
    labels.set(v.voiceId, v.name);
  }

  const premade =
    voices.find((v) => v.category.toLowerCase() === "premade") ?? voices[0];
  const defaultVoiceId = premade?.voiceId ?? null;

  voiceIdCache = {
    expiresAt: now + VOICE_CACHE_TTL_MS,
    ids,
    defaultVoiceId,
    labels,
  };

  return { ids, defaultVoiceId, labels };
}

function formatVoiceLabel(voiceId: string, labels: Map<string, string>): string {
  const name = labels.get(voiceId);
  return name ? `${name} (${voiceId})` : voiceId;
}

/**
 * Resolves a portal `voice_id` to an id that exists in the linked ElevenLabs account.
 * ConvAI and TTS reject unknown ids (e.g. placeholder `voice_rachel`).
 *
 * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */
export async function resolveConvaiTtsVoiceId(
  preferredVoiceId: string | null | undefined,
): Promise<ResolveConvaiVoiceResult> {
  const requested = preferredVoiceId?.trim();
  const { ids, defaultVoiceId, labels } = await loadAccountVoiceIndex();

  if (!requested) {
    if (defaultVoiceId) {
      return {
        voiceId: defaultVoiceId,
        warning: `No voice selected on this agent. Using ${formatVoiceLabel(defaultVoiceId, labels)} for the test session.`,
      };
    }
    return { voiceId: null };
  }

  if (ids.size === 0) {
    return {
      voiceId: null,
      warning:
        "No voices found in your ElevenLabs account. Add a voice in the Voice tab or ElevenLabs dashboard, then try again.",
    };
  }

  if (ids.has(requested)) {
    return { voiceId: requested };
  }

  const caseMatch = Array.from(ids).find(
    (id) => id.toLowerCase() === requested.toLowerCase(),
  );
  if (caseMatch) {
    return { voiceId: caseMatch };
  }

  if (defaultVoiceId) {
    return {
      voiceId: defaultVoiceId,
      warning: `Voice "${requested}" was not found in your ElevenLabs account. Using ${formatVoiceLabel(defaultVoiceId, labels)} instead. Choose a valid voice on the Voice tab and save.`,
    };
  }

  return {
    voiceId: null,
    warning: `Voice "${requested}" was not found in your ElevenLabs account. ConvAI will use the platform default until you select a valid voice.`,
  };
}

/** Clears cached voice list (e.g. after creating a custom voice). */
export function invalidateElevenLabsVoiceCache(): void {
  voiceIdCache = null;
}

export function convaiTtsConfig(
  voiceId: string | null,
): { tts: { voiceId: string } } | Record<string, never> {
  if (!voiceId?.trim()) return {};
  return { tts: { voiceId: voiceId.trim() } };
}
