/** Max characters per ElevenLabs TTS request (degradation beyond ~800). */
export const TTS_MAX_CHARS = 800;

/** Prefer merging streamed sentences until this size before TTS. */
const TTS_MERGE_TARGET_CHARS = 200;

/** Max length for a standalone reaction chunk held for merge with the next sentence. */
const SHORT_REACTION_MAX_CHARS = 45;

/** Max words for a short reaction chunk. */
const SHORT_REACTION_MAX_WORDS = 5;

const SHORT_REACTION_OPENERS =
  /^(great|thanks|thank you|sure|perfect|okay|ok|alright|right|got it|wonderful|excellent|lovely|absolutely|certainly)\b/i;

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
  const trimmed = text.trim();
  if (!isShortReactionSentence(trimmed)) return trimmed;
  return trimmed.replace(/!+$/, ".");
}

/**
 * Prepares LLM output for TTS: trim, collapse whitespace, cap length.
 * ElevenLabs apply_text_normalization handles digits when enabled on the API call.
 */
export function prepareTextForTts(text: string): string {
  let out = text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
  if (out.length > TTS_MAX_CHARS) {
    const cut = out.lastIndexOf(" ", TTS_MAX_CHARS - 1);
    out = out.slice(0, cut > 40 ? cut : TTS_MAX_CHARS).trim();
    if (!/[.!?]$/.test(out)) out += ".";
  }
  return out;
}

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
      const chunk = prepareTextForTts(next.slice(0, sliceEnd));
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
      const chunk = prepareTextForTts(trimmed);
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
    return prepareTextForTts(softenReactionExclamation(rest));
  }
}
