import OpenAI from "openai";
import { getOpenAIClient } from "@/lib/integrations/openai";
import { decodeMulawBuffer, pcm16ToWav } from "@/lib/voice/mulaw-audio";

const MIN_MULAW_BYTES = 4000;
const MAX_MULAW_BYTES = 64000;
const FLUSH_DEBOUNCE_MS = 650;

export function isMediaStreamSttEnabled(): boolean {
  const raw = process.env.VOICE_MEDIA_STT?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Buffers inbound μ-law from Twilio Media Streams and transcribes via OpenAI
 * when Twilio Real-Time Transcription callbacks are unavailable.
 */
export class MediaStreamSttBuffer {
  private chunks: Buffer[] = [];
  private chunkBytes = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private transcribing = false;

  constructor(
    private readonly onTranscript: (text: string) => void,
  ) {}

  ingest(mulawBase64: string): void {
    if (!mulawBase64) return;
    const mulaw = Buffer.from(mulawBase64, "base64");
    if (mulaw.length === 0) return;
    this.chunks.push(mulaw);
    this.chunkBytes += mulaw.length;
    if (this.chunkBytes > MAX_MULAW_BYTES) {
      void this.flush("max-buffer");
      return;
    }
    this.scheduleFlush();
  }

  reset(): void {
    this.clearTimer();
    this.chunks = [];
    this.chunkBytes = 0;
  }

  private scheduleFlush(): void {
    this.clearTimer();
    this.flushTimer = setTimeout(() => {
      void this.flush("debounce");
    }, FLUSH_DEBOUNCE_MS);
  }

  private clearTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private async flush(reason: string): Promise<void> {
    this.clearTimer();
    if (this.transcribing || this.chunkBytes < MIN_MULAW_BYTES) {
      if (this.chunkBytes < MIN_MULAW_BYTES) {
        this.chunks = [];
        this.chunkBytes = 0;
      }
      return;
    }

    const mulaw = Buffer.concat(this.chunks);
    this.chunks = [];
    this.chunkBytes = 0;
    this.transcribing = true;

    try {
      const wav = pcm16ToWav(decodeMulawBuffer(mulaw));
      const file = await OpenAI.toFile(wav, "caller.wav", {
        type: "audio/wav",
      });
      const client = getOpenAIClient();
      const model =
        process.env.VOICE_TRANSCRIBE_MODEL?.trim() || "whisper-1";
      const result = await client.audio.transcriptions.create({
        file,
        model,
        language: "en",
      });
      const text = result.text?.trim() ?? "";
      if (text.length >= 2) {
        if (process.env.DEBUG_VOICE === "1") {
          console.log("[bostel-voice] media-stream STT", {
            reason,
            textLen: text.length,
          });
        }
        this.onTranscript(text);
      }
    } catch (e) {
      console.error("[media-stream-stt] transcribe failed", e);
    } finally {
      this.transcribing = false;
    }
  }
}
