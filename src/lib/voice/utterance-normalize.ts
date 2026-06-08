import { normalizeForEchoCompare } from "@/lib/voice/echo-filter";

/**
 * Trim snowballed STT partials that repeat prior user turns and return only new speech.
 * Returns null when the utterance is a duplicate of a prior user line.
 */
export function normalizeCallerTranscript(
  text: string,
  priorUserLines: string[],
): string | null {
  let trimmed = text.trim();
  if (!trimmed) return null;

  const normIn = normalizeForEchoCompare(trimmed);

  for (const prior of priorUserLines) {
    const p = prior.trim();
    if (!p) continue;
    if (normalizeForEchoCompare(p) === normIn) return null;
  }

  let longestPrefix = "";
  for (const prior of priorUserLines) {
    const p = prior.trim();
    if (!p) continue;
    const normP = normalizeForEchoCompare(p);
    if (normIn.startsWith(normP) && normP.length > longestPrefix.length) {
      longestPrefix = p;
    }
  }

  if (longestPrefix) {
    const tail = extractTailAfterPrefix(trimmed, longestPrefix);
    const normTail = normalizeForEchoCompare(tail);
    if (!normTail || normTail.length < 2) return null;
    if (normalizeForEchoCompare(longestPrefix) === normTail) return null;
    trimmed = tail;
  }

  return trimmed.length >= 2 ? trimmed : null;
}

function extractTailAfterPrefix(text: string, prefix: string): string {
  const lowerText = text.toLowerCase();
  const lowerPrefix = prefix.toLowerCase();
  const idx = lowerText.indexOf(lowerPrefix);
  if (idx < 0) return text.trim();
  return text.slice(idx + prefix.length).replace(/^[\s,.!?-]+/, "").trim();
}

/** True when STT text repeats a user line already in the conversation. */
export function isDuplicateUserTranscript(
  text: string,
  priorUserLines: string[],
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const norm = normalizeForEchoCompare(trimmed);
  for (const prior of priorUserLines) {
    const p = prior.trim();
    if (!p) continue;
    const normP = normalizeForEchoCompare(p);
    if (norm === normP) return true;
    if (norm.startsWith(normP) && norm.length <= normP.length + 4) return true;
  }
  return false;
}

/** True when text is the same utterance currently being processed. */
export function isActiveTurnDuplicate(
  text: string,
  activeTurnTranscript: string | null,
): boolean {
  if (!activeTurnTranscript?.trim()) return false;
  const norm = normalizeForEchoCompare(text);
  const normActive = normalizeForEchoCompare(activeTurnTranscript);
  if (!norm || !normActive) return false;
  if (norm === normActive) return true;
  return norm.startsWith(normActive) && norm.length <= normActive.length + 6;
}
