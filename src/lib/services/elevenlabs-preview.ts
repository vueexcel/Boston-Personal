import { getElevenLabsClient } from "@/lib/integrations/elevenlabs";
import type { TextToSpeechConvertRequestOutputFormat } from "@elevenlabs/elevenlabs-js/api";
import { toElevenLabsTtsLanguageCode } from "@/lib/integrations/elevenlabs-flash-v25-languages";
import { getServerEnv } from "@/lib/env/server";
import { resolveConvaiTtsVoiceId } from "@/lib/services/elevenlabs-voice-resolve";
import { getTtsConfigForProfile } from "@/lib/voice/tts-config";

const PREVIEW_TEXT =
  "Hi — this is a quick sample so you can hear how this voice sounds for your agent.";

export type ElevenLabsPreviewResult =
  | { ok: true; body: Buffer; contentType: "audio/mpeg" }
  | { ok: false; error: string; status?: number };

/**
 * Renders a short MP3 preview for portal voice testing (uses server ELEVENLABS_API_KEY).
 */
export async function synthesizePortalVoicePreview(
  voiceId: string,
  language?: string | null,
): Promise<ElevenLabsPreviewResult> {
  const env = getServerEnv();
  if (!env.ELEVENLABS_API_KEY?.trim()) {
    return { ok: false, error: "ELEVENLABS_API_KEY is not configured", status: 503 };
  }
  const id = voiceId.trim();
  if (!id) {
    return { ok: false, error: "voiceId is required", status: 400 };
  }

  try {
    const resolved = await resolveConvaiTtsVoiceId(id);
    const ttsVoiceId = resolved.voiceId;
    if (!ttsVoiceId) {
      return {
        ok: false,
        error:
          resolved.warning ??
          "No valid ElevenLabs voice is available for preview.",
        status: 400,
      };
    }

    const config = getTtsConfigForProfile("preview");
    const client = getElevenLabsClient();
    const stream = await client.textToSpeech.convert(ttsVoiceId, {
      text: PREVIEW_TEXT,
      modelId: config.model,
      languageCode: toElevenLabsTtsLanguageCode(language),
      outputFormat:
        config.outputFormat as TextToSpeechConvertRequestOutputFormat,
    });
    const body = Buffer.from(await new Response(stream).arrayBuffer());
    return { ok: true, body, contentType: "audio/mpeg" };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "ElevenLabs text-to-speech failed";
    return { ok: false, error: message, status: 502 };
  }
}
