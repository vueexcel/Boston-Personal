import type { TtsDeliveryProfile } from "@/lib/voice/tts-config";

/** Max characters per ElevenLabs TTS request (degradation beyond ~800). */
export const TTS_MAX_CHARS = 800;

/** Prefer merging streamed sentences until this size before TTS. */
const TTS_MERGE_TARGET_CHARS = 200;

/** Max length for a standalone reaction chunk held for merge with the next sentence. */
const SHORT_REACTION_MAX_CHARS = 45;

/** Max words for a short reaction chunk. */
const SHORT_REACTION_MAX_WORDS = 5;

/** Max words for automatic trailing-! softening on any short sentence. */
const EXCLAMATION_SOFTEN_MAX_WORDS = 8;

const SHORT_REACTION_OPENERS =
  /^(great|thanks|thank you|sure|perfect|okay|ok|alright|right|got it|wonderful|excellent|lovely|absolutely|certainly|i'm here|i am here|still here|here i am)\b/i;

const PRESENCE_REASSURANCE =
  /^(i'm here|i am here|still here|yes,? i'm here|i'm still here|here i am)\b/i;

const TTS_PREPARE_DEFAULTS = {
  softenExclamations: false,
} as const;

export type PrepareTextForTtsOptions = {
  softenExclamations?: boolean;
};

function parseBoolEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return fallback;
}

export function shouldSoftenExclamationsForProfile(
  profile: TtsDeliveryProfile,
): boolean {
  if (profile === "preview") return false;
  return parseBoolEnv("VOICE_TTS_SOFTEN_EXCLAMATIONS", true);
}

function shouldSoftenSentenceExclamation(core: string): boolean {
  const trimmed = core.trim();
  if (!trimmed) return false;

  if (PRESENCE_REASSURANCE.test(trimmed)) return true;
  if (SHORT_REACTION_OPENERS.test(trimmed)) return true;

  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= EXCLAMATION_SOFTEN_MAX_WORDS;
}

function softenSentenceExclamation(sentence: string): string {
  const trimmed = sentence.trim();
  if (!trimmed || !/!/.test(trimmed)) return sentence;

  if (/\?!+$/.test(trimmed)) {
    const core = trimmed.replace(/\?!+$/, "").trim();
    if (shouldSoftenSentenceExclamation(core)) {
      return trimmed.replace(/\?!+$/, "?");
    }
    return sentence;
  }

  if (!/!+$/.test(trimmed)) return sentence;

  const core = trimmed.replace(/!+$/, "").trim();
  if (!shouldSoftenSentenceExclamation(core)) return sentence;
  return `${core}.`;
}

/**
 * Softens trailing exclamation marks on short acknowledgments and presence phrases.
 * TTS-only — transcripts should use the original LLM text.
 */
export function softenExclamationsForTts(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || !/!/.test(trimmed)) return text;

  const parts = trimmed.split(/(?<=[.!?])\s+/);
  if (parts.length === 1) return softenSentenceExclamation(trimmed);

  return parts.map((part) => softenSentenceExclamation(part)).join(" ");
}

/**
 * True when text is a brief acknowledgment that should merge with the following sentence for TTS.
 */
export function isShortReactionSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > SHORT_REACTION_MAX_CHARS) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > SHORT_REACTION_MAX_WORDS) return false;

  if (!SHORT_REACTION_OPENERS.test(trimmed)) return false;

  return /[!?,]$/.test(trimmed) || words.length <= 3;
}

/** Softens trailing exclamation on lone reaction chunks at end-of-turn. */
export function softenReactionExclamation(text: string): string {
  return softenExclamationsForTts(text);
}

/**
 * Prepares LLM output for TTS: trim, collapse whitespace, cap length.
 * ElevenLabs apply_text_normalization handles digits when enabled on the API call.
 */
export function prepareTextForTts(
  text: string,
  options: PrepareTextForTtsOptions = TTS_PREPARE_DEFAULTS,
): string {
  let out = text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();

  if (options.softenExclamations) {
    out = softenExclamationsForTts(out);
  }

  if (out.length > TTS_MAX_CHARS) {
    const cut = out.lastIndexOf(" ", TTS_MAX_CHARS - 1);
    out = out.slice(0, cut > 40 ? cut : TTS_MAX_CHARS).trim();
    if (!/[.!?]$/.test(out)) out += ".";
  }
  return out;
}

const LIVE_CALL_TTS_PREPARE: PrepareTextForTtsOptions = {
  softenExclamations: shouldSoftenExclamationsForProfile("telephony"),
};

/**
 * Batches sentence-buffer chunks into fewer TTS requests (up to TTS_MAX_CHARS).
 */
export class TtsSentenceMerger {
  private pending = "";

  push(sentence: string): string[] {
    const out: string[] = [];
    let next = this.pending ? `${this.pending} ${sentence}` : sentence;

    while (next.length > TTS_MAX_CHARS) {
      const cut = next.lastIndexOf(" ", TTS_MAX_CHARS - 1);
      const sliceEnd = cut > 40 ? cut : TTS_MAX_CHARS;
      const chunk = prepareTextForTts(next.slice(0, sliceEnd), LIVE_CALL_TTS_PREPARE);
      if (chunk) out.push(chunk);
      next = next.slice(sliceEnd).trimStart();
    }

    const trimmed = next.trim();
    const endsSentence = /[.!?]$/.test(trimmed);
    const shouldHoldReaction =
      isShortReactionSentence(trimmed) && trimmed.length < TTS_MAX_CHARS;

    if (shouldHoldReaction) {
      this.pending = trimmed;
      return out;
    }

    if (trimmed.length >= TTS_MERGE_TARGET_CHARS || endsSentence) {
      const chunk = prepareTextForTts(trimmed, LIVE_CALL_TTS_PREPARE);
      if (chunk) out.push(chunk);
      this.pending = "";
    } else {
      this.pending = trimmed;
    }

    return out;
  }

  flush(): string | null {
    const rest = this.pending.trim();
    this.pending = "";
    if (!rest) return null;
    return prepareTextForTts(rest, LIVE_CALL_TTS_PREPARE);
  }
}
