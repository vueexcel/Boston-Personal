import { toElevenLabsTtsLanguageCode } from "@/lib/integrations/elevenlabs-flash-v25-languages";

/** ISO 639-3 (franc) → ISO 639-1 agent codes we support. */
const FRANC_TO_ISO1: Record<string, string> = {
  eng: "en",
  spa: "es",
  fra: "fr",
  deu: "de",
  ita: "it",
  por: "pt",
  nld: "nl",
  pol: "pl",
  rus: "ru",
  jpn: "ja",
  cmn: "zh",
  zho: "zh",
  kor: "ko",
  hin: "hi",
  ara: "ar",
  tur: "tr",
  swe: "sv",
  dan: "da",
  fin: "fi",
  ell: "el",
  ces: "cs",
  ron: "ro",
  bul: "bg",
  hrv: "hr",
  slk: "sk",
  ukr: "uk",
  ind: "id",
  fil: "fil",
  msa: "ms",
  vie: "vi",
  tha: "th",
};

const MIN_CHARS_FOR_FRANC = 25;
const MAX_SHORT_ANSWER_CHARS = 25;

const ENGLISH_QUESTION_START =
  /^(what|how|can|do|does|is|are|were|will|would|could|should|who|where|when|why|so|also|uh|um|i\s|my\s|we\s|no\b|yes\b)/i;

/** Lightweight Latin-script hints for confident foreign-language detection. */
const LATIN_HINTS: Record<string, RegExp[]> = {
  es: [/\b(hola|gracias|por\s+favor|buenos|buenas|qué|que\s+tal)\b/i],
  fr: [/\b(bonjour|merci|oui|non|je\s+suis|vous)\b/i],
  de: [/\b(hallo|danke|bitte|guten|ich\s+bin)\b/i],
  it: [/\b(ciao|grazie|prego|buongiorno)\b/i],
  pt: [/\b(olá|ola|obrigad|bom\s+dia)\b/i],
};

export type LanguageMismatchOptions = {
  /** Skip check when answering a COLLECT slot (names, company names). */
  answeringCollectField?: boolean;
  /** Caller recently had a successful English turn — trust STT. */
  suppressAfterSuccessfulTurn?: boolean;
};

function isMostlyAsciiLatin(text: string): boolean {
  const letters = text.replace(/[\s\d\W_]/g, "");
  if (!letters.length) return true;
  return /^[\u0000-\u024F]+$/.test(letters);
}

function detectScriptLanguage(text: string): string | null {
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u3040-\u30FF]/.test(text)) return "ja";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko";
  return null;
}

function detectLatinHint(text: string): string | null {
  for (const [code, patterns] of Object.entries(LATIN_HINTS)) {
    if (patterns.some((re) => re.test(text))) return code;
  }
  return null;
}

async function detectWithFranc(text: string): Promise<string | null> {
  if (text.trim().length < MIN_CHARS_FOR_FRANC) return null;
  try {
    const { franc } = await import("franc");
    const code3 = franc(text, { minLength: MIN_CHARS_FOR_FRANC });
    if (!code3 || code3 === "und") return null;
    return FRANC_TO_ISO1[code3] ?? null;
  } catch {
    return null;
  }
}

function isLikelyEnglishUtterance(text: string): boolean {
  const trimmed = text.trim();
  if (ENGLISH_QUESTION_START.test(trimmed)) return true;
  if (/\b(the|and|or|you|your|our|services?|provide|please|thank)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Best-effort utterance language (ISO 639-1). Returns null if unknown.
 */
export async function detectUtteranceLanguage(
  text: string,
  agentLanguage?: string | null,
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const expected = toElevenLabsTtsLanguageCode(agentLanguage);

  const script = detectScriptLanguage(trimmed);
  if (script) return script;

  const hint = detectLatinHint(trimmed);
  if (hint) return hint;

  // English agents: do not use franc on ASCII/Latin text — STT is already locked to en.
  if (expected === "en" && isMostlyAsciiLatin(trimmed)) {
    if (isLikelyEnglishUtterance(trimmed)) return "en";
    return null;
  }

  return detectWithFranc(trimmed);
}

/**
 * True when caller speech confidently does not match the agent's configured language.
 * English agents only block on non-Latin script or explicit foreign cue words.
 */
export async function isUtteranceLanguageMismatch(
  utterance: string,
  agentLanguage: string | null | undefined,
  options?: LanguageMismatchOptions,
): Promise<boolean> {
  if (options?.suppressAfterSuccessfulTurn) return false;
  if (options?.answeringCollectField) return false;

  const trimmed = utterance.trim();
  const tokenCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (tokenCount <= 3 && trimmed.length <= MAX_SHORT_ANSWER_CHARS) {
    return false;
  }

  const expected = toElevenLabsTtsLanguageCode(agentLanguage);

  if (expected === "en" && isMostlyAsciiLatin(trimmed)) {
    if (isLikelyEnglishUtterance(trimmed)) return false;
    const script = detectScriptLanguage(trimmed);
    if (script && script !== "en") return true;
    const hint = detectLatinHint(trimmed);
    if (hint && hint !== "en") return true;
    return false;
  }

  const detected = await detectUtteranceLanguage(trimmed, agentLanguage);
  if (!detected) return false;
  return detected !== expected;
}

/** True only when a non-English agent should get a language reprompt (not clarification). */
export async function shouldUseLanguageReprompt(
  utterance: string,
  agentLanguage: string | null | undefined,
): Promise<boolean> {
  const expected = toElevenLabsTtsLanguageCode(agentLanguage);
  if (expected === "en") return false;

  const trimmed = utterance.trim();
  const tokenCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (tokenCount <= 3 && trimmed.length <= MAX_SHORT_ANSWER_CHARS) {
    return false;
  }

  const script = detectScriptLanguage(trimmed);
  if (script && script !== expected) return true;

  const hint = detectLatinHint(trimmed);
  if (hint && hint !== expected) return true;

  const detected = await detectWithFranc(trimmed);
  return Boolean(detected && detected !== expected);
}
