/**
 * Env-backed tuning for PSTN voice (barge-in, endpointing, TTS pacing).
 */
export type VoiceTuningConfig = {
  partialStabilityMin: number;
  bargeInMinChars: number;
  bargeInOnlyFinal: boolean;
  endpointSilenceMs: number;
  endpointMinChars: number;
  postEndpointDelayMs: number;
  ttsFrameDelayMs: number;
  ttsSpeed: number;
  ttsStability: number;
  ttsSimilarityBoost: number;
  ttsStyle: number;
  ttsUseSpeakerBoost: boolean;
  ttsStreamingLatency: number;
  callerInactivitySec: number;
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

function parseBoolEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return fallback;
}

export function getVoiceTuningConfig(): VoiceTuningConfig {
  return {
    partialStabilityMin: parseFloatEnv("VOICE_PARTIAL_STABILITY_MIN", 0.85),
    bargeInMinChars: parseIntEnv("VOICE_BARGE_IN_MIN_CHARS", 12),
    bargeInOnlyFinal: parseBoolEnv("VOICE_BARGE_IN_ONLY_FINAL", true),
    endpointSilenceMs: parseIntEnv("VOICE_ENDPOINT_SILENCE_MS", 1300),
    endpointMinChars: parseIntEnv("VOICE_ENDPOINT_MIN_CHARS", 2),
    postEndpointDelayMs: parseIntEnv("VOICE_POST_ENDPOINT_DELAY_MS", 300),
    ttsFrameDelayMs: parseIntEnv("VOICE_TTS_FRAME_DELAY_MS", 10),
    ttsSpeed: parseFloatEnv("VOICE_TTS_SPEED", 0.95),
    ttsStability: parseFloatEnv("VOICE_TTS_STABILITY", 0.5),
    ttsSimilarityBoost: parseFloatEnv("VOICE_TTS_SIMILARITY_BOOST", 0.75),
    ttsStyle: parseFloatEnv("VOICE_TTS_STYLE", 0),
    ttsUseSpeakerBoost: parseBoolEnv("VOICE_TTS_USE_SPEAKER_BOOST", true),
    ttsStreamingLatency: parseIntEnv("VOICE_TTS_STREAMING_LATENCY", 0),
    callerInactivitySec: parseIntEnv("VOICE_CALLER_INACTIVITY_SEC", 30),
  };
}

export function getVoiceOpenAiModel(): string {
  return (
    process.env.VOICE_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}
