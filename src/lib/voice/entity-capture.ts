/** Parses explicit spelled-out letters: "S-U-P-E-R" or "S U P E R A". */
export function parseSpelledLetters(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const tokens = trimmed
    .split(/[\s,\-–—]+/)
    .map((p) => p.replace(/[^a-zA-Z]/g, ""))
    .filter(Boolean);

  if (tokens.length === 0) return null;

  const hasDashes = /[-–—]/.test(trimmed);
  const multiLetterTokens = tokens.filter((t) => t.length > 1);
  const singleLetterTokens = tokens.filter((t) => t.length === 1);

  // Mixed normal words (e.g. "I wanna book a consultation") are not spelling.
  if (!hasDashes && multiLetterTokens.length > 0) {
    return null;
  }

  if (hasDashes) {
    if (singleLetterTokens.length + multiLetterTokens.length < 2) return null;
    const letters = trimmed.match(/[A-Za-z]/g);
    return letters && letters.length >= 2
      ? letters.join("").toUpperCase()
      : null;
  }

  // Space-separated letters only — require 3+ to avoid "I a" → "IA".
  if (
    singleLetterTokens.length === tokens.length &&
    singleLetterTokens.length >= 3
  ) {
    return singleLetterTokens.join("").toUpperCase();
  }

  return null;
}

export function isLikelySpelledName(text: string): boolean {
  return parseSpelledLetters(text) !== null;
}

const AFFIRMATIVE =
  /^(yes|yeah|yep|correct|that'?s\s+right|right|uh-?huh|sure|ok|okay)\b/i;
const NEGATIVE = /^(no|nope|wrong|incorrect|not\s+right)\b/i;

const COLLECT_INTENT_PATTERN =
  /\b(book|booking|consultation|appointment|schedule|slot|available|wanna|want\s+to|looking\s+for|services?|pricing|hours|provide|tell\s+me)\b/i;

export function isAffirmativeResponse(text: string): boolean {
  return AFFIRMATIVE.test(text.trim());
}

export function isNegativeResponse(text: string): boolean {
  return NEGATIVE.test(text.trim());
}

/** Utterance is a question/intent, not a direct COLLECT field answer. */
export function shouldSkipEntityCaptureForIntent(text: string): boolean {
  return COLLECT_INTENT_PATTERN.test(text.trim());
}

/** Single-word or short answer likely to be a proper noun (company/person). */
export function isShortEntityAnswer(text: string): boolean {
  const trimmed = text.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return false;
  if (trimmed.length > 40) return false;
  return true;
}

export function isCollectFieldEntityLike(field: string): boolean {
  const key = field.trim().toLowerCase();
  return (
    key.includes("name") ||
    key.includes("company") ||
    key.includes("organization") ||
    key.includes("business")
  );
}

export function getEntityConfirmPhrase(
  heard: string,
  fieldLabel: string,
  language?: string | null,
): string {
  void language;
  const label = fieldLabel.trim().toLowerCase();
  if (label.includes("company")) {
    return `I heard "${heard}". Is that the correct company name?`;
  }
  if (label.includes("name")) {
    return `I heard "${heard}". Is that correct?`;
  }
  return `I heard "${heard}". Is that right?`;
}

export function getSpellBackPrompt(fieldLabel: string): string {
  const label = fieldLabel.trim().toLowerCase();
  if (label.includes("company")) {
    return "Could you spell the company name for me?";
  }
  if (label.includes("name")) {
    return "Could you spell that for me?";
  }
  return "Could you spell that, please?";
}
