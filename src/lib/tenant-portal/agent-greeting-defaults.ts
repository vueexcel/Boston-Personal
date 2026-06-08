import {
  ELEVEN_FLASH_V25_LANGUAGES,
  toElevenLabsTtsLanguageCode,
  type ElevenFlashV25LanguageCode,
} from "@/lib/integrations/elevenlabs-flash-v25-languages";

export const ENGLISH_GENERIC_GREETING =
  "Hello, how can I help you today?";

/** Short phone greeting per Flash v2.5 language when no custom greeting is stored. */
export const LOCALIZED_FALLBACK_GREETINGS: Record<
  ElevenFlashV25LanguageCode,
  string
> = {
  en: ENGLISH_GENERIC_GREETING,
  ja: "こんにちは。本日はどのようなご用件でしょうか？",
  zh: "您好，请问今天有什么可以帮您的？",
  de: "Hallo, wie kann ich Ihnen heute helfen?",
  hi: "नमस्ते, आज मैं आपकी कैसे मदद कर सकता हूँ?",
  fr: "Bonjour, comment puis-je vous aider aujourd'hui ?",
  ko: "안녕하세요. 오늘 무엇을 도와드릴까요?",
  pt: "Olá, como posso ajudá-lo hoje?",
  it: "Buongiorno, come posso aiutarla oggi?",
  es: "Hola, ¿en qué puedo ayudarle hoy?",
  id: "Halo, ada yang bisa saya bantu hari ini?",
  nl: "Hallo, hoe kan ik u vandaag helpen?",
  tr: "Merhaba, bugün size nasıl yardımcı olabilirim?",
  fil: "Kumusta, paano ko kayo matutulungan ngayon?",
  pl: "Dzień dobry, w czym mogę dzisiaj pomóc?",
  sv: "Hej, hur kan jag hjälpa dig idag?",
  bg: "Здравейте, с какво мога да ви помогна днес?",
  ro: "Bună ziua, cu ce vă pot ajuta astăzi?",
  ar: "مرحباً، كيف يمكنني مساعدتك اليوم؟",
  cs: "Dobrý den, jak vám dnes mohu pomoci?",
  el: "Γεια σας, πώς μπορώ να σας βοηθήσω σήμερα;",
  fi: "Hei, miten voin auttaa teitä tänään?",
  hr: "Pozdrav, kako vam mogu danas pomoći?",
  ms: "Hai, bagaimana saya boleh membantu anda hari ini?",
  sk: "Dobrý deň, ako vám môžem dnes pomôcť?",
  da: "Hej, hvordan kan jeg hjælpe dig i dag?",
  ta: "வணக்கம், இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?",
  uk: "Вітаю, чим я можу вам допомогти сьогодні?",
  ru: "Здравствуйте, чем я могу вам помочь сегодня?",
  hu: "Üdvözöljük, miben segíthetek ma?",
  no: "Hei, hvordan kan jeg hjelpe deg i dag?",
  vi: "Xin chào, tôi có thể giúp gì cho bạn hôm nay?",
};

export function getLocalizedFallbackPhrase(
  locale: string | null | undefined,
): string {
  const code = toElevenLabsTtsLanguageCode(locale);
  return LOCALIZED_FALLBACK_GREETINGS[code] ?? ENGLISH_GENERIC_GREETING;
}

/** Ensures every Flash v2.5 language has a non-empty fallback (for tests). */
export function allFlashLanguagesHaveFallbacks(): boolean {
  return ELEVEN_FLASH_V25_LANGUAGES.every(
    (lang) => LOCALIZED_FALLBACK_GREETINGS[lang.code].trim().length > 0,
  );
}
