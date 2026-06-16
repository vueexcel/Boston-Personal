import {
  getNextCollectField,
  initialCollectedMap,
  updateCollectedInfoFromMessages,
  updateExtraInformationFromMessages,
  type CollectedInfoMap,
  type ExtraInformationItem,
} from "@/lib/services/call-collected-info";
import {
  initialConversationState,
  updateConversationState,
  type CallConversationState,
} from "@/lib/services/call-conversation-state";
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
  streamCallSpeech,
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
import {
  getClarificationFallbackPhrase,
  getErrorRetryPhrase,
  getInactivityFarewellPhrase,
  getLanguageRepromptPhrase,
  getMaxTurnsFarewellPhrase,
  getTimeLimitFarewellPhrase,
} from "@/lib/voice/call-phrases";
import {
  getEntityConfirmPhrase,
  getSpellBackPrompt,
  isAffirmativeResponse,
  isCollectFieldEntityLike,
  isLikelySpelledName,
  isNegativeResponse,
  isShortEntityAnswer,
  parseSpelledLetters,
  shouldSkipEntityCaptureForIntent,
} from "@/lib/voice/entity-capture";
import {
  isUtteranceLanguageMismatch,
  shouldUseLanguageReprompt,
} from "@/lib/voice/utterance-language";
import { getVoiceTuningConfig } from "@/lib/voice/voice-tuning";
import {
  getTtsConfigForProfile,
  type TtsDeliveryProfile,
  type TtsMediaFormat,
} from "@/lib/voice/tts-config";
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
  extraInformation?: ExtraInformationItem[];
  conversationState?: CallConversationState;
};

export type TtsMediaPayloadMeta = {
  format: TtsMediaFormat;
};

export type VoiceConversationTransport = {
  sendMedia: (base64Payload: string, meta?: TtsMediaPayloadMeta) => void;
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
const MAX_UNCLEAR_UTTERANCES = 3;
const MAX_LANGUAGE_REPROMPTS = 2;

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
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private inactivityFired = false;
  private languageCheckSuppressed = false;
  private unclearUtteranceCount = 0;
  private languageRepromptCount = 0;
  private pendingEntityConfirm: {
    field: string;
    value: string;
    awaitingSpell?: boolean;
  } | null = null;

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
      extraInformation: session.extraInformation ?? [],
      conversationState:
        session.conversationState ??
        initialConversationState(session.agentSnapshot.infoToCollect),
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

    const ttsConfig = getTtsConfigForProfile(this.getTtsProfile());
    console.info(`[${this.logPrefix}] TTS config`, ttsConfig);
    void this.sessionLogger?.log("tts_config", ttsConfig);

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

  private getTtsProfile(): TtsDeliveryProfile {
    return this.options.finalizeMode === "test" ? "browser_test" : "telephony";
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

  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private armInactivityTimer(): void {
    if (this.state === "ended" || this.inactivityFired) return;
    this.clearInactivityTimer();
    const sec = this.voiceTuning.callerInactivitySec;
    if (sec <= 0) return;
    this.inactivityTimer = setTimeout(() => {
      void this.onInactivityTimeout();
    }, sec * 1000);
  }

  private resetInactivityTimer(): void {
    if (this.state === "ended" || this.inactivityFired) return;
    this.armInactivityTimer();
  }

  private async onInactivityTimeout(): Promise<void> {
    if (this.state === "ended" || this.inactivityFired) return;
    if (this.processingUtterance || this.state === "speaking" || this.state === "greeting") {
      this.armInactivityTimer();
      return;
    }
    this.inactivityFired = true;
    this.clearInactivityTimer();
    const language = this.session?.agentSnapshot.language;
    const farewell = getInactivityFarewellPhrase(language);
    void this.sessionLogger?.log("inactivity_hangup", { farewell });
    await this.endCall(farewell);
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
    if (!this.bargeInCollector.isActive()) {
      this.armInactivityTimer();
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

    if (message.final || triggerBargeIn) {
      this.resetInactivityTimer();
    }

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

    if (this.pendingEntityConfirm) {
      await this.handleEntityConfirmTurn(text);
      return;
    }

    const nextField = getNextCollectField(
      this.session.agentSnapshot.infoToCollect,
      this.session.collectedInfo,
    );

    if (
      nextField &&
      isCollectFieldEntityLike(nextField) &&
      !shouldSkipEntityCaptureForIntent(text) &&
      isShortEntityAnswer(text)
    ) {
      const tokens = text.split(/\s+/).filter(Boolean);
      if (tokens.length === 1 && tokens[0].length >= 5) {
        await this.startEntityConfirm(nextField, tokens[0], text);
        return;
      }
    }

    const language = this.session.agentSnapshot.language;
    const answeringCollect =
      Boolean(nextField) &&
      isShortEntityAnswer(text) &&
      text.split(/\s+/).length <= 3;

    if (await shouldUseLanguageReprompt(text, language)) {
      if (this.languageRepromptCount < MAX_LANGUAGE_REPROMPTS) {
        await this.handleUnclearUtterance(text, "language");
        return;
      }
    } else if (
      await isUtteranceLanguageMismatch(text, language, {
        answeringCollectField: answeringCollect,
        suppressAfterSuccessfulTurn: this.languageCheckSuppressed,
      })
    ) {
      await this.handleUnclearUtterance(text, "clarification");
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

  private async handleUnclearUtterance(
    userText: string,
    kind: "clarification" | "language",
  ): Promise<void> {
    if (!this.session || this.processingUtterance) return;

    if (kind === "language") {
      this.languageRepromptCount += 1;
    } else {
      this.unclearUtteranceCount += 1;
      if (this.unclearUtteranceCount > MAX_UNCLEAR_UTTERANCES) {
        await this.runTurn(userText);
        return;
      }
    }

    this.processingUtterance = true;
    this.endpointDebouncer?.reset();
    this.bargeInCollector.reset();
    this.languageCheckSuppressed = false;

    const phrase =
      kind === "language"
        ? getLanguageRepromptPhrase(this.session.agentSnapshot.language)
        : getClarificationFallbackPhrase(this.session.agentSnapshot);

    void this.sessionLogger?.log("unclear_utterance", {
      userText,
      kind,
      phrase,
    });

    const gen = this.speakGeneration;
    await this.speakSentence(phrase, gen);

    if (this.speakGeneration === gen && this.session) {
      this.session.messages.push({ role: "user", content: userText });
      this.session.messages.push({ role: "assistant", content: phrase });
      await this.persistSessionState();
      this.options.transport.sendTranscript?.({
        role: "assistant",
        text: phrase,
        final: true,
      });
    }

    this.processingUtterance = false;
    await this.enterListening(
      kind === "language" ? "language-reprompt" : "clarification",
    );
  }

  private async startEntityConfirm(
    field: string,
    value: string,
    userText: string,
  ): Promise<void> {
    if (!this.session || this.processingUtterance) return;
    this.pendingEntityConfirm = { field, value };
    const phrase = getEntityConfirmPhrase(
      value,
      field,
      this.session.agentSnapshot.language,
    );
    await this.speakAssistantPhrase(userText, phrase, "entity-confirm");
  }

  private async handleEntityConfirmTurn(userText: string): Promise<void> {
    if (!this.session || !this.pendingEntityConfirm) return;

    const pending = this.pendingEntityConfirm;

    if (pending.awaitingSpell) {
      const spelled = parseSpelledLetters(userText);
      const value = (spelled ?? userText.trim()).replace(/[.!?]+$/, "").trim();
      if (value.length >= 2) {
        await this.storeCollectFieldValue(pending.field, value, userText);
        return;
      }
    }

    if (isAffirmativeResponse(userText)) {
      await this.storeCollectFieldValue(pending.field, pending.value, userText);
      return;
    }

    if (isNegativeResponse(userText)) {
      this.pendingEntityConfirm = { ...pending, awaitingSpell: true };
      await this.speakAssistantPhrase(
        userText,
        getSpellBackPrompt(pending.field),
        "entity-spell",
      );
      return;
    }

    if (isLikelySpelledName(userText)) {
      const spelled = parseSpelledLetters(userText);
      if (spelled) {
        await this.startEntityConfirm(pending.field, spelled, userText);
        return;
      }
    }

    this.pendingEntityConfirm = null;
    await this.runTurn(userText);
  }

  private async storeCollectFieldValue(
    field: string,
    value: string,
    userText: string,
  ): Promise<void> {
    if (!this.session) return;
    this.session.collectedInfo = {
      ...this.session.collectedInfo,
      [field]: value,
    };
    const ack = `Got it — ${field}: ${value}.`;
    await this.speakAssistantPhrase(userText, ack, "entity-stored");
    this.pendingEntityConfirm = null;
    await this.persistSessionState();
  }

  private async speakAssistantPhrase(
    userText: string,
    phrase: string,
    reason: string,
  ): Promise<void> {
    if (!this.session) return;
    this.processingUtterance = true;
    this.endpointDebouncer?.reset();
    const gen = this.speakGeneration;
    await this.speakSentence(phrase, gen);
    if (this.speakGeneration === gen) {
      this.session.messages.push({ role: "user", content: userText });
      this.session.messages.push({ role: "assistant", content: phrase });
      await this.persistSessionState();
      this.options.transport.sendTranscript?.({
        role: "assistant",
        text: phrase,
        final: true,
      });
    }
    this.processingUtterance = false;
    void this.sessionLogger?.log(reason, { userText, phrase });
    await this.enterListening(reason);
  }

  private async persistSessionState(): Promise<void> {
    if (!this.session) return;
    this.session.conversationState = updateConversationState(
      this.session.messages,
      this.session.agentSnapshot.infoToCollect,
      this.session.collectedInfo,
      this.session.conversationState,
    );
    this.session.extraInformation = updateExtraInformationFromMessages(
      this.session.messages,
      this.session.agentSnapshot.infoToCollect,
      this.session.extraInformation ?? [],
    );
    await this.options.store.saveSession(this.session);
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
      await this.endCall(
        getMaxTurnsFarewellPhrase(this.session.agentSnapshot.language),
      );
      return;
    }

    const elapsedSec =
      (Date.now() - new Date(this.session.startedAt).getTime()) / 1000;
    if (elapsedSec >= this.session.agentSnapshot.maxDurationSec) {
      await this.endCall(
        getTimeLimitFarewellPhrase(this.session.agentSnapshot.language),
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
        this.session.conversationState,
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
      if (!reply) {
        this.unclearUtteranceCount += 1;
        const phrase = getClarificationFallbackPhrase(
          this.session.agentSnapshot,
        );
        await this.speakSentence(phrase, speakGenAtStart);
        if (this.speakGeneration === speakGenAtStart) {
          this.session.messages.push({ role: "user", content: transcript });
          this.session.messages.push({ role: "assistant", content: phrase });
          await this.persistSessionState();
          this.options.transport.sendTranscript?.({
            role: "assistant",
            text: phrase,
            final: true,
          });
        }
        return;
      }

      const updated = await this.options.store.appendMessages(
        this.session.sessionId,
        transcript,
        reply,
      );
      if (updated) {
        const collectedInfo = updateCollectedInfoFromMessages(
          updated.messages,
          updated.agentSnapshot.infoToCollect,
          this.session.collectedInfo,
        );
        const conversationState = updateConversationState(
          updated.messages,
          updated.agentSnapshot.infoToCollect,
          collectedInfo,
          this.session.conversationState,
        );
        this.session = {
          ...updated,
          collectedInfo,
          conversationState,
          extraInformation: updateExtraInformationFromMessages(
            updated.messages,
            updated.agentSnapshot.infoToCollect,
            this.session.extraInformation ?? [],
          ),
        };
        await this.options.store.saveSession(this.session);
        this.languageCheckSuppressed = true;
        void this.sessionLogger?.log("collected_info_updated", {
          collectedInfo: this.session.collectedInfo,
          extraInformation: this.session.extraInformation,
          conversationState: this.session.conversationState,
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
      const snapshot = this.session?.agentSnapshot;
      const clarifyPhrase = snapshot
        ? getClarificationFallbackPhrase(snapshot)
        : getErrorRetryPhrase(null);
      await this.speakSentence(clarifyPhrase, speakGenAtStart);
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
      await streamCallSpeech(
        text,
        voiceId,
        async (chunk, meta) => {
          if (this.speakGeneration !== expectedGeneration) return;
          if (firstTts) {
            firstTts = false;
            metrics?.onFirstTtsByte?.();
          }

          if (meta.format === "mp3") {
            if (firstMedia) {
              firstMedia = false;
              metrics?.onFirstMedia?.();
            }
            this.options.transport.sendMedia(chunk.toString("base64"), {
              format: "mp3",
            });
            return;
          }

          await playMulawChunks(
            chunk,
            (payload) => {
              if (this.speakGeneration !== expectedGeneration) return;
              if (firstMedia) {
                firstMedia = false;
                metrics?.onFirstMedia?.();
              }
              this.options.transport.sendMedia(payload, { format: "mulaw" });
            },
            {
              signal,
              isAborted: () => this.speakGeneration !== expectedGeneration,
            },
          );
        },
        {
          profile: this.getTtsProfile(),
          language: this.session.agentSnapshot.language,
          signal,
        },
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
    this.inactivityFired = true;
    this.clearInactivityTimer();
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
    this.clearInactivityTimer();
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
