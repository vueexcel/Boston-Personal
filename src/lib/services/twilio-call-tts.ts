import { getElevenLabsClient } from "@/lib/integrations/elevenlabs";
import type { TextToSpeechConvertRequestOutputFormat } from "@elevenlabs/elevenlabs-js/api";
import { toElevenLabsTtsLanguageCode } from "@/lib/integrations/elevenlabs-flash-v25-languages";
import { getServerEnv } from "@/lib/env/server";
import {
  prepareTextForTts,
  shouldSoftenExclamationsForProfile,
} from "@/lib/voice/tts-text";
import {
  getTtsConfigForProfile,
  getTtsMediaFormat,
  type TtsDeliveryProfile,
  type TtsMediaFormat,
} from "@/lib/voice/tts-config";
import { getVoiceTuningConfig } from "@/lib/voice/voice-tuning";

const CHUNK_SIZE_BYTES = 640;

export type StreamCallSpeechOptions = {
  profile: TtsDeliveryProfile;
  language?: string | null;
  signal?: AbortSignal;
};

export type CallSpeechChunkMeta = {
  format: TtsMediaFormat;
};

/**
 * Synthesizes speech as mulaw 8kHz bytes for Twilio Media Streams playback.
 */
export async function synthesizeCallSpeechMulaw(
  text: string,
  voiceId: string,
  language?: string | null,
  signal?: AbortSignal,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await streamCallSpeech(
    text,
    voiceId,
    (chunk) => {
      if (signal?.aborted) return;
      chunks.push(chunk);
    },
    { profile: "telephony", language, signal },
  );
  return Buffer.concat(chunks);
}

/**
 * Streams ElevenLabs TTS audio for preview (MP3) or telephony (μ-law 8 kHz).
 */
export async function streamCallSpeech(
  text: string,
  voiceId: string,
  onChunk: (
    chunk: Buffer,
    meta: CallSpeechChunkMeta,
  ) => void | Promise<void>,
  options: StreamCallSpeechOptions,
): Promise<void> {
  const env = getServerEnv();
  if (!env.ELEVENLABS_API_KEY?.trim()) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const prepared = prepareTextForTts(text, {
    softenExclamations: shouldSoftenExclamationsForProfile(options.profile),
  });
  if (!prepared) {
    throw new Error("TTS text is empty");
  }

  const config = getTtsConfigForProfile(options.profile);
  const client = getElevenLabsClient();

  const convertParams: Parameters<typeof client.textToSpeech.convert>[1] = {
    text: prepared,
    modelId: config.model,
    languageCode: toElevenLabsTtsLanguageCode(options.language),
    outputFormat: config.outputFormat as TextToSpeechConvertRequestOutputFormat,
    applyTextNormalization: "auto",
    optimizeStreamingLatency: config.streamingLatency,
  };

  if (config.voiceSettings) {
    convertParams.voiceSettings = config.voiceSettings;
  }

  const body = await client.textToSpeech.convert(voiceId, convertParams);
  const mediaFormat = getTtsMediaFormat(options.profile);

  if (options.profile === "preview" || options.profile === "browser_test") {
    const buf = await readStreamToBuffer(body, options.signal);
    if (!options.signal?.aborted && buf.length > 0) {
      await onChunk(buf, { format: mediaFormat });
    }
    return;
  }

  const stream = body as ReadableStream<Uint8Array>;
  if (typeof stream.getReader === "function") {
    const reader = stream.getReader();
    try {
      while (true) {
        if (options.signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          await onChunk(Buffer.from(value), { format: mediaFormat });
        }
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }

  const buf = Buffer.from(await new Response(body).arrayBuffer());
  if (!options.signal?.aborted && buf.length > 0) {
    await onChunk(buf, { format: mediaFormat });
  }
}

/** @deprecated Use {@link streamCallSpeech} with `profile: "telephony"`. */
export async function streamCallSpeechMulaw(
  text: string,
  voiceId: string,
  onChunk: (mulaw: Buffer) => void | Promise<void>,
  language?: string | null,
  signal?: AbortSignal,
): Promise<void> {
  await streamCallSpeech(
    text,
    voiceId,
    (chunk) => onChunk(chunk),
    { profile: "telephony", language, signal },
  );
}

async function readStreamToBuffer(
  body: unknown,
  signal?: AbortSignal,
): Promise<Buffer> {
  const stream = body as ReadableStream<Uint8Array>;
  if (typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const chunks: Buffer[] = [];
    try {
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          chunks.push(Buffer.from(value));
        }
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  }

  return Buffer.from(await new Response(body as BodyInit).arrayBuffer());
}

/** Splits mulaw audio into Twilio-sized base64 payload chunks. */
export function chunkMulawForTwilio(mulaw: Buffer): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < mulaw.length; i += CHUNK_SIZE_BYTES) {
    const slice = mulaw.subarray(i, i + CHUNK_SIZE_BYTES);
    chunks.push(slice.toString("base64"));
  }
  return chunks;
}

/** Sends mulaw to Twilio in frame-sized chunks with optional abort. */
export async function playMulawChunks(
  mulaw: Buffer,
  sendPayload: (base64: string) => void,
  options?: {
    frameDelayMs?: number;
    signal?: AbortSignal;
    isAborted?: () => boolean;
  },
): Promise<void> {
  const tuning = getVoiceTuningConfig();
  const delay = options?.frameDelayMs ?? tuning.ttsFrameDelayMs;
  for (const payload of chunkMulawForTwilio(mulaw)) {
    if (options?.signal?.aborted || options?.isAborted?.()) return;
    sendPayload(payload);
    await sleep(delay);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
