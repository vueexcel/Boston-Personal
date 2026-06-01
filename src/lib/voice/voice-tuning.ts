/**
 * Env-backed tuning for PSTN voice (barge-in, endpointing). Twilio RTT has no silence/VAD knobs.
 */
export type VoiceTuningConfig = {
  partialStabilityMin: number;
  bargeInMinChars: number;
  endpointSilenceMs: number;
  endpointMinChars: number;
};

function parseFloatEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function getVoiceTuningConfig(): VoiceTuningConfig {
  return {
    partialStabilityMin: parseFloatEnv("VOICE_PARTIAL_STABILITY_MIN", 0.85),
    bargeInMinChars: parseIntEnv("VOICE_BARGE_IN_MIN_CHARS", 3),
    endpointSilenceMs: parseIntEnv("VOICE_ENDPOINT_SILENCE_MS", 450),
    endpointMinChars: parseIntEnv("VOICE_ENDPOINT_MIN_CHARS", 2),
  };
}

export function getVoiceOpenAiModel(): string {
  return (
    process.env.VOICE_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

export function getElevenLabsTtsModel(): string {
  return process.env.ELEVENLABS_TTS_MODEL?.trim() || "eleven_flash_v2_5";
}
