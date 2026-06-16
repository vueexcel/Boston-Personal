import { getVoiceTuningConfig } from "@/lib/voice/voice-tuning";

export type TtsDeliveryProfile = "preview" | "browser_test" | "telephony";

export type TtsMediaFormat = "mulaw" | "mp3";

export type TtsVoiceSettings = {
  speed: number;
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
};

export type TtsConfigSnapshot = {
  profile: TtsDeliveryProfile;
  model: string;
  outputFormat: string;
  mediaFormat: TtsMediaFormat;
  voiceSettings: TtsVoiceSettings | null;
  streamingLatency: number;
};

/** ElevenLabs TTS model id (env: ELEVENLABS_TTS_MODEL). */
export function getElevenLabsTtsModel(): string {
  return process.env.ELEVENLABS_TTS_MODEL?.trim() || "eleven_flash_v2_5";
}

function telephonyVoiceSettings(): TtsVoiceSettings {
  const tuning = getVoiceTuningConfig();
  return {
    speed: Math.max(0.7, Math.min(1.2, tuning.ttsSpeed)),
    stability: Math.max(0, Math.min(1, tuning.ttsStability)),
    similarityBoost: Math.max(0, Math.min(1, tuning.ttsSimilarityBoost)),
    style: Math.max(0, Math.min(1, tuning.ttsStyle)),
    useSpeakerBoost: tuning.ttsUseSpeakerBoost,
  };
}

export function getTtsOutputFormat(profile: TtsDeliveryProfile): string {
  if (profile === "preview" || profile === "browser_test") {
    return (
      process.env.ELEVENLABS_TTS_BROWSER_FORMAT?.trim() || "mp3_44100_128"
    );
  }
  return process.env.ELEVENLABS_TTS_TELEPHONY_FORMAT?.trim() || "ulaw_8000";
}

export function getTtsMediaFormat(profile: TtsDeliveryProfile): TtsMediaFormat {
  return profile === "telephony" ? "mulaw" : "mp3";
}

export function getTtsVoiceSettings(
  profile: TtsDeliveryProfile,
): TtsVoiceSettings | undefined {
  if (profile === "preview") return undefined;
  if (profile === "browser_test" || profile === "telephony") {
    return telephonyVoiceSettings();
  }
  return undefined;
}

export function getTtsConfigForProfile(
  profile: TtsDeliveryProfile,
): TtsConfigSnapshot {
  const tuning = getVoiceTuningConfig();
  const voiceSettings = getTtsVoiceSettings(profile);
  const usesTelephonyTuning =
    profile === "telephony" || profile === "browser_test";
  return {
    profile,
    model: getElevenLabsTtsModel(),
    outputFormat: getTtsOutputFormat(profile),
    mediaFormat: getTtsMediaFormat(profile),
    voiceSettings: voiceSettings ?? null,
    streamingLatency: usesTelephonyTuning ? tuning.ttsStreamingLatency : 0,
  };
}
