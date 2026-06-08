import { toElevenLabsConvaiLanguage } from "@/lib/integrations/elevenlabs-convai-language";

/**
 * Languages supported by `eleven_flash_v2_5` (32 total).
 * @see https://elevenlabs.io/docs/overview/models#flash-v25
 */
export const ELEVEN_FLASH_V25_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "fr", label: "French" },
  { code: "ko", label: "Korean" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "es", label: "Spanish" },
  { code: "id", label: "Indonesian" },
  { code: "nl", label: "Dutch" },
  { code: "tr", label: "Turkish" },
  { code: "fil", label: "Filipino" },
  { code: "pl", label: "Polish" },
  { code: "sv", label: "Swedish" },
  { code: "bg", label: "Bulgarian" },
  { code: "ro", label: "Romanian" },
  { code: "ar", label: "Arabic" },
  { code: "cs", label: "Czech" },
  { code: "el", label: "Greek" },
  { code: "fi", label: "Finnish" },
  { code: "hr", label: "Croatian" },
  { code: "ms", label: "Malay" },
  { code: "sk", label: "Slovak" },
  { code: "da", label: "Danish" },
  { code: "ta", label: "Tamil" },
  { code: "uk", label: "Ukrainian" },
  { code: "ru", label: "Russian" },
  { code: "hu", label: "Hungarian" },
  { code: "no", label: "Norwegian" },
  { code: "vi", label: "Vietnamese" },
] as const;

export type ElevenFlashV25LanguageCode =
  (typeof ELEVEN_FLASH_V25_LANGUAGES)[number]["code"];

export const ELEVEN_FLASH_V25_LANGUAGE_CODES = new Set<string>(
  ELEVEN_FLASH_V25_LANGUAGES.map((l) => l.code),
);

const DEFAULT_TTS_LANGUAGE: ElevenFlashV25LanguageCode = "en";

const FLASH_LABEL_BY_CODE = new Map(
  ELEVEN_FLASH_V25_LANGUAGES.map((l) => [l.code, l.label]),
);

/**
 * Maps portal / DB locale strings to an ISO 639-1 code valid for Flash v2.5 TTS.
 */
export function toElevenLabsTtsLanguageCode(
  locale: string | null | undefined,
): ElevenFlashV25LanguageCode {
  const mapped = toElevenLabsConvaiLanguage(locale);
  if (ELEVEN_FLASH_V25_LANGUAGE_CODES.has(mapped)) {
    return mapped as ElevenFlashV25LanguageCode;
  }
  return DEFAULT_TTS_LANGUAGE;
}

/** Human-readable label for a stored language code or locale. */
export function flashV25LanguageLabel(
  locale: string | null | undefined,
): string {
  const code = toElevenLabsTtsLanguageCode(locale);
  return FLASH_LABEL_BY_CODE.get(code) ?? "English";
}

/** Normalizes stored values (e.g. `en-US`) to a Flash v2.5 dropdown code. */
export function normalizeAgentLanguageForPortal(
  locale: string | null | undefined,
): ElevenFlashV25LanguageCode {
  return toElevenLabsTtsLanguageCode(locale);
}

export function isFlashV25LanguageCode(
  value: string,
): value is ElevenFlashV25LanguageCode {
  return ELEVEN_FLASH_V25_LANGUAGE_CODES.has(value);
}
