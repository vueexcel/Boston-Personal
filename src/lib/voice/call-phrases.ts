import {
  toElevenLabsTtsLanguageCode,
  type ElevenFlashV25LanguageCode,
} from "@/lib/integrations/elevenlabs-flash-v25-languages";
import type { CallAgentSnapshot } from "@/lib/services/twilio-call-agent";

const INACTIVITY_FAREWELL: Record<ElevenFlashV25LanguageCode, string> = {
  en: "I haven't heard from you. Thanks for calling. Goodbye.",
  es: "No he escuchado de usted. Gracias por llamar. Adiós.",
  fr: "Je ne vous ai pas entendu. Merci d'avoir appelé. Au revoir.",
  de: "Ich habe nichts mehr von Ihnen gehört. Danke für Ihren Anruf. Auf Wiederhören.",
  it: "Non l'ho sentita. Grazie per aver chiamato. Arrivederci.",
  pt: "Não ouvi mais de si. Obrigado por ligar. Adeus.",
  nl: "Ik heb niets meer van u gehoord. Bedankt voor uw oproep. Tot ziens.",
  pl: "Nie słyszę już od Pana/Pani. Dziękuję za telefon. Do widzenia.",
  ru: "Я вас больше не слышу. Спасибо за звонок. До свидания.",
  ja: "お声が聞こえません。お電話ありがとうございました。失礼いたします。",
  zh: "我没有听到您的声音。感谢您的来电。再见。",
  ko: "말씀이 들리지 않습니다. 전화해 주셔서 감사합니다. 안녕히 가세요.",
  hi: "मैंने आपकी आवाज़ नहीं सुनी। कॉल के लिए धन्यवाद। अलविदा।",
  ar: "لم أسمع منك. شكراً لاتصالك. مع السلامة.",
  tr: "Sizden ses gelmedi. Aradığınız için teşekkürler. Hoşça kalın.",
  sv: "Jag har inte hört från dig. Tack för samtalet. Hejdå.",
  bg: "Не чух нищо от вас. Благодаря за обаждането. Довиждане.",
  ro: "Nu am mai auzit nimic. Mulțumesc pentru apel. La revedere.",
  cs: "Už od vás nic neslyším. Děkuji za hovor. Na shledanou.",
  el: "Δεν σας άκουσα. Ευχαριστώ για την κλήση. Αντίο.",
  fi: "En kuule teitä enää. Kiitos soitosta. Näkemiin.",
  hr: "Ne čujem vas više. Hvala na pozivu. Doviđenja.",
  ms: "Saya tidak mendengar anda. Terima kasih kerana menghubungi. Selamat tinggal.",
  sk: "Už vás nepočujem. Ďakujem za hovor. Dovidenia.",
  da: "Jeg har ikke hørt fra dig. Tak for opkaldet. Farvel.",
  ta: "உங்களிடமிருந்து எதுவும் கேட்கவில்லை. அழைத்ததற்கு நன்றி. பிரியாவிடை.",
  uk: "Я вас більше не чую. Дякую за дзвінок. До побачення.",
  hu: "Nem hallom Önt. Köszönöm a hívást. Viszontlátásra.",
  no: "Jeg har ikke hørt fra deg. Takk for samtalen. Ha det.",
  vi: "Tôi không nghe thấy bạn nữa. Cảm ơn bạn đã gọi. Tạm biệt.",
  id: "Saya tidak mendengar Anda. Terima kasih telah menelepon. Selamat tinggal.",
  fil: "Wala na akong naririnig. Salamat sa pagtawag. Paalam.",
};

const ERROR_RETRY: Record<ElevenFlashV25LanguageCode, string> = {
  en: "Sorry — I missed that. Mind saying it again?",
  es: "Perdón, no lo entendí. ¿Puede repetirlo?",
  fr: "Désolé, je n'ai pas compris. Pouvez-vous répéter ?",
  de: "Entschuldigung, das habe ich verpasst. Können Sie das wiederholen?",
  it: "Scusi, non ho capito. Può ripetere?",
  pt: "Desculpe, não percebi. Pode repetir?",
  nl: "Sorry, dat heb ik gemist. Kunt u dat herhalen?",
  pl: "Przepraszam, nie zrozumiałem. Czy może Pan/Pani powtórzyć?",
  ru: "Извините, я не расслышал. Не могли бы вы повторить?",
  ja: "すみません、聞き取れませんでした。もう一度お願いできますか？",
  zh: "抱歉，我没听清。您能再说一遍吗？",
  ko: "죄송합니다, 못 들었습니다. 다시 말씀해 주시겠어요?",
  hi: "माफ़ कीजिए, मैं सुन नहीं पाया। क्या आप दोहरा सकते हैं?",
  ar: "عذراً، لم أفهم. هل يمكنك الإعادة؟",
  tr: "Özür dilerim, kaçırdım. Tekrar edebilir misiniz?",
  sv: "Ursäkta, jag missade det. Kan du säga det igen?",
  bg: "Съжалявам, пропуснах това. Можете ли да повторите?",
  ro: "Îmi pare rău, nu am înțeles. Puteți repeta?",
  cs: "Omlouvám se, to jsem nezachytil. Můžete to zopakovat?",
  el: "Συγγνώμη, δεν το άκουσα. Μπορείτε να το επαναλάβετε;",
  fi: "Anteeksi, en kuullut. Voisitko toistaa?",
  hr: "Oprostite, nisam čuo. Možete li ponoviti?",
  ms: "Maaf, saya terlepas. Boleh ulang sekali lagi?",
  sk: "Prepáčte, nepočul som. Môžete to zopakovať?",
  da: "Undskyld, det missede jeg. Kan du sige det igen?",
  ta: "மன்னிக்கவும், கேட்கவில்லை. மீண்டும் சொல்ல முடியுமா?",
  uk: "Вибачте, я не почув. Чи не могли б ви повторити?",
  hu: "Elnézést, lemaradtam. Megismételné?",
  no: "Beklager, det gikk meg forbi. Kan du si det igjen?",
  vi: "Xin lỗi, tôi không nghe rõ. Bạn có thể nói lại không?",
  id: "Maaf, saya tidak menangkapnya. Bisa diulangi?",
  fil: "Paumanhin, hindi ko narinig. Maaari bang ulitin?",
};

const MAX_TURNS_FAREWELL: Record<ElevenFlashV25LanguageCode, string> = {
  en: "Thanks for calling. Goodbye.",
  es: "Gracias por llamar. Adiós.",
  fr: "Merci d'avoir appelé. Au revoir.",
  de: "Danke für Ihren Anruf. Auf Wiederhören.",
  it: "Grazie per aver chiamato. Arrivederci.",
  pt: "Obrigado por ligar. Adeus.",
  nl: "Bedankt voor uw oproep. Tot ziens.",
  pl: "Dziękuję za telefon. Do widzenia.",
  ru: "Спасибо за звонок. До свидания.",
  ja: "お電話ありがとうございました。失礼いたします。",
  zh: "感谢您的来电。再见。",
  ko: "전화해 주셔서 감사합니다. 안녕히 가세요.",
  hi: "कॉल के लिए धन्यवाद। अलविदा।",
  ar: "شكراً لاتصالك. مع السلامة.",
  tr: "Aradığınız için teşekkürler. Hoşça kalın.",
  sv: "Tack för samtalet. Hejdå.",
  bg: "Благодаря за обаждането. Довиждане.",
  ro: "Mulțumesc pentru apel. La revedere.",
  cs: "Děkuji za hovor. Na shledanou.",
  el: "Ευχαριστώ για την κλήση. Αντίο.",
  fi: "Kiitos soitosta. Näkemiin.",
  hr: "Hvala na pozivu. Doviđenja.",
  ms: "Terima kasih kerana menghubungi. Selamat tinggal.",
  sk: "Ďakujem za hovor. Dovidenia.",
  da: "Tak for opkaldet. Farvel.",
  ta: "அழைத்ததற்கு நன்றி. பிரியாவிடை.",
  uk: "Дякую за дзвінок. До побачення.",
  hu: "Köszönöm a hívást. Viszontlátásra.",
  no: "Takk for samtalen. Ha det.",
  vi: "Cảm ơn bạn đã gọi. Tạm biệt.",
  id: "Terima kasih telah menelepon. Selamat tinggal.",
  fil: "Salamat sa pagtawag. Paalam.",
};

const TIME_LIMIT_FAREWELL: Record<ElevenFlashV25LanguageCode, string> = {
  en: "We're at the time limit for this call. Thanks for calling. Goodbye.",
  es: "Hemos llegado al límite de tiempo de esta llamada. Gracias por llamar. Adiós.",
  fr: "Nous avons atteint la limite de temps pour cet appel. Merci d'avoir appelé. Au revoir.",
  de: "Wir haben das Zeitlimit für diesen Anruf erreicht. Danke für Ihren Anruf. Auf Wiederhören.",
  it: "Abbiamo raggiunto il limite di tempo per questa chiamata. Grazie per aver chiamato. Arrivederci.",
  pt: "Atingimos o limite de tempo desta chamada. Obrigado por ligar. Adeus.",
  nl: "We hebben de tijdslimiet voor dit gesprek bereikt. Bedankt voor uw oproep. Tot ziens.",
  pl: "Osiągnęliśmy limit czasu tej rozmowy. Dziękuję za telefon. Do widzenia.",
  ru: "Мы достигли лимита времени для этого звонка. Спасибо за звонок. До свидания.",
  ja: "通話時間の上限に達しました。お電話ありがとうございました。失礼いたします。",
  zh: "本次通话已达到时间上限。感谢您的来电。再见。",
  ko: "통화 시간 제한에 도달했습니다. 전화해 주셔서 감사합니다. 안녕히 가세요.",
  hi: "इस कॉल की समय सीमा पूरी हो गई है। कॉल के लिए धन्यवाद। अलविदा।",
  ar: "وصلنا إلى الحد الزمني لهذه المكالمة. شكراً لاتصالك. مع السلامة.",
  tr: "Bu arama için süre sınırına ulaştık. Aradığınız için teşekkürler. Hoşça kalın.",
  sv: "Vi har nått tidsgränsen för det här samtalet. Tack för samtalet. Hejdå.",
  bg: "Достигнахме времевия лимит за това обаждане. Благодаря за обаждането. Довиждане.",
  ro: "Am atins limita de timp pentru acest apel. Mulțumesc pentru apel. La revedere.",
  cs: "Dosáhli jsme časového limitu tohoto hovoru. Děkuji za hovor. Na shledanou.",
  el: "Φτάσαμε στο χρονικό όριο αυτής της κλήσης. Ευχαριστώ για την κλήση. Αντίο.",
  fi: "Puhelun aikaraja on täynnä. Kiitos soitosta. Näkemiin.",
  hr: "Dosegnuli smo vremensko ograničenje ovog poziva. Hvala na pozivu. Doviđenja.",
  ms: "Kami telah mencapai had masa untuk panggilan ini. Terima kasih kerana menghubungi. Selamat tinggal.",
  sk: "Dosiahli sme časový limit tohto hovoru. Ďakujem za hovor. Dovidenia.",
  da: "Vi har nået tidsgrænsen for dette opkald. Tak for opkaldet. Farvel.",
  ta: "இந்த அழைப்பின் நேர வரம்பை அடைந்துவிட்டோம். அழைத்ததற்கு நன்றி. பிரியாவிடை.",
  uk: "Ми досягли часового ліміту для цього дзвінка. Дякую за дзвінок. До побачення.",
  hu: "Elértük a hívás időkorlátját. Köszönöm a hívást. Viszontlátásra.",
  no: "Vi har nådd tidsgrensen for denne samtalen. Takk for samtalen. Ha det.",
  vi: "Chúng tôi đã đạt giới hạn thời gian cho cuộc gọi này. Cảm ơn bạn đã gọi. Tạm biệt.",
  id: "Kami telah mencapai batas waktu untuk panggilan ini. Terima kasih telah menelepon. Selamat tinggal.",
  fil: "Naabot na namin ang limitasyon ng oras para sa tawag na ito. Salamat sa pagtawag. Paalam.",
};

function phraseForLanguage(
  map: Record<ElevenFlashV25LanguageCode, string>,
  language?: string | null,
): string {
  const code = toElevenLabsTtsLanguageCode(language);
  return map[code] ?? map.en;
}

export function getInactivityFarewellPhrase(language?: string | null): string {
  return phraseForLanguage(INACTIVITY_FAREWELL, language);
}

export function getErrorRetryPhrase(language?: string | null): string {
  return phraseForLanguage(ERROR_RETRY, language);
}

export function getMaxTurnsFarewellPhrase(language?: string | null): string {
  return phraseForLanguage(MAX_TURNS_FAREWELL, language);
}

export function getTimeLimitFarewellPhrase(language?: string | null): string {
  return phraseForLanguage(TIME_LIMIT_FAREWELL, language);
}

/** Build context-aware clarification options from agent COLLECT config. */
export function buildClarificationOptions(
  snapshot: CallAgentSnapshot,
): string[] {
  const opts: string[] = ["services"];
  let hasAppointments = false;
  let hasPricing = false;

  for (const field of snapshot.infoToCollect) {
    const key = field.toLowerCase();
    if (/appointment|consultation|callback|book|schedule|time|slot/.test(key)) {
      hasAppointments = true;
    }
    if (/price|fee|cost|budget|charge/.test(key)) {
      hasPricing = true;
    }
  }

  if (hasAppointments) opts.push("appointments");
  else opts.push("appointments");

  if (hasPricing) opts.push("pricing");
  else opts.push("pricing");

  return opts.slice(0, 3);
}

function formatOptionList(options: string[]): string {
  if (options.length === 0) return "our services";
  if (options.length === 1) return options[0];
  if (options.length === 2) return `${options[0]} or ${options[1]}`;
  return `${options.slice(0, -1).join(", ")}, or ${options[options.length - 1]}`;
}

/**
 * Conversational fallback when understanding is uncertain — keeps the call moving.
 */
export function getClarificationFallbackPhrase(
  snapshot: CallAgentSnapshot,
): string {
  const options = buildClarificationOptions(snapshot);
  const list = formatOptionList(options);
  const code = toElevenLabsTtsLanguageCode(snapshot.language);
  if (code === "en") {
    return `I didn't catch that. Were you asking about ${list}?`;
  }
  return `I didn't catch that. Were you asking about ${list}?`;
}
