import { getElevenLabsClient } from "@/lib/integrations/elevenlabs";
import { getServerEnv } from "@/lib/env/server";
import { getElevenLabsTtsModel } from "@/lib/voice/voice-tuning";

const CHUNK_SIZE_BYTES = 640;

/**
 * Synthesizes speech as mulaw 8kHz bytes for Twilio Media Streams playback.
 */
export async function synthesizeCallSpeechMulaw(
  text: string,
  voiceId: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await streamCallSpeechMulaw(text, voiceId, (chunk) => {
    if (signal?.aborted) return;
    chunks.push(chunk);
  }, signal);
  return Buffer.concat(chunks);
}

/**
 * Streams mulaw 8kHz audio chunks as ElevenLabs generates them.
 */
export async function streamCallSpeechMulaw(
  text: string,
  voiceId: string,
  onChunk: (mulaw: Buffer) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const env = getServerEnv();
  if (!env.ELEVENLABS_API_KEY?.trim()) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("TTS text is empty");
  }

  const client = getElevenLabsClient();
  const body = await client.textToSpeech.convert(voiceId, {
    text: trimmed,
    modelId: getElevenLabsTtsModel(),
    outputFormat: "ulaw_8000",
  });

  const stream = body as ReadableStream<Uint8Array>;
  if (typeof stream.getReader === "function") {
    const reader = stream.getReader();
    try {
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          await onChunk(Buffer.from(value));
        }
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }

  const buf = Buffer.from(await new Response(body).arrayBuffer());
  if (!signal?.aborted && buf.length > 0) {
    await onChunk(buf);
  }
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
  const delay = options?.frameDelayMs ?? 18;
  for (const payload of chunkMulawForTwilio(mulaw)) {
    if (options?.signal?.aborted || options?.isAborted?.()) return;
    sendPayload(payload);
    await sleep(delay);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
