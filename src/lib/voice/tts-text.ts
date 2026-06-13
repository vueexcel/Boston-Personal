/** Max characters per ElevenLabs TTS request (degradation beyond ~800). */
export const TTS_MAX_CHARS = 800;

/** Prefer merging streamed sentences until this size before TTS. */
const TTS_MERGE_TARGET_CHARS = 200;

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
    return rest ? prepareTextForTts(rest) : null;
  }
}
