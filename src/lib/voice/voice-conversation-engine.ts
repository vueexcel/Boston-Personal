import {
  initialCollectedMap,
  updateCollectedInfoFromMessages,
  type CollectedInfoMap,
} from "@/lib/services/call-collected-info";
import {
  runCallTurnStream,
  type CallAgentSnapshot,
  type CallChatMessage,
} from "@/lib/services/twilio-call-agent";
import {
  BargeInUtteranceCollector,
  getBargeInMergeWindowMs,
} from "@/lib/voice/barge-in-utterance-collector";
import { shouldSkipAsUserTurn } from "@/lib/voice/utterance-quality";
import {
  isActiveTurnDuplicate,
  isDuplicateUserTranscript,
  normalizeCallerTranscript,
} from "@/lib/voice/utterance-normalize";
import { getLocalizedFallbackPhrase } from "@/lib/tenant-portal/agent-greeting-defaults";
import {
  playMulawChunks,
  streamCallSpeechMulaw,
} from "@/lib/services/twilio-call-tts";
import { agentDebugLog } from "@/lib/debug/agent-log";
import {
  appendAgentEchoContext,
  isLikelyAgentEcho,
  normalizeForEchoCompare,
} from "@/lib/voice/echo-filter";
import {
  CallEndpointDebouncer,
  coalescePendingTranscript,
  lastAssistantMessageContent,
  lastUserMessageContent,
  shouldTriggerBargeIn,
  shouldTriggerClientBargeIn,
  type CallerUtteranceMessage,
} from "@/lib/voice/endpointing";
import {
  getGoodbyeFarewell,
  isGoodbyeIntent,
} from "@/lib/voice/goodbye-intent";
import { getVoiceTuningConfig } from "@/lib/voice/voice-tuning";
import { ElevenLabsScribeRealtimeStt } from "@/lib/voice/elevenlabs-scribe-realtime-stt";
import { VoiceSessionLogger } from "@/lib/voice/voice-session-logger";

export type VoiceConversationSession = {
  sessionId: string;
  tenantId: string;
  agentId: string;
  messages: CallChatMessage[];
  turnCount: number;
  startedAt: string;
  agentSnapshot: CallAgentSnapshot;
  greetingPlayed: boolean;
  collectedInfo: CollectedInfoMap;
};

export type VoiceConversationTransport = {
  sendMedia: (base64Payload: string) => void;
  sendClear: () => void;
  /** Browser test: sentence about to be spoken (echo-filter context). */
  sendSpeakStart?: (text: string) => void;
  sendTranscript?: (payload: {
    role: "user" | "assistant";
    text: string;
    final?: boolean;
  }) => void;
  close: () => void;
};

export type VoiceSessionStore = {
  getSession: (sessionId: string) => Promise<VoiceConversationSession | null>;
  saveSession: (session: VoiceConversationSession) => Promise<void>;
  appendMessages: (
    sessionId: string,
    userText: string,
    assistantText: string,
  ) => Promise<VoiceConversationSession | null>;
};

export type VoiceConversationFinalizeMode = "twilio" | "test";

export type VoiceSttMode = "server" | "client";

export type VoiceConversationEngineOptions = {
  transport: VoiceConversationTransport;
  store: VoiceSessionStore;
  streamSid: string;
  finalizeMode: VoiceConversationFinalizeMode;
  /** Browser portal tests pipe mic audio to Scribe client-side; PSTN uses server Scribe. */
  sttMode?: VoiceSttMode;
  onFinalize?: (sessionId: string) => Promise<void>;
  logPrefix?: string;
};

type EngineState =
  | "idle"
  | "greeting"
  | "listening"
  | "processing"
  | "speaking"
  | "ended";

const MAX_TURNS = 40;
const MAX_SCRIBE_RECONNECTS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shared voice conversation state machine for Twilio PSTN and browser agent tests.
 */
export class VoiceConversationEngine {
  private state: EngineState = "idle";
  private session: VoiceConversationSession | null = null;
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
  private lastSentUserTranscript: string | null = null;
  private activeTurnUserTranscript: string | null = null;
  private liveAgentEchoContext = "";
  private scribeReconnectAttempts = 0;
  private cleanupReason: string | null = null;
  private readonly sttMode: VoiceSttMode;
  private sessionLogger: VoiceSessionLogger | null = null;
  private readonly bargeInCollector: BargeInUtteranceCollector;

  constructor(private readonly options: VoiceConversationEngineOptions) {
    this.sttMode = options.sttMode ?? "server";
    this.bargeInCollector = new BargeInUtteranceCollector(
      getBargeInMergeWindowMs(),
      (text) => {
        void this.handleUserTurn(text, { fromEndpoint: true });
      },
    );
  }

  getState(): EngineState {
    return this.state;
  }

  async start(sessionId: string): Promise<boolean> {
    const session = await this.options.store.getSession(sessionId);
    if (!session) {
      console.error(
        `[${this.logPrefix}] No session for`,
        sessionId.slice(0, 10),
      );
      this.options.transport.close();
      return false;
    }

    agentDebugLog({
      location: "voice-conversation-engine.ts:start",
      message: "session ok, starting greeting",
      hypothesisId: "H5",
      data: {
        sessionIdPrefix: sessionId.slice(0, 10),
        agentIdPrefix: session.agentId.slice(0, 8),
      },
    });

    this.session = {
      ...session,
      collectedInfo:
        session.collectedInfo ??
        initialCollectedMap(session.agentSnapshot.infoToCollect),
    };
    this.sessionLogger = new VoiceSessionLogger(
      sessionId,
      this.logPrefix,
      this.sttMode,
    );
    if (this.sessionLogger.isEnabled()) {
      console.info(
        `[${this.logPrefix}] Voice log file: ${this.sessionLogger.getFilePath()}`,
      );
      void this.sessionLogger.log("session_start", {
        agentIdPrefix: session.agentId.slice(0, 8),
        tenantIdPrefix: session.tenantId.slice(0, 8),
      });
    }

    this.endpointDebouncer = new CallEndpointDebouncer(
      this.voiceTuning,
      (text) => {
        void this.onEndpointFired(text);
      },
    );

    if (this.sttMode === "server") {
      this.attachScribeStt(session);
      try {
        await this.scribeStt!.connect();
      } catch (e) {
        console.error(`[${this.logPrefix}] ElevenLabs Scribe connect failed`, e);
        this.options.transport.close();
        return false;
      }
    }

    await this.playGreeting(session);
    await this.enterListening("greeting-done");
    return true;
  }

  ingestInboundAudio(base64Payload: string): void {
    if (this.sttMode !== "server" || !this.scribeStt) return;
    this.scribeStt.sendAudio(base64Payload);
  }

  ingestCallerSpeech(payload: {
    text: string;
    final: boolean;
    stability?: number;
    bargeIn?: boolean;
  }): void {
    void this.onCallerSpeech({
      text: payload.text,
      final: payload.final,
      stability: payload.stability,
      bargeIn: payload.bargeIn,
      timestamp: new Date().toISOString(),
    });
  }

  /** Immediate interrupt from browser (mic heard user during agent TTS). */
  signalBargeIn(): void {
    if (this.state === "speaking" || this.state === "greeting") {
      this.interruptPlayback("client-barge-in");
    }
  }

  async stop(reason: string): Promise<void> {
    await this.cleanup(reason);
  }

  private get logPrefix(): string {
    return this.options.logPrefix ?? "voice-engine";
  }

  private attachScribeStt(session: VoiceConversationSession): void {
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
    if (this.scribeReconnectAttempts >= MAX_SCRIBE_RECONNECTS) {
      console.error(`[${this.logPrefix}] Scribe reconnect limit reached`, info);
      return;
    }
    this.scribeReconnectAttempts += 1;
    console.warn(`[${this.logPrefix}] Reconnecting Scribe STT`, {
      attempt: this.scribeReconnectAttempts,
      ...info,
    });
    try {
      await this.scribeStt.reconnect();
    } catch (e) {
      console.error(`[${this.logPrefix}] Scribe reconnect failed`, e);
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

  private bufferCallerSpeech(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.callerSpeechBuffer = coalescePendingTranscript(
      this.callerSpeechBuffer,
      trimmed,
    );
  }

  private async enterListening(reason: string): Promise<void> {
    if (this.state === "ended") return;
    this.state = "listening";
    void this.sessionLogger?.logState("listening", reason, {
      bufferedLen: this.callerSpeechBuffer?.length ?? 0,
      scribeReady: this.scribeStt?.isReady() ?? false,
    });
    if (process.env.DEBUG_VOICE === "1") {
      agentDebugLog({
        location: "voice-conversation-engine.ts:enterListening",
        message: reason,
        hypothesisId: "H6",
        data: {
          bufferedLen: this.callerSpeechBuffer?.length ?? 0,
          scribeReady: this.scribeStt?.isReady() ?? false,
        },
      });
    }
    if (this.bargeInCollector.isActive()) return;
    await this.flushCallerSpeechBuffer();
  }

  private async flushCallerSpeechBuffer(): Promise<void> {
    const text = this.callerSpeechBuffer?.trim();
    this.callerSpeechBuffer = null;
    if (!text || this.state !== "listening") return;
    await this.onEndpointFired(text);
  }

  private getAgentEchoContext(): string {
    const history = lastAssistantMessageContent(this.session?.messages ?? []);
    if (history && this.liveAgentEchoContext) {
      return `${history} ${this.liveAgentEchoContext}`;
    }
    return history ?? this.liveAgentEchoContext;
  }

  private priorUserLines(): string[] {
    return (this.session?.messages ?? [])
      .filter((m) => m.role === "user")
      .map((m) => m.content.trim())
      .filter(Boolean);
  }

  private prepareCallerSpeech(text: string): string | null {
    return normalizeCallerTranscript(text, this.priorUserLines());
  }

  private shouldIgnoreCallerSpeech(
    text: string,
    options?: { duringPlayback?: boolean },
  ): boolean {
    const prior = this.priorUserLines();
    if (isDuplicateUserTranscript(text, prior)) return true;
    if (isActiveTurnDuplicate(text, this.activeTurnUserTranscript)) return true;

    if (options?.duringPlayback) {
      const echoCtx = this.getAgentEchoContext();
      if (echoCtx && isLikelyAgentEcho(text, echoCtx)) return true;
    }

    return false;
  }

  private async onCallerSpeech(
    message: CallerUtteranceMessage & { bargeIn?: boolean },
  ): Promise<void> {
    if (this.state === "ended") return;

    const interruptible =
      this.state === "speaking" ||
      this.state === "greeting" ||
      (this.state === "processing" && this.sttMode === "server");

    const normalizedText = this.prepareCallerSpeech(message.text);
    if (!normalizedText) {
      void this.sessionLogger?.log("stt_duplicate_filtered", {
        text: message.text,
        final: message.final,
      });
      return;
    }

    if (
      this.shouldIgnoreCallerSpeech(normalizedText, {
        duringPlayback: interruptible,
      })
    ) {
      void this.sessionLogger?.log("stt_echo_filtered", {
        text: normalizedText,
        final: message.final,
      });
      return;
    }

    const normalizedMessage = { ...message, text: normalizedText };
    const event = {
      text: normalizedText,
      final: message.final,
      stability: message.stability,
      bargeIn: message.bargeIn,
    };

    void this.sessionLogger?.logStt({
      text: normalizedText,
      final: message.final,
      source: this.sttMode,
    });

    if (normalizedMessage.final && normalizedText) {
      if (normalizedText !== this.lastSentUserTranscript) {
        this.lastSentUserTranscript = normalizedText;
        this.options.transport.sendTranscript?.({
          role: "user",
          text: normalizedText,
          final: true,
        });
      }
    }

    const triggerBargeIn =
      this.sttMode === "client"
        ? shouldTriggerClientBargeIn(event, this.voiceTuning)
        : shouldTriggerBargeIn(event, this.voiceTuning);

    if (
      interruptible &&
      triggerBargeIn &&
      !isDuplicateUserTranscript(normalizedText, this.priorUserLines()) &&
      !isActiveTurnDuplicate(normalizedText, this.activeTurnUserTranscript)
    ) {
      this.interruptPlayback("barge-in");
      void this.sessionLogger?.logBargeIn({
        state: this.state,
        final: normalizedMessage.final,
        textLen: normalizedText.length,
        text: normalizedText,
      });
      if (process.env.DEBUG_VOICE === "1") {
        agentDebugLog({
          location: "voice-conversation-engine.ts:barge-in",
          message: "caller interrupted agent playback",
          hypothesisId: "H6",
          data: {
            state: this.state,
            final: message.final,
            textLen: normalizedText.length,
          },
        });
      }
    }

    if (this.state !== "listening") {
      if (this.bargeInCollector.isActive()) {
        this.bargeInCollector.ingest(normalizedText, normalizedMessage.final);
      } else {
        this.bufferCallerSpeech(normalizedText);
      }
      return;
    }

    if (normalizedMessage.final) {
      await this.onEndpointFired(normalizedText);
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
    this.options.transport.sendClear();
    void this.sessionLogger?.logInterrupt(reason, this.speakGeneration);
    if (process.env.DEBUG_VOICE === "1") {
      agentDebugLog({
        location: "voice-conversation-engine.ts:interrupt",
        message: reason,
        hypothesisId: "H6",
        data: { speakGeneration: this.speakGeneration },
      });
    }
    if (
      reason === "barge-in" ||
      reason === "client-barge-in" ||
      reason === "new-utterance-queued"
    ) {
      this.bargeInCollector.activate(this.callerSpeechBuffer);
      this.callerSpeechBuffer = null;
    }
    if (this.state === "speaking" || this.state === "greeting") {
      void this.enterListening(`interrupt-${reason}`);
    } else if (this.state === "processing" && this.sttMode === "server") {
      void this.enterListening(`interrupt-${reason}`);
    }
  }

  private async handleUserTurn(
    transcript: string,
    options?: { fromEndpoint?: boolean },
  ): Promise<void> {
    if (this.state === "ended") return;
    if (!transcript?.trim() || !this.session) return;

    const normalized = this.prepareCallerSpeech(transcript);
    if (!normalized) {
      void this.sessionLogger?.log("utterance_skipped_duplicate", {
        text: transcript.trim(),
      });
      return;
    }
    const text = normalized;

    if (shouldSkipAsUserTurn(text, this.bargeInCollector.peek())) {
      void this.sessionLogger?.log("utterance_skipped_filler", { text });
      return;
    }

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
    if (!this.session) return;

    this.state = "ended";
    this.processingUtterance = true;
    this.interruptPlayback("goodbye");
    this.endpointDebouncer?.reset();

    const farewell = getGoodbyeFarewell(null);
    const updated = await this.options.store.appendMessages(
      this.session.sessionId,
      userText,
      farewell,
    );
    if (updated) this.session = updated;

    await this.endCall(farewell, { skipStateSet: true });
  }

  private async runTurn(transcript: string): Promise<void> {
    if (!this.session) return;

    const trimmed = transcript.trim();
    const lastUser = lastUserMessageContent(this.session.messages);
    if (lastUser && normalizeForEchoCompare(trimmed) === normalizeForEchoCompare(lastUser)) {
      void this.sessionLogger?.log("turn_skipped_duplicate", { transcript: trimmed });
      return;
    }

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

    this.bargeInCollector.reset();
    this.endpointDebouncer?.reset();
    this.processingUtterance = true;
    this.activeTurnUserTranscript = transcript.trim();
    this.state = "processing";
    void this.sessionLogger?.logTurnStart(transcript);
    void this.sessionLogger?.logState("processing", "turn-start");
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
        this.session.collectedInfo,
      );

      if (signal.aborted || turnId !== this.activeTurnId) {
        void this.sessionLogger?.logTurnComplete({
          transcript,
          reply: result.fullReply.trim(),
          model: result.model,
          aborted: true,
          latency: {
            totalMs: Date.now() - turnStarted,
            llmFirstTokenMs,
            ttsFirstByteMs,
            firstMediaSentMs,
          },
        });
        return;
      }

      const reply = result.fullReply.trim();
      if (!reply) return;

      const updated = await this.options.store.appendMessages(
        this.session.sessionId,
        transcript,
        reply,
      );
      if (updated) {
        this.session = {
          ...updated,
          collectedInfo: updateCollectedInfoFromMessages(
            updated.messages,
            updated.agentSnapshot.infoToCollect,
            this.session.collectedInfo,
          ),
        };
        await this.options.store.saveSession(this.session);
        void this.sessionLogger?.log("collected_info_updated", {
          collectedInfo: this.session.collectedInfo,
        });
      }

      this.options.transport.sendTranscript?.({
        role: "assistant",
        text: reply,
        final: true,
      });

      const latency = {
        totalMs: Date.now() - turnStarted,
        llmFirstTokenMs,
        ttsFirstByteMs,
        firstMediaSentMs,
      };
      void this.sessionLogger?.logTurnComplete({
        transcript,
        reply,
        model: result.model,
        aborted: false,
        latency,
      });
      if (process.env.DEBUG_VOICE === "1") {
        console.log("[bostel-voice] turn latency", latency);
      }
    } catch (e) {
      if (signal.aborted) return;
      console.error(`[${this.logPrefix}] turn error`, e);
      void this.sessionLogger?.logTurnError("turn failed", e);
      await this.speakSentence(
        "Sorry — I missed that. Mind saying it again?",
        speakGenAtStart,
      );
    } finally {
      this.turnAbort = null;
      this.processingUtterance = false;
      this.activeTurnUserTranscript = null;
      const pending = this.pendingUserTranscript;
      this.pendingUserTranscript = null;
      await this.afterRunTurn(pending, signal.aborted);
    }
  }

  private async afterRunTurn(
    pending: string | null,
    aborted: boolean,
  ): Promise<void> {
    const bufferedBeforeListen =
      this.bargeInCollector.peek() ?? this.callerSpeechBuffer;

    if (this.state === "processing" || this.state === "speaking") {
      await this.enterListening(aborted ? "turn-aborted" : "turn-done");
    }

    let mergedPending: string | null = pending;
    if (bufferedBeforeListen?.trim()) {
      mergedPending = coalescePendingTranscript(
        mergedPending,
        bufferedBeforeListen.trim(),
      );
    }

    if (aborted) {
      void this.sessionLogger?.log("turn_aborted", {
        pending: pending ?? null,
        buffered: bufferedBeforeListen ?? null,
        merged: mergedPending,
      });
    }

    if (!mergedPending || this.state !== "listening") return;

    const normalizedMerged = this.prepareCallerSpeech(mergedPending);
    if (!normalizedMerged) return;
    if (shouldSkipAsUserTurn(normalizedMerged, bufferedBeforeListen)) return;

    const lastUser = lastUserMessageContent(this.session?.messages ?? []);
    if (
      lastUser &&
      normalizeForEchoCompare(normalizedMerged) ===
        normalizeForEchoCompare(lastUser)
    ) {
      return;
    }

    void this.sessionLogger?.log("utterance_merged", { text: normalizedMerged });
    this.callerSpeechBuffer = null;
    this.bargeInCollector.reset();
    void this.runTurn(normalizedMerged);
  }

  private async playGreeting(session: VoiceConversationSession): Promise<void> {
    if (session.greetingPlayed) {
      return;
    }

    const text =
      session.agentSnapshot.greeting?.trim() ||
      getLocalizedFallbackPhrase(session.agentSnapshot.language);

    session.greetingPlayed = true;
    await this.options.store.saveSession(session);
    this.session = session;

    if (text) {
      this.state = "greeting";
      const gen = this.speakGeneration;
      await this.speakSentence(text, gen);
      if (this.speakGeneration === gen && this.state === "greeting") {
        const updated = await this.options.store.getSession(session.sessionId);
        if (updated) {
          updated.messages.push({ role: "assistant", content: text });
          await this.options.store.saveSession(updated);
          this.session = updated;
        }
        this.options.transport.sendTranscript?.({
          role: "assistant",
          text,
          final: true,
        });
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
    if (!this.session) return;
    if (this.speakGeneration !== expectedGeneration) return;

    this.state = "speaking";
    this.liveAgentEchoContext = appendAgentEchoContext(
      this.liveAgentEchoContext,
      text,
    );
    this.options.transport.sendSpeakStart?.(text);
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
              this.options.transport.sendMedia(payload);
            },
            {
              signal,
              isAborted: () => this.speakGeneration !== expectedGeneration,
            },
          );
        },
        this.session.agentSnapshot.language,
        signal,
      );
    } catch (e) {
      if (!signal?.aborted && this.speakGeneration === expectedGeneration) {
        console.error(`[${this.logPrefix}] TTS error`, e);
      }
    }

    if (
      this.speakGeneration === expectedGeneration &&
      (this.state === "speaking" || this.state === "greeting") &&
      !this.processingUtterance
    ) {
      await this.enterListening("tts-done");
    }
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
    this.options.transport.close();
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
    void this.sessionLogger?.log("session_end", { reason: _reason });
    this.endpointDebouncer?.reset();
    this.bargeInCollector.reset();
    this.interruptPlayback("cleanup");
    if (this.scribeStt) {
      try {
        await this.scribeStt.close();
      } catch {
        // ignore
      }
      this.scribeStt = null;
    }

    const sessionId = this.session?.sessionId;
    if (sessionId && !this.finalizing) {
      this.finalizing = true;
      try {
        if (this.options.onFinalize) {
          await this.options.onFinalize(sessionId);
        }
      } catch (e) {
        console.error(`[${this.logPrefix}] finalize on cleanup failed`, e);
      }
    }
  }
}
