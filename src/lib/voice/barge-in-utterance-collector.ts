import { coalescePendingTranscript } from "@/lib/voice/endpointing";
import {
  isFillerOnlyUtterance,
  shouldSkipAsUserTurn,
} from "@/lib/voice/utterance-quality";

function parseIntEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function getBargeInMergeWindowMs(): number {
  return parseIntEnv("VOICE_BARGE_IN_MERGE_MS", 700);
}

/**
 * Merges rapid STT fragments after a barge-in into one user utterance.
 */
export class BargeInUtteranceCollector {
  private merged: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;

  constructor(
    private readonly mergeWindowMs: number,
    private readonly onMerged: (text: string) => void,
  ) {}

  isActive(): boolean {
    return this.active;
  }

  /** Start collecting after interrupt; prior buffer may be seeded. */
  activate(seed?: string | null): void {
    this.active = true;
    if (seed?.trim()) {
      this.merged = coalescePendingTranscript(this.merged, seed.trim());
    }
  }

  ingest(text: string, final: boolean): void {
    if (!this.active) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    this.merged = coalescePendingTranscript(this.merged, trimmed);
    this.scheduleFlush(final);
  }

  reset(): void {
    this.clearTimer();
    this.active = false;
    this.merged = null;
  }

  /** Returns best merged text without firing callback. */
  peek(): string | null {
    return this.merged?.trim() || null;
  }

  flushNow(): string | null {
    this.clearTimer();
    if (!this.active) return null;
    const text = this.merged?.trim() || null;
    this.merged = null;
    this.active = false;
    if (!text) return null;
    if (isFillerOnlyUtterance(text)) return null;
    return text;
  }

  private scheduleFlush(final: boolean): void {
    this.clearTimer();
    const delay = final ? Math.min(200, this.mergeWindowMs) : this.mergeWindowMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.emitMerged();
    }, delay);
  }

  private emitMerged(): void {
    const text = this.flushNow();
    if (!text) return;
    if (shouldSkipAsUserTurn(text, null)) return;
    this.onMerged(text);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
