import { toElevenLabsConvaiLanguage } from "@/lib/integrations/elevenlabs-convai-language";
import { getElevenLabsSttConfig } from "@/lib/voice/stt-config";

export type ScribeClientConnectConfig = {
  modelId: string;
  languageCode: string;
  commitStrategy: "vad";
  vadSilenceThresholdSecs: number;
  vadThreshold: number;
  minSpeechDurationMs: number;
  minSilenceDurationMs: number;
};

/** Server-side Scribe connect options mirrored for browser `useScribe`. */
export function getScribeClientConnectConfig(
  language: string | null | undefined,
): ScribeClientConnectConfig {
  const stt = getElevenLabsSttConfig();
  return {
    modelId: stt.modelId,
    languageCode: toElevenLabsConvaiLanguage(language),
    commitStrategy: "vad",
    vadSilenceThresholdSecs: stt.vadSilenceThresholdSecs,
    vadThreshold: stt.vadThreshold,
    minSpeechDurationMs: stt.minSpeechDurationMs,
    minSilenceDurationMs: stt.minSilenceDurationMs,
  };
}
