import { getVoiceTuningConfig } from "@/lib/voice/voice-tuning";

export type ElevenLabsSttConfig = {
  modelId: string;
  audioFormat: string;
  vadSilenceThresholdSecs: number;
  vadThreshold: number;
  minSpeechDurationMs: number;
  minSilenceDurationMs: number;
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

/** Env-backed config for ElevenLabs Scribe v2 Realtime on PSTN calls. */
export function getElevenLabsSttConfig(): ElevenLabsSttConfig {
  const endpointMs = getVoiceTuningConfig().endpointSilenceMs;
  const derivedSilenceSecs = Math.max(0.3, Math.min(3, endpointMs / 1000));

  return {
    modelId:
      process.env.ELEVENLABS_STT_MODEL?.trim() || "scribe_v2_realtime",
    audioFormat:
      process.env.ELEVENLABS_STT_AUDIO_FORMAT?.trim() || "ulaw_8000",
    vadSilenceThresholdSecs: parseFloatEnv(
      "ELEVENLABS_STT_VAD_SILENCE_SECS",
      derivedSilenceSecs,
    ),
    vadThreshold: parseFloatEnv("ELEVENLABS_STT_VAD_THRESHOLD", 0.4),
    minSpeechDurationMs: parseIntEnv(
      "ELEVENLABS_STT_MIN_SPEECH_MS",
      100,
    ),
    minSilenceDurationMs: parseIntEnv(
      "ELEVENLABS_STT_MIN_SILENCE_MS",
      100,
    ),
  };
}

export function isElevenLabsSttEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}
