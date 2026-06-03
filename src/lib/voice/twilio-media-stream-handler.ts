import WebSocket from "ws";
import {
  appendCallMessages,
  getCallSession,
  saveCallSession,
  type TwilioCallSession,
} from "@/lib/voice/call-session";
import { runCallTurnStream } from "@/lib/services/twilio-call-agent";
import {
  playMulawChunks,
  streamCallSpeechMulaw,
} from "@/lib/services/twilio-call-tts";
import { agentDebugLog } from "@/lib/debug/agent-log";
import {
  CallEndpointDebouncer,
  coalescePendingTranscript,
  lastUserMessageContent,
  shouldTriggerBargeIn,
  type CallerUtteranceMessage,
} from "@/lib/voice/endpointing";
import { finalizeInboundCall } from "@/lib/voice/finalize-call";
import {
  getGoodbyeFarewell,
  isGoodbyeIntent,
} from "@/lib/voice/goodbye-intent";
import { getVoiceTuningConfig } from "@/lib/voice/voice-tuning";
import { ElevenLabsScribeRealtimeStt } from "@/lib/voice/elevenlabs-scribe-realtime-stt";

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
  private speakGeneration = 0;
  private activeTurnId = 0;
  private turnAbort: AbortController | null = null;
  private readonly voiceTuning = getVoiceTuningConfig();
  private endpointDebouncer: CallEndpointDebouncer | null = null;
  private pendingUserTranscript: string | null = null;
  private scribeStt: ElevenLabsScribeRealtimeStt | null = null;
  private finalizing = false;
  private callerSpeechBuffer: string | null = null;
  private scribeReconnectAttempts = 0;
  private static readonly MAX_SCRIBE_RECONNECTS = 5;
  private cleanupReason: string | null = null;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.on("message", (data) => {
      void this.onMessage(data.toString());
    });
    this.ws.on("close", () => {
      void this.cleanup("twilio-ws-close");
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
          this.scribeStt &&
          payload &&
          (track === "inbound" || track === "inbound_track" || !track)
        ) {
          this.scribeStt.sendAudio(payload);
        }
        break;
      }
      case "stop":
        await this.cleanup("twilio-stop-event");
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
        void this.onEndpointFired(text);
      },
    );

    this.attachScribeStt(session);

    try {
      await this.scribeStt!.connect();
    } catch (e) {
      console.error("[media-stream] ElevenLabs Scribe connect failed", e);
      this.ws.close();
      return;
    }

    await this.playGreeting(session);
    await this.enterListening("greeting-done");
  }

  private attachScribeStt(session: TwilioCallSession): void {
    const language =
      session.agentSnapshot.language ?? session.agentSnapshot.sttLanguage;
    this.scribeStt = new ElevenLabsScribeRealtimeStt({
      language,
      onTranscript: (msg) => {
        void this.onCallerSpeech({
          text: msg.text,
          timestamp: new Date().toISOString(),
          final: msg.final,
          stability: msg.final ? msg.stability : undefined,
        });
      },
      onUnexpectedClose: (info) => {
        void this.reconnectScribe(info);
      },
    });
  }

  private async reconnectScribe(info: {
    code: number;
    reason: string;
  }): Promise<void> {
    if (this.state === "ended" || !this.scribeStt || !this.session) return;
    if (this.scribeReconnectAttempts >= TwilioMediaStreamHandler.MAX_SCRIBE_RECONNECTS) {
      console.error("[media-stream] Scribe reconnect limit reached", info);
      return;
    }
    this.scribeReconnectAttempts += 1;
    console.warn("[media-stream] Reconnecting Scribe STT", {
      attempt: this.scribeReconnectAttempts,
      ...info,
    });
    try {
      await this.scribeStt.reconnect();
    } catch (e) {
      console.error("[media-stream] Scribe reconnect failed", e);
    }
  }

  private async onEndpointFired(text: string): Promise<void> {
    if (this.state !== "listening") return;
    const delay = this.voiceTuning.postEndpointDelayMs;
    if (delay > 0) {
      await sleep(delay);
    }
    if (this.state !== "listening") return;
    await this.handleUserTurn(text, { fromEndpoint: true });
  }

  private bufferCallerSpeech(text: string, final: boolean): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (final) {
      this.callerSpeechBuffer = trimmed;
      return;
    }
    this.callerSpeechBuffer = coalescePendingTranscript(
      this.callerSpeechBuffer,
      trimmed,
    );
  }

  /** Called when agent finishes speaking and we can take caller turns. */
  private async enterListening(reason: string): Promise<void> {
    if (this.state === "ended") return;
    this.state = "listening";
    if (process.env.DEBUG_VOICE === "1") {
      agentDebugLog({
        location: "twilio-media-stream-handler.ts:enterListening",
        message: reason,
        hypothesisId: "H6",
        data: {
          bufferedLen: this.callerSpeechBuffer?.length ?? 0,
          scribeReady: this.scribeStt?.isReady() ?? false,
        },
      });
    }
    await this.flushCallerSpeechBuffer();
  }

  private async flushCallerSpeechBuffer(): Promise<void> {
    const text = this.callerSpeechBuffer?.trim();
    this.callerSpeechBuffer = null;
    if (!text || this.state !== "listening") return;
    await this.onEndpointFired(text);
  }

  private async onCallerSpeech(message: CallerUtteranceMessage): Promise<void> {
    if (this.state === "ended") return;

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
      if (process.env.DEBUG_VOICE === "1") {
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
    }

    if (this.state !== "listening") {
      this.bufferCallerSpeech(message.text, message.final);
      return;
    }

    if (message.final) {
      await this.onEndpointFired(message.text);
      return;
    }

    this.endpointDebouncer?.ingest(event);
  }

  private queuePendingTranscript(transcript: string): void {
    this.pendingUserTranscript = coalescePendingTranscript(
      this.pendingUserTranscript,
      transcript,
    );
  }

  private interruptPlayback(reason: string): void {
    this.speakGeneration += 1;
    if (this.turnAbort) {
      this.turnAbort.abort();
      this.turnAbort = null;
    }
    this.sendClear();
    if (process.env.DEBUG_VOICE === "1") {
      agentDebugLog({
        location: "twilio-media-stream-handler.ts:interrupt",
        message: reason,
        hypothesisId: "H6",
        data: { speakGeneration: this.speakGeneration },
      });
    }
    if (this.state === "speaking" || this.state === "greeting") {
      void this.enterListening("barge-in-to-listening");
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
    if (!transcript?.trim() || !this.session || !this.callSid) return;

    const text = transcript.trim();

    if (isGoodbyeIntent(text)) {
      await this.handleGoodbyeTurn(text);
      return;
    }

    if (this.processingUtterance) {
      this.queuePendingTranscript(text);
      this.interruptPlayback("new-utterance-queued");
      return;
    }

    if (this.state !== "listening" && !options?.fromEndpoint) {
      if (
        this.state === "speaking" ||
        this.state === "processing" ||
        this.state === "greeting"
      ) {
        this.queuePendingTranscript(text);
        return;
      }
    }

    await this.runTurn(text);
  }

  private async handleGoodbyeTurn(userText: string): Promise<void> {
    if (!this.session || !this.callSid) return;

    this.state = "ended";
    this.processingUtterance = true;
    this.interruptPlayback("goodbye");
    this.endpointDebouncer?.reset();

    const farewell = getGoodbyeFarewell(null);
    const updated = await appendCallMessages(this.callSid, userText, farewell);
    if (updated) this.session = updated;

    await this.endCall(farewell, { skipStateSet: true });
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

    this.endpointDebouncer?.reset();
    this.processingUtterance = true;
    this.state = "processing";
    const turnId = ++this.activeTurnId;
    this.turnAbort = new AbortController();
    const signal = this.turnAbort.signal;
    const turnStarted = Date.now();
    let llmFirstTokenMs: number | null = null;
    let ttsFirstByteMs: number | null = null;
    let firstMediaSentMs: number | null = null;
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
      const pending = this.pendingUserTranscript;
      this.pendingUserTranscript = null;
      await this.afterRunTurn(pending, signal.aborted);
    }
  }

  private async afterRunTurn(
    pending: string | null,
    aborted: boolean,
  ): Promise<void> {
    if (!aborted && this.state === "processing") {
      await this.enterListening("turn-done");
    }
    if (!pending || this.state !== "listening") return;

    const lastUser = lastUserMessageContent(this.session?.messages ?? []);
    if (lastUser && pending.trim() === lastUser) return;
    void this.runTurn(pending);
  }

  private async playGreeting(session: TwilioCallSession): Promise<void> {
    if (session.greetingPlayed) {
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
      await this.enterListening("tts-done");
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

  private async endCall(
    message: string,
    options?: { skipStateSet?: boolean },
  ): Promise<void> {
    if (!options?.skipStateSet) {
      this.state = "ended";
    }
    this.interruptPlayback("end-call");
    const gen = this.speakGeneration;
    await this.speakSentence(message, gen);
    this.ws.close();
  }

  private async cleanup(_reason: string): Promise<void> {
    if (this.cleanupReason) return;
    this.cleanupReason = _reason;
    if (
      this.state === "listening" &&
      !this.processingUtterance &&
      this.endpointDebouncer
    ) {
      const pending = this.endpointDebouncer.flushPending();
      if (pending) {
        await this.onEndpointFired(pending);
      }
    }

    this.state = "ended";
    this.endpointDebouncer?.reset();
    this.interruptPlayback("cleanup");
    if (this.scribeStt) {
      try {
        await this.scribeStt.close();
      } catch {
        // ignore
      }
      this.scribeStt = null;
    }

    if (this.callSid && !this.finalizing) {
      this.finalizing = true;
      try {
        await finalizeInboundCall({
          providerCallId: this.callSid,
          status: "COMPLETED",
          deleteSession: true,
        });
      } catch (e) {
        console.error("[media-stream] finalize on cleanup failed", e);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
