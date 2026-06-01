import type { VoiceTuningConfig } from "@/lib/voice/voice-tuning";

export type CallerSpeechEvent = {
  text: string;
  final: boolean;
  stability?: number;
};

/**
 * Client-side endpointing on Twilio partial transcripts (silence debounce).
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

    const stability = event.stability ?? 0;
    if (stability < this.config.partialStabilityMin) {
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
  if (text.length < config.bargeInMinChars) return false;
  if (event.final) return true;
  const stability = event.stability ?? 0;
  return stability >= config.partialStabilityMin;
}
