import WebSocket from "ws";
import {
  appendCallMessages,
  getCallSession,
  saveCallSession,
  type TwilioCallSession,
} from "@/lib/voice/call-session";
import {
  subscribeCallerUtterances,
  type CallerUtteranceMessage,
} from "@/lib/voice/call-utterance-bridge";
import { runCallTurnStream } from "@/lib/services/twilio-call-agent";
import {
  playMulawChunks,
  streamCallSpeechMulaw,
} from "@/lib/services/twilio-call-tts";
import { agentDebugLog } from "@/lib/debug/agent-log";
import {
  CallEndpointDebouncer,
  shouldTriggerBargeIn,
} from "@/lib/voice/endpointing";
import { getVoiceTuningConfig } from "@/lib/voice/voice-tuning";
import {
  isMediaStreamSttEnabled,
  MediaStreamSttBuffer,
} from "@/lib/voice/media-stream-stt";

type TwilioMediaMessage = {
  event?: string;
  streamSid?: string;
  start?: { callSid?: string; streamSid?: string };
  media?: { payload?: string; track?: string };
  sequenceNumber?: string;
};

type HandlerState =
  | "idle"
  | "greeting"
  | "listening"
  | "processing"
  | "speaking"
  | "ended";

const MAX_TURNS = 40;

export class TwilioMediaStreamHandler {
  private ws: WebSocket;
  private state: HandlerState = "idle";
  private streamSid: string | null = null;
  private callSid: string | null = null;
  private session: TwilioCallSession | null = null;
  private processingUtterance = false;
  private unsubscribeUtterances: (() => Promise<void>) | null = null;
  private speakGeneration = 0;
  private activeTurnId = 0;
  private turnAbort: AbortController | null = null;
  private readonly voiceTuning = getVoiceTuningConfig();
  private endpointDebouncer: CallEndpointDebouncer | null = null;
  private pendingUserTranscript: string | null = null;
  private mediaStt: MediaStreamSttBuffer | null = null;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.on("message", (data) => {
      void this.onMessage(data.toString());
    });
    this.ws.on("close", () => {
      void this.cleanup();
    });
  }

  private async onMessage(raw: string): Promise<void> {
    let msg: TwilioMediaMessage;
    try {
      msg = JSON.parse(raw) as TwilioMediaMessage;
    } catch {
      return;
    }

    switch (msg.event) {
      case "connected":
        agentDebugLog({
          location: "twilio-media-stream-handler.ts:connected",
          message: "twilio ws connected event",
          hypothesisId: "H3",
          data: {},
        });
        break;
      case "start":
        await this.onStart(msg);
        break;
      case "media": {
        const track = msg.media?.track;
        const payload = msg.media?.payload;
        if (
          this.mediaStt &&
          payload &&
          (track === "inbound" || track === "inbound_track" || !track)
        ) {
          this.mediaStt.ingest(payload);
        }
        break;
      }
      case "stop":
        await this.cleanup();
        break;
      default:
        break;
    }
  }

  private async onStart(msg: TwilioMediaMessage): Promise<void> {
    const callSid = msg.start?.callSid;
    const streamSid = msg.start?.streamSid ?? msg.streamSid;
    if (!callSid || !streamSid) return;

    this.callSid = callSid;
    this.streamSid = streamSid;

    const session = await getCallSession(callSid);
    if (!session) {
      agentDebugLog({
        location: "twilio-media-stream-handler.ts:onStart",
        message: "no redis session — closing ws",
        hypothesisId: "H5",
        data: { callSidPrefix: callSid.slice(0, 10) },
      });
      console.error("[media-stream] No session for", callSid);
      this.ws.close();
      return;
    }

    agentDebugLog({
      location: "twilio-media-stream-handler.ts:onStart",
      message: "session ok, starting greeting",
      hypothesisId: "H5",
      data: {
        callSidPrefix: callSid.slice(0, 10),
        agentIdPrefix: session.agentId.slice(0, 8),
      },
    });
    this.session = session;

    this.endpointDebouncer = new CallEndpointDebouncer(
      this.voiceTuning,
      (text) => {
        void this.handleUserTurn(text, { fromEndpoint: true });
      },
    );

    this.unsubscribeUtterances = await subscribeCallerUtterances(
      callSid,
      (message) => {
        void this.onCallerSpeech(message);
      },
    );

    if (isMediaStreamSttEnabled()) {
      this.mediaStt = new MediaStreamSttBuffer((text) => {
        void this.onCallerSpeech({
          text,
          timestamp: new Date().toISOString(),
          final: true,
          stability: 1,
        });
      });
    }

    await this.playGreeting(session);
  }

  private async onCallerSpeech(message: CallerUtteranceMessage): Promise<void> {
    const event = {
      text: message.text,
      final: message.final,
      stability: message.stability,
    };

    const interruptible =
      this.state === "speaking" ||
      this.state === "greeting" ||
      this.state === "processing";

    if (interruptible && shouldTriggerBargeIn(event, this.voiceTuning)) {
      this.interruptPlayback("barge-in");
      agentDebugLog({
        location: "twilio-media-stream-handler.ts:barge-in",
        message: "caller interrupted agent playback",
        hypothesisId: "H6",
        data: {
          state: this.state,
          final: message.final,
          textLen: message.text.length,
        },
      });
    }

    if (message.final) {
      this.endpointDebouncer?.ingest(event);
      return;
    }

    this.endpointDebouncer?.ingest(event);
  }

  private interruptPlayback(reason: string): void {
    this.speakGeneration += 1;
    if (this.turnAbort) {
      this.turnAbort.abort();
      this.turnAbort = null;
    }
    this.sendClear();
    agentDebugLog({
      location: "twilio-media-stream-handler.ts:interrupt",
      message: reason,
      hypothesisId: "H6",
      data: { speakGeneration: this.speakGeneration },
    });
    if (this.state === "speaking" || this.state === "greeting") {
      this.state = "listening";
    }
  }

  private sendClear(): void {
    if (!this.streamSid || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        event: "clear",
        streamSid: this.streamSid,
      }),
    );
  }

  private async handleUserTurn(
    transcript: string,
    options?: { fromEndpoint?: boolean },
  ): Promise<void> {
    if (this.state === "ended") return;
    if (!transcript || !this.session || !this.callSid) return;

    if (this.processingUtterance) {
      this.pendingUserTranscript = transcript;
      this.interruptPlayback("new-utterance-queued");
      return;
    }

    if (this.state !== "listening" && !options?.fromEndpoint) {
      if (
        this.state === "speaking" ||
        this.state === "processing" ||
        this.state === "greeting"
      ) {
        this.pendingUserTranscript = transcript;
        return;
      }
    }

    await this.runTurn(transcript);
  }

  private async runTurn(transcript: string): Promise<void> {
    if (!this.session || !this.callSid) return;

    if (this.session.turnCount >= MAX_TURNS) {
      await this.endCall("Thanks for calling. Goodbye.");
      return;
    }

    const elapsedSec =
      (Date.now() - new Date(this.session.startedAt).getTime()) / 1000;
    if (elapsedSec >= this.session.agentSnapshot.maxDurationSec) {
      await this.endCall(
        "We're at the time limit for this call. Thanks for calling. Goodbye.",
      );
      return;
    }

    this.processingUtterance = true;
    this.state = "processing";
    const turnId = ++this.activeTurnId;
    this.turnAbort = new AbortController();
    const signal = this.turnAbort.signal;
    const turnStarted = Date.now();
    let llmFirstTokenMs: number | null = null;
    let ttsFirstByteMs: number | null = null;
    let firstMediaSentMs: number | null = null;
    const spokenParts: string[] = [];
    const speakGenAtStart = this.speakGeneration;

    try {
      const result = await runCallTurnStream(
        this.session.agentSnapshot,
        this.session.messages,
        transcript,
        {
          signal,
          onFirstToken: () => {
            llmFirstTokenMs = Date.now() - turnStarted;
          },
          onSentence: async (sentence) => {
            if (signal.aborted || turnId !== this.activeTurnId) return;
            spokenParts.push(sentence);
            await this.speakSentence(sentence, speakGenAtStart, {
              onFirstTtsByte: () => {
                if (ttsFirstByteMs == null) {
                  ttsFirstByteMs = Date.now() - turnStarted;
                }
              },
              onFirstMedia: () => {
                if (firstMediaSentMs == null) {
                  firstMediaSentMs = Date.now() - turnStarted;
                }
              },
            });
          },
        },
      );

      if (signal.aborted || turnId !== this.activeTurnId) {
        return;
      }

      const reply = result.fullReply.trim();
      if (!reply) return;

      const updated = await appendCallMessages(
        this.callSid,
        transcript,
        reply,
      );
      if (updated) this.session = updated;

      if (process.env.DEBUG_VOICE === "1") {
        console.log("[bostel-voice] turn latency", {
          sttToTurnMs: Date.now() - turnStarted,
          llmFirstTokenMs,
          ttsFirstByteMs,
          firstMediaSentMs,
        });
      }
    } catch (e) {
      if (signal.aborted) return;
      console.error("[media-stream] turn error", e);
      await this.speakSentence(
        "Sorry — I missed that. Mind saying it again?",
        speakGenAtStart,
      );
    } finally {
      this.turnAbort = null;
      this.processingUtterance = false;
      if (this.state === "processing" && !signal.aborted) {
        this.state = "listening";
      }
      const pending = this.pendingUserTranscript;
      this.pendingUserTranscript = null;
      if (pending && this.state === "listening") {
        void this.runTurn(pending);
      }
    }
  }

  private async playGreeting(session: TwilioCallSession): Promise<void> {
    if (session.greetingPlayed) {
      this.state = "listening";
      return;
    }

    const text =
      session.agentSnapshot.greeting ??
      "Hello, how can I help you today?";

    session.greetingPlayed = true;
    await saveCallSession(session);
    this.session = session;

    if (text) {
      this.state = "greeting";
      const gen = this.speakGeneration;
      await this.speakSentence(text, gen);
      if (this.speakGeneration === gen && this.state === "greeting") {
        const updated = await getCallSession(this.callSid!);
        if (updated) {
          updated.messages.push({ role: "assistant", content: text });
          await saveCallSession(updated);
          this.session = updated;
        }
      }
    }

    if (this.state !== "ended" && this.state === "greeting") {
      this.state = "listening";
    }
  }

  private async speakSentence(
    text: string,
    expectedGeneration: number,
    metrics?: {
      onFirstTtsByte?: () => void;
      onFirstMedia?: () => void;
    },
  ): Promise<void> {
    if (!this.streamSid || !this.session) return;
    if (this.speakGeneration !== expectedGeneration) return;

    this.state = "speaking";
    const voiceId = this.session.agentSnapshot.voiceId;
    const signal = this.turnAbort?.signal;
    let firstTts = true;
    let firstMedia = true;

    try {
      await streamCallSpeechMulaw(
        text,
        voiceId,
        async (chunk) => {
          if (this.speakGeneration !== expectedGeneration) return;
          if (firstTts) {
            firstTts = false;
            metrics?.onFirstTtsByte?.();
          }
          await playMulawChunks(
            chunk,
            (payload) => {
              if (this.speakGeneration !== expectedGeneration) return;
              if (firstMedia) {
                firstMedia = false;
                metrics?.onFirstMedia?.();
              }
              this.sendMedia(payload);
            },
            {
              signal,
              isAborted: () => this.speakGeneration !== expectedGeneration,
            },
          );
        },
        signal,
      );
    } catch (e) {
      if (!signal?.aborted && this.speakGeneration === expectedGeneration) {
        console.error("[media-stream] TTS error", e);
      }
    }

    if (
      this.speakGeneration === expectedGeneration &&
      (this.state === "speaking" || this.state === "greeting")
    ) {
      this.state = "listening";
    }
  }

  private sendMedia(base64Payload: string): void {
    if (!this.streamSid || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        event: "media",
        streamSid: this.streamSid,
        media: { payload: base64Payload },
      }),
    );
  }

  private async endCall(message: string): Promise<void> {
    this.state = "ended";
    this.interruptPlayback("end-call");
    const gen = this.speakGeneration;
    await this.speakSentence(message, gen);
    this.ws.close();
  }

  private async cleanup(): Promise<void> {
    this.state = "ended";
    this.mediaStt?.reset();
    this.mediaStt = null;
    this.endpointDebouncer?.reset();
    this.interruptPlayback("cleanup");
    if (this.unsubscribeUtterances) {
      try {
        await this.unsubscribeUtterances();
      } catch {
        // ignore
      }
      this.unsubscribeUtterances = null;
    }
  }
}
