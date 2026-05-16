/**
 * ElevenLabs Conversational AI agent `language` must be a short code from their
 * allowlist (e.g. `en`), not a BCP-47 locale like `en-US`.
 *
 * @see https://elevenlabs.io/docs/api-reference/introduction
 */

/** Languages accepted by ConvAI `conversation_config.agent.language`. */
export const ELEVENLABS_CONVAI_LANGUAGES = new Set([
  "en",
  "zh",
  "es",
  "hi",
  "pt",
  "fr",
  "de",
  "ja",
  "ar",
  "ko",
  "id",
  "it",
  "nl",
  "tr",
  "pl",
  "ru",
  "sv",
  "tl",
  "ms",
  "ro",
  "uk",
  "el",
  "cs",
  "da",
  "fi",
  "bg",
  "hr",
  "sk",
  "ta",
  "vi",
  "no",
  "hu",
  "pt-br",
  "fil",
  "af",
  "hy",
  "as",
  "ast",
  "az",
  "be",
  "bn",
  "bs",
  "ca",
  "yue",
  "et",
  "gl",
  "ka",
  "gu",
  "ha",
  "he",
  "is",
  "ga",
  "jv",
  "kn",
  "kk",
  "ky",
  "lv",
  "lt",
  "lb",
  "mk",
  "ml",
  "mt",
  "mi",
  "mr",
  "my",
  "mn",
  "ne",
  "oc",
  "or",
  "ps",
  "fa",
  "pa",
  "sr",
  "sd",
  "sl",
  "so",
  "sw",
  "tg",
  "te",
  "th",
  "ur",
  "uz",
  "yo",
  "cy",
]);

const DEFAULT_CONVAI_LANGUAGE = "en";

/** Explicit BCP-47 / common locale → ConvAI code overrides. */
const LOCALE_TO_CONVAI: Record<string, string> = {
  "en-us": "en",
  "en-gb": "en",
  "en-au": "en",
  "en-ca": "en",
  "en-nz": "en",
  "en-ie": "en",
  "en-in": "en",
  "es-es": "es",
  "es-mx": "es",
  "es-us": "es",
  "es-419": "es",
  "fr-fr": "fr",
  "fr-ca": "fr",
  "de-de": "de",
  "de-at": "de",
  "de-ch": "de",
  "pt-pt": "pt",
  "pt-br": "pt-br",
  "zh-cn": "zh",
  "zh-tw": "zh",
  "zh-hk": "yue",
  "zh-sg": "zh",
  "cmn": "zh",
  "yue": "yue",
  "nb": "no",
  "nn": "no",
  "no-no": "no",
  "fil-ph": "fil",
  "tl-ph": "tl",
  "iw": "he",
  "he-il": "he",
  "ar-sa": "ar",
  "ar-ae": "ar",
  "ja-jp": "ja",
  "ko-kr": "ko",
  "it-it": "it",
  "nl-nl": "nl",
  "nl-be": "nl",
  "sv-se": "sv",
  "da-dk": "da",
  "fi-fi": "fi",
  "pl-pl": "pl",
  "ru-ru": "ru",
  "uk-ua": "uk",
  "vi-vn": "vi",
  "id-id": "id",
  "ms-my": "ms",
  "hi-in": "hi",
  "tr-tr": "tr",
  "cs-cz": "cs",
  "sk-sk": "sk",
  "ro-ro": "ro",
  "hu-hu": "hu",
  "el-gr": "el",
  "bg-bg": "bg",
  "hr-hr": "hr",
  "sr-rs": "sr",
  "sl-si": "sl",
  "th-th": "th",
  "ta-in": "ta",
  "te-in": "te",
  "bn-in": "bn",
  "bn-bd": "bn",
  "pa-in": "pa",
  "ur-pk": "ur",
  "fa-ir": "fa",
  "sw-ke": "sw",
  "af-za": "af",
  "ca-es": "ca",
  "gl-es": "gl",
};

/**
 * Maps portal / DB locale strings (e.g. `en-US`) to an ElevenLabs ConvAI language code.
 * Always returns a value from {@link ELEVENLABS_CONVAI_LANGUAGES} (defaults to `en`).
 */
export function toElevenLabsConvaiLanguage(
  locale: string | null | undefined,
): string {
  if (!locale?.trim()) {
    return DEFAULT_CONVAI_LANGUAGE;
  }

  const normalized = locale.trim().toLowerCase().replace(/_/g, "-");

  if (ELEVENLABS_CONVAI_LANGUAGES.has(normalized)) {
    return normalized;
  }

  const mapped = LOCALE_TO_CONVAI[normalized];
  if (mapped && ELEVENLABS_CONVAI_LANGUAGES.has(mapped)) {
    return mapped;
  }

  const parts = normalized.split("-");
  const primary = parts[0];
  const region = parts[1];

  if (primary === "pt" && region === "br") {
    return "pt-br";
  }

  if (primary && ELEVENLABS_CONVAI_LANGUAGES.has(primary)) {
    return primary;
  }

  return DEFAULT_CONVAI_LANGUAGE;
}

/**
 * Builds the `language` field for ConvAI agent create/update payloads.
 * Omits the field only when no locale was configured (ElevenLabs default).
 */
export function convaiAgentLanguageField(
  locale: string | null | undefined,
): { language: string } | Record<string, never> {
  if (!locale?.trim()) {
    return {};
  }
  return { language: toElevenLabsConvaiLanguage(locale) };
}
