const MAX_BUFFER_CHARS = 250;

/**
 * Buffers streamed LLM tokens and emits speakable sentence chunks early.
 */
export class SentenceBuffer {
  private buffer = "";

  push(delta: string): string[] {
    if (!delta) return [];
    this.buffer += delta;
    const out: string[] = [];

    while (true) {
      const trimmed = this.buffer.trimStart();
      if (!trimmed) {
        this.buffer = "";
        break;
      }

      const endMatch = trimmed.search(/[.!?](?:\s|$)/);
      if (endMatch >= 0) {
        const sliceEnd = endMatch + 1;
        const sentence = trimmed.slice(0, sliceEnd).trim();
        this.buffer = trimmed.slice(sliceEnd);
        if (sentence) out.push(sentence);
        continue;
      }

      if (trimmed.length >= MAX_BUFFER_CHARS) {
        const splitAt = trimmed.lastIndexOf(" ", MAX_BUFFER_CHARS);
        const cut = splitAt > 12 ? splitAt : MAX_BUFFER_CHARS;
        const chunk = trimmed.slice(0, cut).trim();
        this.buffer = trimmed.slice(cut);
        if (chunk) out.push(chunk);
        continue;
      }

      this.buffer = trimmed;
      break;
    }

    return out;
  }

  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest || null;
  }
}
