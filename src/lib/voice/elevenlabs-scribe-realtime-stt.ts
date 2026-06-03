import WebSocket from "ws";
import { agentDebugLog } from "@/lib/debug/agent-log";
import { toElevenLabsConvaiLanguage } from "@/lib/integrations/elevenlabs-convai-language";
import {
  getElevenLabsSttConfig,
  isElevenLabsSttEnabled,
} from "@/lib/voice/stt-config";

const SCRIBE_WS_BASE =
  "wss://api.elevenlabs.io/v1/speech-to-text/realtime";

export type ScribeTranscriptMessage = {
  text: string;
  final: boolean;
  stability?: number;
};

export type ScribeUnexpectedCloseInfo = {
  code: number;
  reason: string;
};

type ScribeServerMessage = {
  message_type?: string;
  text?: string;
  error?: string;
  message?: string;
};

export type ElevenLabsScribeRealtimeSttOptions = {
  language?: string | null;
  onTranscript: (message: ScribeTranscriptMessage) => void;
  onUnexpectedClose?: (info: ScribeUnexpectedCloseInfo) => void;
};

/**
 * Streams inbound Twilio μ-law audio to ElevenLabs Scribe v2 Realtime (WebSocket).
 */
export class ElevenLabsScribeRealtimeStt {
  private ws: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private closed = false;
  private sessionReady = false;
  private connectStartedAt = 0;
  private firstPartialAt: number | null = null;
  private firstCommittedAt: number | null = null;
  private lastCommittedText = "";

  constructor(private readonly options: ElevenLabsScribeRealtimeSttOptions) {}

  isReady(): boolean {
    return (
      !this.closed &&
      this.sessionReady &&
      this.ws?.readyState === WebSocket.OPEN
    );
  }

  async connect(): Promise<void> {
    if (!isElevenLabsSttEnabled()) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }
    if (this.connectPromise) return this.connectPromise;

    this.connectStartedAt = Date.now();
    this.connectPromise = this.openWebSocket();
    return this.connectPromise;
  }

  /** Re-open Scribe after an unexpected server-side disconnect. */
  async reconnect(): Promise<void> {
    if (this.closed) return;
    this.connectPromise = null;
    this.sessionReady = false;
    this.ws = null;
    this.connectStartedAt = Date.now();
    this.connectPromise = this.openWebSocket();
    return this.connectPromise;
  }

  sendAudio(mulawBase64: string): void {
    if (!mulawBase64 || this.closed || !this.sessionReady || !this.ws) return;
    if (this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: mulawBase64,
        commit: false,
        sample_rate: 8000,
      }),
    );
  }

  async close(): Promise<void> {
    this.closed = true;
    this.sessionReady = false;
    const ws = this.ws;
    this.ws = null;
    this.connectPromise = null;
    if (!ws) return;

    await new Promise<void>((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      ws.once("close", () => resolve());
      ws.close();
    });
  }

  private buildWebSocketUrl(): string {
    const config = getElevenLabsSttConfig();
    const languageCode = toElevenLabsConvaiLanguage(this.options.language);

    const params = new URLSearchParams({
      model_id: config.modelId,
      audio_format: config.audioFormat,
      commit_strategy: "vad",
      language_code: languageCode,
      vad_silence_threshold_secs: String(config.vadSilenceThresholdSecs),
      vad_threshold: String(config.vadThreshold),
      min_speech_duration_ms: String(config.minSpeechDurationMs),
      min_silence_duration_ms: String(config.minSilenceDurationMs),
    });

    return `${SCRIBE_WS_BASE}?${params.toString()}`;
  }

  private openWebSocket(): Promise<void> {
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    if (!apiKey) {
      return Promise.reject(new Error("ELEVENLABS_API_KEY is not configured"));
    }

    const url = this.buildWebSocketUrl();

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: { "xi-api-key": apiKey },
      });
      this.ws = ws;

      ws.on("open", () => {
        agentDebugLog({
          location: "elevenlabs-scribe-realtime-stt.ts:open",
          message: "scribe ws open",
          hypothesisId: "H4",
          data: {
            scribeConnectMs: Date.now() - this.connectStartedAt,
          },
        });
      });

      ws.on("message", (data) => {
        this.handleServerMessage(data.toString(), resolve, reject);
      });

      ws.on("error", (err) => {
        console.error("[elevenlabs-scribe-stt] ws error", err);
        if (!this.sessionReady) {
          reject(err);
        }
      });

      ws.on("close", (code, reason) => {
        this.sessionReady = false;
        this.connectPromise = null;
        const reasonStr = reason?.toString() ?? "";
        if (!this.closed) {
          console.error("[elevenlabs-scribe-stt] unexpected close", {
            code,
            reason: reasonStr,
          });
          agentDebugLog({
            location: "elevenlabs-scribe-realtime-stt.ts:close",
            message: "scribe ws closed unexpectedly",
            hypothesisId: "H4",
            data: { code, reason: reasonStr },
          });
          this.options.onUnexpectedClose?.({ code, reason: reasonStr });
        }
      });
    });
  }

  private handleServerMessage(
    raw: string,
    resolveConnect: () => void,
    rejectConnect: (err: Error) => void,
  ): void {
    let msg: ScribeServerMessage;
    try {
      msg = JSON.parse(raw) as ScribeServerMessage;
    } catch {
      return;
    }

    const type = msg.message_type;
    if (!type) return;

    switch (type) {
      case "session_started":
        this.sessionReady = true;
        agentDebugLog({
          location: "elevenlabs-scribe-realtime-stt.ts:session",
          message: "scribe session started",
          hypothesisId: "H4",
          data: {
            scribeConnectMs: Date.now() - this.connectStartedAt,
          },
        });
        resolveConnect();
        break;

      case "partial_transcript": {
        const text = msg.text?.trim() ?? "";
        if (text.length < 2) return;
        if (this.firstPartialAt == null) {
          this.firstPartialAt = Date.now();
          if (process.env.DEBUG_VOICE === "1") {
            console.log("[bostel-voice] scribe STT", {
              event: "first-partial",
              firstPartialMs: this.firstPartialAt - this.connectStartedAt,
              textLen: text.length,
            });
          }
        }
        this.options.onTranscript({
          text,
          final: false,
        });
        break;
      }

      case "committed_transcript":
      case "committed_transcript_with_timestamps": {
        const text = msg.text?.trim() ?? "";
        if (text.length < 2 || text === this.lastCommittedText) return;
        this.lastCommittedText = text;
        if (this.firstCommittedAt == null) {
          this.firstCommittedAt = Date.now();
        }
        if (process.env.DEBUG_VOICE === "1") {
          console.log("[bostel-voice] scribe STT", {
            event: "committed",
            firstCommittedMs:
              this.firstCommittedAt - this.connectStartedAt,
            textLen: text.length,
          });
        }
        this.options.onTranscript({
          text,
          final: true,
          stability: 1,
        });
        break;
      }

      case "error":
      case "auth_error":
      case "quota_exceeded":
      case "transcriber_error":
      case "input_error":
      case "commit_throttled":
      case "unaccepted_terms":
      case "rate_limited":
      case "queue_overflow":
      case "resource_exhausted":
      case "session_time_limit_exceeded":
      case "chunk_size_exceeded":
      case "insufficient_audio_activity": {
        const detail = msg.message ?? msg.error ?? type;
        console.error("[elevenlabs-scribe-stt]", type, detail);
        if (!this.sessionReady) {
          rejectConnect(new Error(`ElevenLabs Scribe: ${detail}`));
        }
        break;
      }

      default:
        if (process.env.DEBUG_VOICE === "1") {
          console.log("[bostel-voice] scribe unknown message", { type });
        }
        break;
    }
  }
}
