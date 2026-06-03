const GOODBYE_PATTERNS: RegExp[] = [
  /\b(good\s*bye|goodbye)\b/i,
  /\bbye\s*bye\b/i,
  /\bbye\b/i,
  /\b(that'?s\s+all|that\s+is\s+all)\b/i,
  /\b(i'?m\s+done|im\s+done|all\s+done)\b/i,
  /\b(hang\s+up|end\s+(the\s+)?call)\b/i,
  /\b(nothing\s+else|no\s+thanks|no\s+thank\s+you)\b/i,
  /\bhave\s+a\s+(good|nice)\s+(day|one)\b/i,
];

const DEFAULT_FAREWELL = "Thanks for calling. Goodbye.";

/**
 * Detects caller intent to end the phone conversation.
 */
export function isGoodbyeIntent(transcript: string): boolean {
  const text = transcript.trim();
  if (text.length < 2) return false;
  return GOODBYE_PATTERNS.some((re) => re.test(text));
}

export function getGoodbyeFarewell(
  agentFarewell?: string | null,
): string {
  const custom = agentFarewell?.trim();
  return custom || DEFAULT_FAREWELL;
}
