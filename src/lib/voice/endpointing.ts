import type { VoiceTuningConfig } from "@/lib/voice/voice-tuning";

export type CallerSpeechEvent = {
  text: string;
  final: boolean;
  stability?: number;
};

/** Inbound caller speech from STT (partial or committed). */
export type CallerUtteranceMessage = CallerSpeechEvent & {
  timestamp: string;
};

/**
 * Client-side endpointing on partial/committed STT transcripts (silence debounce).
 */
export class CallEndpointDebouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastStableText = "";
  private lastFinalText = "";
  private readonly config: VoiceTuningConfig;

  constructor(
    config: VoiceTuningConfig,
    private readonly onEndpoint: (text: string) => void,
  ) {
    this.config = config;
  }

  ingest(event: CallerSpeechEvent): void {
    const text = event.text.trim();
    if (!text) return;

    if (event.final) {
      this.clearTimer();
      if (
        text.length >= this.config.endpointMinChars &&
        text !== this.lastFinalText
      ) {
        this.lastFinalText = text;
        this.lastStableText = text;
        this.onEndpoint(text);
      }
      return;
    }

    // Scribe realtime partials omit stability; only reject when stability is explicit and low.
    if (
      event.stability != null &&
      event.stability < this.config.partialStabilityMin
    ) {
      return;
    }

    if (text.length < this.config.endpointMinChars) {
      return;
    }

    this.lastStableText = text;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (
        this.lastStableText.length >= this.config.endpointMinChars &&
        this.lastStableText !== this.lastFinalText
      ) {
        this.lastFinalText = this.lastStableText;
        this.onEndpoint(this.lastStableText);
      }
    }, this.config.endpointSilenceMs);
  }

  reset(): void {
    this.clearTimer();
    this.lastStableText = "";
    this.lastFinalText = "";
  }

  /** Returns best-effort pending partial text (e.g. on stream stop). */
  flushPending(): string | null {
    this.clearTimer();
    const text = this.lastStableText.trim();
    if (
      text.length >= this.config.endpointMinChars &&
      text !== this.lastFinalText
    ) {
      this.lastFinalText = text;
      return text;
    }
    return null;
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export function shouldTriggerBargeIn(
  event: CallerSpeechEvent,
  config: VoiceTuningConfig,
): boolean {
  const text = event.text.trim();
  const partialMin = Math.min(
    config.bargeInMinChars,
    CLIENT_PARTIAL_BARGE_IN_MIN_CHARS,
  );

  if (event.final) {
    return text.length >= config.bargeInMinChars;
  }

  // Substantive partials interrupt agent playback on PSTN (mirrors browser client barge-in).
  return text.length >= partialMin;
}

/** Prefer longer / newer utterance when queueing during overlap. */
export function coalescePendingTranscript(
  existing: string | null,
  incoming: string,
): string {
  const next = incoming.trim();
  if (!existing?.trim()) return next;
  const prev = existing.trim();
  if (next === prev) return prev;
  if (next.includes(prev)) return next;
  if (prev.includes(next)) return prev;
  return `${prev} ${next}`;
}

export function lastUserMessageContent(
  messages: { role: string; content: string }[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && m.content.trim()) {
      return m.content.trim();
    }
  }
  return null;
}

export function lastAssistantMessageContent(
  messages: { role: string; content: string }[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.content.trim()) {
      return m.content.trim();
    }
  }
  return null;
}

export const CLIENT_PARTIAL_BARGE_IN_MIN_CHARS = 8;

/** Client-signaled or partial barge-in (browser echo-filtered). */
export function shouldTriggerClientBargeIn(
  event: CallerSpeechEvent & { bargeIn?: boolean },
  config: VoiceTuningConfig,
): boolean {
  const text = event.text.trim();
  const minChars = event.bargeIn
    ? Math.min(config.bargeInMinChars, CLIENT_PARTIAL_BARGE_IN_MIN_CHARS)
    : config.bargeInMinChars;
  if (text.length < minChars) return false;
  if (event.bargeIn) return true;
  if (config.bargeInOnlyFinal) return event.final;
  return true;
}
