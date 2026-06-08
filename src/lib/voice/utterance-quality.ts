const FILLER_ONLY_PATTERN =
  /^(okay|ok|k|yeah|yes|yep|yup|uh|um|hmm|hm|right|sure|alright|fine|thanks|thank you)[\s.!?,]*$/i;

/**
 * True when the utterance is only a short acknowledgment with no real content.
 */
export function isFillerOnlyUtterance(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length <= 2) return true;
  return FILLER_ONLY_PATTERN.test(trimmed);
}

/**
 * Skip filler-only turns when a longer pending utterance exists (barge-in merge).
 */
export function shouldSkipAsUserTurn(
  text: string,
  pendingLonger: string | null | undefined,
): boolean {
  if (!isFillerOnlyUtterance(text)) return false;
  if (!pendingLonger?.trim()) return false;
  return pendingLonger.trim().length > text.trim().length + 4;
}
