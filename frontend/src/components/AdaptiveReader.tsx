import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Gauge,
  HelpCircle,
  Loader2,
  PawPrint,
  Rocket,
  Sparkles,
  Volume2,
  Waves,
} from "lucide-react";
import {
  adaptTextForReader,
  extractTextFromFile,
  getTtsUrl,
  recordReadingProgress,
} from "../api/client";
import type {
  AdaptTextResponse,
  AdaptiveCard,
  Lang,
  ReaderProfileMode,
  TtsVoice,
  UserRole,
} from "../types/api";

interface AdaptiveReaderProps {
  lang: Lang;
  studentName: string;
  userRole?: UserRole;
  assignedProfile?: ReaderProfileMode;
  onProfileChange?: (profile: ReaderProfileMode) => void;
}

interface PresetTopic {
  id: string;
  title_kk: string;
  title_ru: string;
  icon: string;
  text: string;
}

const PRESET_TOPICS: PresetTopic[] = [
  {
    id: "nature",
    title_kk: "Қазақстан табиғаты",
    title_ru: "Природа Казахстана",
    icon: "🌊",
    text:
      "Сырдария өзені Қызылорда облысының аумағынан ағып өтіп, Кіші Арал теңізіне құяды. " +
      "Бұл өңірде күріш шаруашылығы жақсы дамыған. " +
      "Ғалымдар су ресурстарын тиімді пайдалану жолдарын зерттеуде. " +
      "Туған жердің табиғатын қорғау — әрбір баланың парызы.",
  },
  {
    id: "space",
    title_kk: "Ғарыш және Байқоңыр",
    title_ru: "Космос и Байконур",
    icon: "🚀",
    text:
      "Қызылорда жерінде әлемдегі ең үлкен Байқоңыр ғарыш айлағы орналасқан. " +
      "Осы жерден алып зымырандар жұлдызды аспанға самғап ұшады. " +
      "Қазақ ғарышкерлері Тоқтар Әубәкіров, Талғат Мұсабаев және Айдын Айымбетов ғарышта ерлік көрсетті. " +
      "Ғарышты зерттеу адамзатқа жаңа білім береді.",
  },
  {
    id: "animals",
    title_kk: "Жануарлар әлемі",
    title_ru: "Мир животных",
    icon: "🦌",
    text:
      "Қазақстанның кең даласында жүйрік киіктер мен сирек кездесетін құстар тіршілік етеді. " +
      "Биік тауларда қар барысы мекендейді. " +
      "Жануарлар аман болуы үшін арнайы қорықтар құрылған. " +
      "Аңдар мен құстар — табиғаттың асыл байлығы.",
  },
];

const PROFILE_MODES: {
  id: ReaderProfileMode;
  label_kk: string;
  label_ru: string;
  badge_kk: string;
  badge_ru: string;
  desc_kk: string;
  desc_ru: string;
}[] = [
  {
    id: "adhd",
    label_kk: "⚡ СДВГ (Зейін тапшылығы)",
    label_ru: "⚡ СДВГ (Внимание)",
    badge_kk: "Микро-карточкалар (4–6 сөз) • Тірек сөз фокусы • Тұтас оқу",
    badge_ru: "Микро-карточки (4–6 слов) • Фокус на главном слове • Слитное чтение",
    desc_kk:
      "Зейінді жоғалтпау үшін мәтін өте қысқа серпінді блоктарға бөлінеді, ең басты тірек сөз жасылмен ерекшеленеді.",
    desc_ru:
      "Текст дробится на ультра-короткие динамичные карточки без лишней воды, а главное слово-якорь подсвечивается для удержания внимания.",
  },
  {
    id: "dyslexia",
    label_kk: "🔤 Дислексия",
    label_ru: "🔤 Дислексия",
    badge_kk: "Буындық кемпірқосақ • Кеңейтілген интервал • Ерекше әріптер (қ, ғ, ң, ө, ү, р)",
    badge_ru: "Слоговая радуга • Расширенный трекинг букв • Подсветка графем (қ, ғ, ң, ө, ү, р)",
    desc_kk:
      "Әр буын кезектесіп екі түспен боялады, әріптер арасы кеңейтіледі және көзді шаршатпайтын жылы кремді фон қосылады.",
    desc_ru:
      "Чередующаяся двухцветная подсветка слогов не даёт буквам сливаться, увеличен межбуквенный интервал и включён тёплый кремовый фон.",
  },
  {
    id: "zpr",
    label_kk: "💡 ПДТ (ЗПР)",
    label_ru: "💡 ПДТ (ЗПР)",
    badge_kk: "Қарапайым тіл (Easy-to-Read) • Мағыналық түсіндірме • Баяу дыбыстау (0.5x)",
    badge_ru: "Простой смысл (Easy-to-Read) • Карточка-объяснение • Замедленная озвучка (0.5x)",
    desc_kk:
      "Күрделі ойлар қарапайым тілмен түсіндіріледі, әр карточкада «Қарапайым тілмен» көмекші блок және кеңейтілген сөздік беріледі.",
    desc_ru:
      "Сложные фразы переведены на понятный бытовой язык, добавлен блок «Простыми словами» и подробный толковый словарик с озвучкой 0.5x.",
  },
];

const TARGET_SPECIAL_CHARS = new Set([
  "қ",
  "Қ",
  "ғ",
  "Ғ",
  "ң",
  "Ң",
  "ө",
  "Ө",
  "ү",
  "Ү",
  "р",
  "Р",
]);

const KZ_VOWELS = new Set([
  "а",
  "ә",
  "е",
  "ё",
  "и",
  "і",
  "о",
  "ө",
  "у",
  "ұ",
  "ү",
  "ы",
  "э",
  "ю",
  "я",
  "А",
  "Ә",
  "Е",
  "Ё",
  "И",
  "І",
  "О",
  "Ө",
  "У",
  "Ұ",
  "Ү",
  "Ы",
  "Э",
  "Ю",
  "Я",
]);

/** Клиентский фонетический делитель казахских слов на слоги */
function syllabifyKazakhWord(word: string): string[] {
  const chars = Array.from(word);
  const n = chars.length;
  if (n <= 3) return [word];

  const isV = chars.map((ch, idx) => {
    if (!KZ_VOWELS.has(ch)) return false;
    // Буква 'у' после гласной выступает как полугласный/согласный (та-уық, ау-мақ, сөй-леу)
    if ((ch === "у" || ch === "У") && idx > 0 && KZ_VOWELS.has(chars[idx - 1])) {
      return false;
    }
    return true;
  });

  const vPositions: number[] = [];
  isV.forEach((v, idx) => {
    if (v) vPositions.push(idx);
  });
  if (vPositions.length <= 1) return [word];

  const syllables: string[] = [];
  let start = 0;
  for (let i = 0; i < vPositions.length - 1; i++) {
    const v1 = vPositions[i];
    const v2 = vPositions[i + 1];
    const consBetween = v2 - v1 - 1;
    let splitAt = v1 + 1;
    if (consBetween === 0) {
      splitAt = v1 + 1;
    } else if (consBetween === 1) {
      splitAt = v1 + 1;
    } else {
      splitAt = v1 + 2;
    }
    // Не оставляем одиночную букву на краю, если за ней нет гласной
    if (splitAt === 1 && !isV[0]) {
      splitAt = v1 + 2 <= v2 ? v1 + 2 : v1 + 1;
    }
    syllables.push(chars.slice(start, splitAt).join(""));
    start = splitAt;
  }
  syllables.push(chars.slice(start).join(""));
  return syllables.filter(Boolean);
}

function buildDyslexiaMarkupClient(sentence: string) {
  const rawTokens = sentence.split(/([а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]+)/g).filter(Boolean);
  const tokens: AdaptiveCard["tokens"] = [];
  const sylParts: string[] = [];

  for (const part of rawTokens) {
    if (/^[а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]+$/.test(part)) {
      const syls = syllabifyKazakhWord(part);
      sylParts.push(syls.join("-"));
      tokens.push({
        type: "word",
        raw: part,
        syllables: syls.map((s) => ({
          text: s,
          chars: Array.from(s).map((c) => ({
            char: c,
            highlight: TARGET_SPECIAL_CHARS.has(c) ? "target" : null,
          })),
        })),
      });
    } else {
      sylParts.push(part);
      tokens.push({ type: "punct_or_space", raw: part });
    }
  }

  return {
    syllable_text: sylParts.join(""),
    tokens,
  };
}

function pickSmartCardIcon(text: string, idx: number): string {
  const lower = text.toLowerCase();
  if (/(ғарыш|зымыран|байқоңыр|жұлдыз|планета)/.test(lower)) return "🚀";
  if (/(жануар|аңдар|аң\b|құс|киік|барыс|қорық)/.test(lower)) return "🦌";
  if (/(өзен|теңіз|көл|арал|сырдария|\bсу\b|суды)/.test(lower)) return "🌊";
  if (/(күріш|егін|шаруа|диқан|нан)/.test(lower)) return "🌾";
  if (/(тау|дала|орман|ағаш|гүл|табиғат)/.test(lower)) return "🌿";
  if (/(оқулық|кітап|мектеп|сынып|тіл|сөйлем|мәтін|білім)/.test(lower)) return "📘";
  const fallback = ["📖", "✨", "🌿", "🌟", "🧩", "🎯"];
  return fallback[(idx - 1) % fallback.length];
}

// Лексическое упрощение книжных и абстрактных оборотов для режима ПДТ / ЗПР (Easy-to-Read)
const ZPR_EASY_READ_RULES: [RegExp, string][] = [
  [
    /Қазақстанның\s+кең\s+даласында\s+жүйрік\s+киіктер\s+мен\s+сирек\s+кездесетін\s+құстар\s+тіршілік\s+етеді\.?/gi,
    "Қазақстанның үлкен даласында жүйрік киіктер мен әдемі құстар өмір сүреді.",
  ],
  [
    /Биік\s+тауларда\s+қар\s+барысы\s+мекендейді\.?/gi,
    "Биік тауларда әдемі қар барысы тұрады.",
  ],
  [
    /Жануарлар\s+аман\s+болуы\s+үшін\s+арнайы\s+қорықтар\s+құрылған\.?/gi,
    "Жануарларды ешкім ренжітпеуі үшін қорғайтын қорықтар ашылған.",
  ],
  [
    /Аңдар\s+мен\s+құстар\s*[—–-]\s*табиғаттың\s+асыл\s+байлығы\.?/gi,
    "Аңдар мен құстар табиғатқа өте керек. Оларды жақсы көріп, қорғауымыз керек.",
  ],
  [
    /Сырдария\s+өзені\s+Қызылорда\s+облысының\s+аумағынан\s+ағып\s+өтіп,\s*Кіші\s+Арал\s+теңізіне\s+құяды\.?/gi,
    "Үлкен Сырдария өзені Қызылорда жерімен ағып, Кіші Арал теңізіне барады.",
  ],
  [
    /Бұл\s+өңірде\s+күріш\s+шаруашылығы\s+жақсы\s+дамыған\.?/gi,
    "Бұл жерде диқандар өте көп дәмді күріш өсіреді.",
  ],
  [
    /Ғалымдар\s+су\s+ресурстарын\s+тиімді\s+пайдалану\s+жолдарын\s+зерттеуде\.?/gi,
    "Мамандар суды босқа төкпей, үнемдеп қолдануды үйретеді.",
  ],
  [
    /Туған\s+жердің\s+табиғатын\s+қорғау\s*[—–-]\s*әрбір\s+баланың\s+парызы\.?/gi,
    "Туған жеріміздің табиғатын таза ұстап, қорғау — бәріміздің міндетіміз.",
  ],
  [
    /Қызылорда\s+жерінде\s+әлемдегі\s+ең\s+үлкен\s+Байқоңыр\s+ғарыш\s+айлағы\s+орналасқан\.?/gi,
    "Қызылорда жерінде зымырандар ұшатын үлкен Байқоңыр ғарыш айлағы бар.",
  ],
  [
    /Осы\s+жерден\s+алып\s+зымырандар\s+жұлдызды\s+аспанға\s+самғап\s+ұшады\.?/gi,
    "Сол жерден үлкен зымырандар аспандағы жұлдыздарға биікке ұшады.",
  ],
  [
    /Ғарышты\s+зерттеу\s+адамзатқа\s+жаңа\s+білім\s+береді\.?/gi,
    "Ғарышты зерттеу адамдарға көп жаңа әрі қызық нәрсе үйретеді.",
  ],
  [/тіршілік\s+етеді/gi, "өмір сүреді"],
  [/мекендейді/gi, "тұрады"],
  [/сирек\s+кездесетін/gi, "ерекше"],
  [/арнайы\s+қорықтар\s+құрылған/gi, "қорғайтын қорықтар ашылған"],
  [/табиғаттың\s+асыл\s+байлығы/gi, "табиғатқа өте керек қазына"],
  [/су\s+ресурстарын\s+тиімді\s+пайдалану/gi, "суды үнемдеп қолдану"],
  [/шаруашылығы\s+жақсы\s+дамыған/gi, "егін егу ісі жақсы дамыған"],
  [/әрбір\s+баланың\s+парызы/gi, "бәріміздің маңызды міндетіміз"],
  [/мәліметтермен\s+таныстыруды\s+одан\s+әрі\s+жалғастырады/gi, "көп қызық ережелерді үйретеді"],
  [/құрметтеуіміз\s+қажет/gi, "жақсы көріп, сыйлауымыз керек"],
  [/тілдің\s+көркемдік\s+құралдарымен\s+танысасың/gi, "әдемі сөйлеуді үйренесің"],
  [/дұрыс\s+құрауға\s+төселесің/gi, "дұрыс құрастыруды оңай үйренесің"],
  [/бейнелейді/gi, "көрсетеді"],
];

const SIMPLE_MEANING_GLOSSARY: Record<string, string> = {
  сырдария: "Қазақстандағы үлкен әрі ұзын өзен.",
  аумағынан: "Сол жердің ішімен, жерімен деген сөз.",
  шаруашылығы: "Адамдардың егін егіп, еңбек ететін ісі.",
  байқоңыр: "Зымырандар ғарышқа ұшатын үлкен ғарыш айлағы.",
  ғарышкер: "Зымыранмен аспанға ұшатын батыр адам.",
  киік: "Кең далада жүйрік жүгіретін сұлу жануар.",
  қорық: "Жануарлар мен өсімдіктерді ешкімге тигізбей қорғайтын жер.",
  барыс: "Биік қарлы тауларда тұратын әдемі жыртқыш аң.",
  байлығы: "Ең қымбат, өте керек қазынасы деген мағынада.",
  парызы: "Әр адам орындауы керек маңызды міндет.",
  оқулық: "Мектепте білім беретін пайдалы кітап.",
  мұра: "Ата-бабамыздан бізге қалған асыл қазына.",
};

function simplifySentenceForZpr(sentence: string): string {
  let out = sentence.trim();
  for (const [pat, repl] of ZPR_EASY_READ_RULES) {
    out = out.replace(pat, repl);
  }
  return out;
}

function splitSentenceForAdhd(sentence: string): string[] {
  const s = sentence.trim();
  // Специальные динамичные микро-тезисы (3–5 слов) для пресетов и длинных конструкций
  if (/кең\s+даласында\s+жүйрік\s+киіктер/i.test(s)) {
    return [
      "Кең далада жүйрік киіктер жүр.",
      "Онда сирек құстар тіршілік етеді.",
    ];
  }
  if (/Сырдария\s+өзені\s+Қызылорда/i.test(s)) {
    return [
      "Сырдария Қызылорда жерімен ағады.",
      "Өзен Кіші Арал теңізіне құяды.",
    ];
  }
  if (/Тоқтар\s+Әубәкіров/i.test(s)) {
    return [
      "Тоқтар мен Талғат ғарышқа ұшты.",
      "Айдын Айымбетов те ерлік көрсетті!",
    ];
  }

  const clean = s.replace(/[.!?]+$/, "");
  const parts = clean
    .split(/\s*(?:,|;|—|–|\bжәне\b|\bал\b|\bүшін\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const p of parts) {
    const words = p.split(/\s+/);
    if (words.length <= 5) {
      chunks.push(`${p.charAt(0).toUpperCase()}${p.slice(1)}.`);
    } else {
      for (let i = 0; i < words.length; i += 5) {
        const slice = words.slice(i, i + 5).join(" ");
        if (slice) {
          chunks.push(`${slice.charAt(0).toUpperCase()}${slice.slice(1)}.`);
        }
      }
    }
  }
  return chunks;
}

function buildKeywordsForMode(sentence: string, mode: ReaderProfileMode) {
  const words = sentence.match(/[а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]{4,}/g) ?? [];
  const unique = Array.from(new Set(words.map((w) => w)));
  unique.sort((a, b) => b.length - a.length);
  const limit = mode === "zpr" ? 3 : mode === "adhd" ? 1 : 2;

  return unique.slice(0, limit).map((w) => {
    const wl = w.toLowerCase();
    const syls = syllabifyKazakhWord(w);
    const sylStr = syls.join("-");
    let meaning = SIMPLE_MEANING_GLOSSARY[wl];
    if (!meaning) {
      for (const [k, val] of Object.entries(SIMPLE_MEANING_GLOSSARY)) {
        if (wl.includes(k)) {
          meaning = val;
          break;
        }
      }
    }

    if (mode === "dyslexia") {
      const specials = Array.from(new Set(Array.from(wl).filter((c) => "қғңөүұәіһр".includes(c))));
      const spText = specials.length > 0 ? ` • Ерекше дыбыстар: ${specials.join(", ")}` : "";
      return {
        word: w,
        explanation: `Буын саны: ${syls.length} (${sylStr})${spText}`,
      };
    }

    if (mode === "zpr") {
      return {
        word: w,
        explanation: meaning
          ? `${meaning} (Буынмен: ${sylStr})`
          : `Маңызды сөз • Асықпай буынмен оқы: ${sylStr} (${syls.length} буын).`,
      };
    }

    return {
      word: w,
      explanation: meaning || `Негізгі тірек сөз (${sylStr}).`,
    };
  });
}

function buildZprExplanation(sentence: string, focusWord: string): string {
  const lower = sentence.toLowerCase();
  if (lower.includes("аңдар") || lower.includes("құстар")) {
    return "Қарапайым тілмен: жануарлар мен құстар табиғатқа сән береді, сондықтан оларға қамқор болуымыз керек.";
  }
  if (lower.includes("қорық")) {
    return "Қарапайым тілмен: қорық — аңдар мен құстарды аңшылардан қорғайтын қауіпсіз үй.";
  }
  if (lower.includes("барыс")) {
    return "Қарапайым тілмен: қар барысы тек биік әрі суық тауларда өмір сүреді.";
  }
  if (lower.includes("киік")) {
    return "Қарапайым тілмен: кең даламызда жүйрік киіктер мен әдемі құстар еркін жүреді.";
  }
  if (lower.includes("сырдария") || lower.includes("арал")) {
    return "Қарапайым тілмен: Сырдария өзенінің суы Қызылорда арқылы Кіші Арал теңізіне құйылады.";
  }
  if (lower.includes("күріш")) {
    return "Қарапайым тілмен: Қызылорда жерінде адамдар еңбектеніп, өте көп күріш өсіреді.";
  }
  if (lower.includes("су")) {
    return "Қарапайым тілмен: су — тіршілік көзі, оны босқа ағызбай үнемдеу керек.";
  }
  if (lower.includes("байқоңыр") || lower.includes("зымыран")) {
    return "Қарапайым тілмен: Байқоңырдан үлкен зымырандар аспанға, жұлдыздарға ұшады.";
  }
  return `Қарапайым тілмен: бұл сөйлемдегі ең басты ұғым — «${focusWord}». Осы ойды көз алдыңа елестетіп оқы.`;
}

/**
 * Гарантирует, что каждый из 3 профилей (СДВГ, Дислексия, ПДТ/ЗПР) имеет
 * реально отличающийся адаптированный текст, длину карточек, лексику и педагогический разбор
 * даже при работе через локальный фолбэк или до перезапуска бэкенда.
 */
function transformResponseForProfile(
  res: AdaptTextResponse,
  mode: ReaderProfileMode,
  rawText: string
): AdaptTextResponse {
  // Если отработал живой KazLLM-8B, обогащаем его карточки клиентской разметкой и иконками
  const isLocal = res.source === "local_fallback";
  const baseSentences = isLocal
    ? rawText
        .replace(/\s+/g, " ")
        .trim()
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : res.cards.map((c) => c.text.trim()).filter(Boolean);

  let targetSentences: string[] = [];
  if (mode === "adhd") {
    for (const s of baseSentences) {
      targetSentences.push(...splitSentenceForAdhd(s));
    }
    targetSentences = targetSentences.slice(0, 6);
  } else if (mode === "zpr") {
    targetSentences = baseSentences.map((s) => simplifySentenceForZpr(s)).slice(0, 5);
  } else {
    targetSentences = baseSentences.slice(0, 5);
  }

  const transformedCards: AdaptiveCard[] = targetSentences.map((text, index) => {
    const idx = index + 1;
    const dys = buildDyslexiaMarkupClient(text);
    const words = text.match(/[а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]{3,}/g) ?? [];
    const focusWord =
      words.length > 0 ? [...words].sort((a, b) => b.length - a.length)[0] : "";

    let coachTip = "";
    if (mode === "adhd") {
      coachTip = `⚡ Зейін фокусы (#${idx}): басты тірек сөз — «${focusWord}»`;
    } else if (mode === "dyslexia") {
      const sylSteps = syllabifyKazakhWord(focusWord);
      coachTip = `🔤 Буын баспалдағы: ${sylSteps.join(" → ")} (${sylSteps.length} буын)`;
    } else {
      coachTip = buildZprExplanation(text, focusWord);
    }

    return {
      id: idx,
      text,
      syllable_text: dys.syllable_text,
      tokens: dys.tokens,
      icon: pickSmartCardIcon(text, idx),
      focus_word: focusWord,
      coach_tip: coachTip,
      keywords: buildKeywordsForMode(text, mode),
    };
  });

  return {
    ...res,
    mode,
    cards: transformedCards,
  };
}

function renderCharsWithPhonemes(text: string, highlightPhonemes: boolean) {
  if (!highlightPhonemes) {
    return <>{text}</>;
  }
  return (
    <>
      {Array.from(text).map((ch, idx) => {
        if (TARGET_SPECIAL_CHARS.has(ch)) {
          return (
            <span
              key={idx}
              className="mx-0.5 inline-block rounded-md bg-amber-300/95 px-1 font-black text-slate-950 underline decoration-sky-700 decoration-2"
            >
              {ch}
            </span>
          );
        }
        return <span key={idx}>{ch}</span>;
      })}
    </>
  );
}

function renderHighlightedText(
  card: AdaptiveCard,
  showSyllables: boolean,
  highlightPhonemes: boolean,
  profileMode: ReaderProfileMode
) {
  // 1. Режим ДИСЛЕКСИЯ (или когда включено деление по слогам и есть токены):
  // Чередующаяся двухцветная подсветка слогов ("слоговая радуга"), чтобы слоги не сливались
  if (showSyllables && card.tokens && card.tokens.length > 0) {
    return (
      <>
        {card.tokens.map((tok, tIdx) => {
          if (tok.type === "punct_or_space") {
            return <span key={tIdx}>{tok.raw}</span>;
          }
          return (
            <span key={tIdx} className="inline-block whitespace-nowrap">
              {tok.syllables.map((syl, sIdx) => {
                const isEven = sIdx % 2 === 0;
                const syllableStyle =
                  profileMode === "dyslexia"
                    ? isEven
                      ? "rounded-md bg-sky-100/90 px-1 py-0.5 text-sky-950"
                      : "rounded-md bg-amber-100/90 px-1 py-0.5 text-amber-950"
                    : "";
                return (
                  <span key={sIdx}>
                    <span className={syllableStyle}>
                      {renderCharsWithPhonemes(syl.text, highlightPhonemes)}
                    </span>
                    {sIdx < tok.syllables.length - 1 && (
                      <span className="mx-0.5 font-normal text-slate-400">-</span>
                    )}
                  </span>
                );
              })}
            </span>
          );
        })}
      </>
    );
  }

  // 2. Режим СДВГ: слитное быстрое чтение с ярким выделением главного слова-фокуса (focus_word)
  if (!showSyllables && profileMode === "adhd" && card.focus_word) {
    const focusLower = card.focus_word.toLowerCase();
    const parts = card.text.split(/(\s+)/);
    return (
      <>
        {parts.map((part, idx) => {
          const cleanWord = part.replace(/[^а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]/g, "").toLowerCase();
          if (cleanWord && cleanWord === focusLower) {
            return (
              <span
                key={idx}
                className="mx-0.5 inline-block rounded-xl bg-emerald-200/90 px-2.5 py-0.5 font-black text-emerald-950 ring-2 ring-emerald-500/40"
              >
                {renderCharsWithPhonemes(part, highlightPhonemes)}
              </span>
            );
          }
          return <span key={idx}>{renderCharsWithPhonemes(part, highlightPhonemes)}</span>;
        })}
      </>
    );
  }

  const displayStr = showSyllables ? card.syllable_text : card.text;
  return renderCharsWithPhonemes(displayStr, highlightPhonemes);
}

export function AdaptiveReader({
  lang,
  studentName,
  userRole = "teacher",
  assignedProfile,
  onProfileChange,
}: AdaptiveReaderProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESET_TOPICS[0].id);
  const [customText, setCustomText] = useState<string>(PRESET_TOPICS[0].text);
  const [topicTitle, setTopicTitle] = useState<string>(PRESET_TOPICS[0].title_kk);
  const [profileMode, setProfileMode] = useState<ReaderProfileMode>(assignedProfile ?? "dyslexia");

  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrNotice, setOcrNotice] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState<number>(1);
  const [pdfTotalPages, setPdfTotalPages] = useState<number>(1);
  const [lastPdfFile, setLastPdfFile] = useState<File | null>(null);
  const [adapted, setAdapted] = useState<AdaptTextResponse | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  // Step-by-step single-card state + final quiz step
  const [stepIndex, setStepIndex] = useState(0);

  // Accessibility toggles
  const [showSyllables, setShowSyllables] = useState(true);
  const [highlightPhonemes, setHighlightPhonemes] = useState(true);
  const [creamBg, setCreamBg] = useState(true);

  // TTS voice & speed
  const [voice, setVoice] = useState<"aigul" | "daulet">("aigul");
  const [speed, setSpeed] = useState<1 | 0.5>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Quiz state
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [progressSaved, setProgressSaved] = useState(false);

  const applyVisualPresetsForMode = useCallback((nextMode: ReaderProfileMode) => {
    if (nextMode === "adhd") {
      setShowSyllables(false);
      setHighlightPhonemes(true);
      setCreamBg(false);
      setSpeed(1);
    } else if (nextMode === "dyslexia") {
      setShowSyllables(true);
      setHighlightPhonemes(true);
      setCreamBg(true);
      setSpeed(1);
    } else if (nextMode === "zpr") {
      setShowSyllables(true);
      setHighlightPhonemes(true);
      setCreamBg(true);
      setSpeed(0.5);
    }
  }, []);

  useEffect(() => {
    if (assignedProfile) {
      setProfileMode(assignedProfile);
      applyVisualPresetsForMode(assignedProfile);
    }
  }, [assignedProfile, applyVisualPresetsForMode]);

  const runAdaptation = useCallback(
    async (textToAdapt: string, titleToUse: string, modeToUse: ReaderProfileMode = profileMode) => {
      setLoading(true);
      setError(null);
      setStepIndex(0);
      setSelectedAnswers({});
      setQuizSubmitted(false);
      setProgressSaved(false);
      try {
        const res = await adaptTextForReader(textToAdapt, modeToUse, titleToUse);
        setAdapted(transformResponseForProfile(res, modeToUse, textToAdapt));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Adaptation failed");
      } finally {
        setLoading(false);
      }
    },
    [profileMode]
  );

  const handleSelectProfileMode = (nextMode: ReaderProfileMode) => {
    setProfileMode(nextMode);
    applyVisualPresetsForMode(nextMode);
    if (userRole === "teacher" && onProfileChange) {
      onProfileChange(nextMode);
    }

    // Мгновенно перестраиваем уже открытые карточки под выбранный профиль (и фоном обновляем с сервера)
    if (adapted && customText.trim()) {
      setStepIndex(0);
      setAdapted((prev) =>
        prev ? transformResponseForProfile(prev, nextMode, customText) : prev
      );
      if (!loading && !ocrLoading) {
        void runAdaptation(customText, topicTitle, nextMode);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleSelectPreset = (topic: PresetTopic) => {
    setSelectedPresetId(topic.id);
    setCustomText(topic.text);
    setTopicTitle(topic.title_kk);
  };

  const extractPageFromFile = async (file: File, targetPage: number) => {
    const MAX_MB = 10;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(
        lang === "kk"
          ? `Файл өлшемі тым үлкен (${(file.size / 1024 / 1024).toFixed(1)} МБ). Ең көбі ${MAX_MB} МБ файл жүктеңіз.`
          : `Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимальный размер — ${MAX_MB} МБ.`
      );
      return;
    }

    setOcrLoading(true);
    setError(null);
    setOcrNotice(null);
    try {
      const ocrRes = await extractTextFromFile(file, targetPage);
      const cleanTitle =
        file.name.replace(/\.[^/.]+$/, "") ||
        (lang === "kk" ? "Оқулық беті" : "Страница учебника");
      setSelectedPresetId("custom");
      setTopicTitle(cleanTitle);
      setCustomText(ocrRes.text);

      const pageNum = ocrRes.page ?? 1;
      const totalP = ocrRes.total_pages ?? 1;
      setPdfPage(pageNum);
      setPdfTotalPages(totalP);
      if (ocrRes.source_type === "pdf") {
        setLastPdfFile(file);
      } else {
        setLastPdfFile(null);
      }

      if (ocrRes.truncated) {
        setOcrNotice(
          lang === "kk"
            ? `Мәтін сәтті оқылды (${pageNum}-бет). Балаға жеңіл болуы үшін алғашқы ${ocrRes.char_limit || 1500} таңба алынды — тексеріп, «Бейімдеу» батырмасын басыңыз.`
            : `Текст распознан (стр. ${pageNum}). Для комфортного урока взяты первые ${ocrRes.char_limit || 1500} символов — проверьте текст и нажмите «Адаптировать».`
        );
      } else {
        setOcrNotice(
          lang === "kk"
            ? `Мәтін оқылды! Қажет болса түзетіп, «Бейімдеу» батырмасын басыңыз.`
            : `Текст успешно извлечён! При необходимости подправьте его и нажмите «Адаптировать».`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === "kk"
            ? "Файлдан мәтінді оқу мүмкін болмады"
            : "Не удалось распознать текст из файла"
      );
    } finally {
      setOcrLoading(false);
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await extractPageFromFile(file, 1);
  };

  const handleSpeakCard = (text: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(getTtsUrl(text, voice as TtsVoice));
    audio.preservesPitch = true;
    audio.playbackRate = speed === 0.5 ? 0.75 : 1.0;
    audioRef.current = audio;
    audio.play().catch(() => {});
  };

  const cards = adapted?.cards ?? [];
  const quiz = adapted?.quiz ?? [];
  const totalSteps = cards.length + (quiz.length > 0 ? 1 : 0);
  const isQuizStep = cards.length > 0 && stepIndex >= cards.length;
  const currentCard = !isQuizStep && cards[stepIndex] ? cards[stepIndex] : null;
  const progressPct = totalSteps > 0 ? Math.round(((stepIndex + 1) / totalSteps) * 100) : 0;

  const handleSubmitQuiz = async () => {
    setQuizSubmitted(true);
    let correct = 0;
    quiz.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.answer_index) correct += 1;
    });
    try {
      await recordReadingProgress({
        student_name: studentName,
        topic_title: topicTitle,
        cards_count: cards.length,
        quiz_score: correct,
        quiz_total: quiz.length,
      });
      setProgressSaved(true);
    } catch {
      // Non-blocking
    }
  };

  return (
    <div className="space-y-6">
      {/* Topic Selector, Profile Selector, OCR Photo/PDF Upload & Custom Text Input */}
      <section className="surface-card p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <BookOpen className="h-5 w-5 text-blue-600" />
            {lang === "kk"
              ? "Мәтінді жеңілдетіп оқу"
              : "Адаптивное чтение по карточкам"}
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            {/* Child Profile Selector: visible to Teacher (who sets it) & Parent; hidden from Student */}
            {userRole !== "student" ? (
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                {PROFILE_MODES.map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => handleSelectProfileMode(pm.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition ${
                      profileMode === pm.id
                        ? "bg-sky-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {lang === "kk" ? pm.label_kk : pm.label_ru}
                  </button>
                ))}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-1.5 text-xs font-extrabold text-sky-800 ring-1 ring-sky-200">
                <Sparkles className="h-3.5 w-3.5 text-sky-600" />
                {lang === "kk" ? "Саған бейімделген оқу режимі" : "Персональный режим чтения"}
              </span>
            )}
          </div>
        </div>

        {/* Active Profile Pedagogical Explanation Banner (shown to Teacher & Parent) */}
        {userRole !== "student" &&
          (() => {
            const activeMeta =
              PROFILE_MODES.find((p) => p.id === profileMode) ?? PROFILE_MODES[0];
            const bannerStyle =
              profileMode === "adhd"
                ? "border-emerald-200 bg-emerald-50/75 text-emerald-950"
                : profileMode === "dyslexia"
                  ? "border-amber-200 bg-amber-50/85 text-amber-950"
                  : "border-indigo-200 bg-indigo-50/85 text-indigo-950";
            const pillStyle =
              profileMode === "adhd"
                ? "bg-white/90 text-emerald-900 ring-1 ring-emerald-200/80"
                : profileMode === "dyslexia"
                  ? "bg-white/90 text-amber-900 ring-1 ring-amber-200/80"
                  : "bg-white/90 text-indigo-900 ring-1 ring-indigo-200/80";
            const badges = (lang === "kk" ? activeMeta.badge_kk : activeMeta.badge_ru)
              .split("•")
              .map((s) => s.trim())
              .filter(Boolean);

            return (
              <div
                className={`mb-4 grid gap-3 rounded-2xl border px-4 py-3.5 text-xs md:grid-cols-[auto_1fr] md:items-center ${bannerStyle}`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {badges.map((b, idx) => (
                    <span
                      key={idx}
                      className={`inline-flex items-center whitespace-nowrap rounded-xl px-2.5 py-1 font-extrabold shadow-2xs ${pillStyle}`}
                    >
                      {b}
                    </span>
                  ))}
                </div>
                <div className="font-medium leading-relaxed opacity-90 md:text-right">
                  {lang === "kk" ? activeMeta.desc_kk : activeMeta.desc_ru}
                </div>
              </div>
            );
          })()}

        {/* Preset Topic Pills (Unified flat vector icons in rounded-2xl container) */}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {PRESET_TOPICS.map((t) => {
            const active = selectedPresetId === t.id;
            const iconBoxStyle =
              t.id === "nature"
                ? "bg-sky-100 text-sky-700 ring-1 ring-sky-200/70"
                : t.id === "space"
                  ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200/70"
                  : "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/70";
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectPreset(t)}
                className={`flex items-center gap-3.5 rounded-2xl border p-3.5 text-left transition ${
                  active
                    ? "border-sky-500/60 bg-sky-50/70 shadow-xs ring-2 ring-sky-500/20"
                    : "border-slate-200/80 bg-[#F8FAFC] hover:border-slate-300 hover:bg-slate-100/80"
                }`}
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconBoxStyle}`}
                >
                  {t.id === "nature" ? (
                    <Waves className="h-5 w-5" />
                  ) : t.id === "space" ? (
                    <Rocket className="h-5 w-5" />
                  ) : (
                    <PawPrint className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-extrabold text-slate-900">
                    {lang === "kk" ? t.title_kk : t.title_ru}
                  </div>
                  <div className="text-xs font-medium text-slate-500">
                    {lang === "kk" ? "Дайын мәтін" : "Готовая тема"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Hidden file inputs for Camera/Photo and PDF */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileUpload}
          className="hidden"
        />
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Custom Kazakh Text Input Zone + Crisp Photo / PDF / Adapt Buttons */}
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={ocrLoading || loading}
                onClick={() => photoInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-800 shadow-2xs transition hover:border-sky-400 hover:bg-sky-50/60 hover:text-sky-900 disabled:opacity-50"
              >
                <Camera className="h-4 w-4 text-sky-600" />
                {lang === "kk" ? "Суретке түсіру / Кітап фотосы" : "Фото учебника"}
              </button>

              <button
                type="button"
                disabled={ocrLoading || loading}
                onClick={() => pdfInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-800 shadow-2xs transition hover:border-indigo-400 hover:bg-indigo-50/60 hover:text-indigo-900 disabled:opacity-50"
              >
                <FileText className="h-4 w-4 text-indigo-600" />
                {lang === "kk" ? "PDF жүктеу" : "Загрузить PDF"}
              </button>

              {/* Переключатель страниц, если загружен многостраничный PDF */}
              {lastPdfFile && pdfTotalPages > 1 && (
                <div className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-800 shadow-2xs">
                  <span>{lang === "kk" ? "Бет:" : "Стр:"}</span>
                  <button
                    type="button"
                    disabled={ocrLoading || pdfPage <= 1}
                    onClick={() => extractPageFromFile(lastPdfFile, pdfPage - 1)}
                    className="rounded-lg bg-slate-100 px-1.5 py-0.5 hover:bg-slate-200 disabled:opacity-40"
                  >
                    ◀
                  </button>
                  <span>
                    {pdfPage} / {pdfTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={ocrLoading || pdfPage >= pdfTotalPages}
                    onClick={() => extractPageFromFile(lastPdfFile, pdfPage + 1)}
                    className="rounded-lg bg-slate-100 px-1.5 py-0.5 hover:bg-slate-200 disabled:opacity-40"
                  >
                    ▶
                  </button>
                </div>
              )}

              {ocrLoading && (
                <span className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-900">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                  {lang === "kk" ? "Мәтін оқылуда..." : "Извлекаем текст..."}
                </span>
              )}
            </div>

            {/* Предупреждение о лимитах PDF и фото */}
            <span className="text-[11px] font-semibold text-slate-500">
              {lang === "kk"
                ? "10 МБ дейін • PDF: 1 бет (1500 таңба)"
                : "До 10 МБ • PDF: 1 стр. (1500 симв.)"}
            </span>
          </div>

          {ocrNotice && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-2 text-xs font-bold text-emerald-900">
              ✓ {ocrNotice}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <textarea
              rows={3}
              value={customText}
              onChange={(e) => {
                setSelectedPresetId("custom");
                setTopicTitle(lang === "kk" ? "Еркін мәтін" : "Свой текст");
                setCustomText(e.target.value);
              }}
              placeholder={
                lang === "kk"
                  ? "Немесе кез келген қазақша мәтінді осында қойыңыз (немесе оқулықты суретке түсіріңіз)..."
                  : "Вставьте любой казахский текст или сфотографируйте страницу учебника..."
              }
              className="flex-1 resize-none rounded-2xl border border-slate-200/90 bg-white px-4 py-3 text-sm font-medium leading-relaxed text-slate-900 shadow-inner focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none"
            />
            <button
              type="button"
              disabled={loading || ocrLoading || !customText.trim()}
              onClick={() => runAdaptation(customText, topicTitle, profileMode)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-6 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {lang === "kk" ? "Бейімдеу" : "Адаптировать"}
            </button>
          </div>
        </div>

        {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
      </section>

      {/* Accessibility Toolbar (Unified outline pill style & rounded-2xl) */}
      <section className="surface-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 px-6 py-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSyllables((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-1.5 text-xs font-extrabold transition ${
              showSyllables
                ? "border-sky-600 bg-sky-50 text-sky-900 ring-1 ring-sky-600/20"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${showSyllables ? "bg-sky-600" : "bg-slate-300"}`}
            />
            {lang === "kk" ? "Буынға бөлу (Ау-мақ)" : "По слогам (Ау-мақ)"}
          </button>

          <button
            type="button"
            onClick={() => setHighlightPhonemes((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-1.5 text-xs font-extrabold transition ${
              highlightPhonemes
                ? "border-amber-500 bg-amber-50/90 text-amber-950 ring-1 ring-amber-500/20"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                highlightPhonemes ? "bg-amber-500" : "bg-slate-300"
              }`}
            />
            {lang === "kk"
              ? "Дыбыстарды белгілеу (қ, ғ, ң, ө, ү, р)"
              : "Подсветка (қ, ғ, ң, ө, ү, р)"}
          </button>

          <button
            type="button"
            onClick={() => setCreamBg((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-1.5 text-xs font-extrabold transition ${
              creamBg
                ? "border-amber-400 bg-[#fdf8ec] text-amber-950 ring-1 ring-amber-400/25"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Eye className="h-3.5 w-3.5 text-amber-700" />
            {lang === "kk" ? "Көзге жайлы фон" : "Мягкий кремовый фон"}
          </button>
        </div>

        {/* TTS Voice & Speed Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setVoice("aigul")}
            className={`rounded-2xl px-3 py-1.5 text-xs font-bold transition ${
              voice === "aigul"
                ? "bg-sky-600 text-white shadow-2xs"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {lang === "kk" ? "Айгүл" : "Айгуль"}
          </button>
          <button
            type="button"
            onClick={() => setVoice("daulet")}
            className={`rounded-2xl px-3 py-1.5 text-xs font-bold transition ${
              voice === "daulet"
                ? "bg-sky-600 text-white shadow-2xs"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {lang === "kk" ? "Дәулет" : "Даулет"}
          </button>
          <button
            type="button"
            onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
            className={`inline-flex items-center gap-1 rounded-2xl border px-3 py-1.5 text-xs font-bold ${
              speed === 0.5
                ? "border-amber-400 bg-amber-50 text-amber-900"
                : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            <Gauge className="h-3.5 w-3.5" />
            {speed === 1 ? "1x" : "0.5x"}
          </button>
        </div>
      </section>

      {/* Single Step-by-Step Card, Skeleton Preview while loading/empty, or Final Quiz */}
      {loading || ocrLoading ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2.5 text-sm font-extrabold text-sky-700">
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
              {ocrLoading
                ? lang === "kk"
                  ? "Мәтін суреттен оқылуда..."
                  : "Распознаём текст со страницы..."
                : lang === "kk"
                  ? "Мәтін балаға түсінікті карточкаларға бөлініп жатыр..."
                  : "Адаптируем текст в короткие карточки..."}
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
              {lang === "kk" ? "1 бет · ~4 карточка" : "1 стр. · ~4 карточки"}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { w1: "w-3/4", w2: "w-1/2", badge: "1-карточка" },
              { w1: "w-5/6", w2: "w-2/3", badge: "2-карточка" },
              { w1: "w-2/3", w2: "w-1/3", badge: "3-карточка" },
            ].map((sk, idx) => (
              <div
                key={idx}
                className="animate-pulse rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 rounded-xl bg-slate-200/90" />
                  <span className="rounded-lg bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                    {sk.badge}
                  </span>
                </div>
                <div className={`h-4 rounded-lg bg-slate-200 ${sk.w1}`} />
                <div className={`h-3.5 rounded-lg bg-slate-200/80 ${sk.w2}`} />
              </div>
            ))}
          </div>
        </section>
      ) : cards.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 shadow-xs sm:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">
                {lang === "kk"
                  ? "Осында бейімделген карточкалар пайда болады"
                  : "Здесь появятся адаптированные карточки"}
              </h3>
              <p className="text-xs font-medium text-slate-500">
                {lang === "kk"
                  ? "Жоғарыдан дайын тақырыпты таңдап немесе кітап бетін жүктеп, «Бейімдеу» батырмасын басыңыз."
                  : "Выберите тему выше или загрузите фото/PDF учебника и нажмите «Адаптировать»."}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-600">
              {lang === "kk"
                ? `${pdfPage} бет · 3–6 карточка · 2 сұрақ`
                : `${pdfPage} стр. · 3–6 карточек · 2 вопроса`}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                step: "01",
                title_kk: "Қысқа карточка",
                title_ru: "Короткая карточка",
                w1: "w-4/5",
                w2: "w-3/5",
              },
              {
                step: "02",
                title_kk: "Түсіндірме сөздік",
                title_ru: "Понятный словарик",
                w1: "w-11/12",
                w2: "w-1/2",
              },
              {
                step: "03",
                title_kk: "Қорытынды мини-тест",
                title_ru: "Проверочный мини-квиз",
                w1: "w-2/3",
                w2: "w-2/5",
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200/75 text-xs font-black text-slate-600">
                    {item.step}
                  </span>
                  <span className="text-[11px] font-bold text-slate-400">
                    {lang === "kk" ? item.title_kk : item.title_ru}
                  </span>
                </div>
                <div className={`h-3.5 rounded-md bg-slate-200/80 ${item.w1}`} />
                <div className={`h-3 rounded-md bg-slate-200/60 ${item.w2}`} />
              </div>
            ))}
          </div>
        </section>
      ) : (
        cards.length > 0 && (
          <section
            className={`rounded-2xl border p-6 shadow-md transition-colors sm:p-8 ${
              creamBg
                ? "border-amber-300/90 bg-[#fdf8ec] text-slate-900 ring-1 ring-amber-200/60"
                : "border-slate-200/95 bg-white text-slate-900 ring-1 ring-slate-200/60"
            }`}
          >
            {/* Top Counter & Progress Bar */}
            <div className="mb-6">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="rounded-xl bg-slate-900/5 px-2.5 py-1 font-extrabold text-slate-800">
                    {lang === "kk"
                      ? `${pdfPage} бет · ${cards.length} карточка`
                      : `${pdfPage} стр. · ${cards.length} карточек`}
                  </span>
                  <span className="uppercase tracking-wider text-slate-500">
                    {isQuizStep
                      ? lang === "kk"
                        ? "Қорытынды сұрақтар"
                        : "Проверочный мини-квиз"
                      : lang === "kk"
                        ? `Қадам ${stepIndex + 1} / ${cards.length}`
                        : `Шаг ${stepIndex + 1} из ${cards.length}`}
                  </span>
                </div>
                <span className="rounded-xl bg-sky-50 px-2.5 py-1 text-sky-800">
                  {progressPct}%
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className="h-full rounded-full bg-sky-600 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* ONE LARGE CARD AT A TIME */}
            {currentCard && (
              <div className="space-y-6">
                <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-5xl shadow-sm ring-1 ring-slate-200">
                    {currentCard.icon}
                  </div>
                  <div className="flex-1">
                    <p
                      className={`text-2xl font-extrabold sm:text-3xl ${
                        profileMode === "dyslexia"
                          ? "leading-[2.1] tracking-[0.07em]"
                          : profileMode === "zpr"
                            ? "leading-loose tracking-wide"
                            : "leading-relaxed tracking-normal"
                      }`}
                    >
                      {renderHighlightedText(
                        currentCard,
                        showSyllables,
                        highlightPhonemes,
                        profileMode
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSpeakCard(currentCard.text)}
                    className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700"
                  >
                    <Volume2 className="h-5 w-5" />
                    {lang === "kk"
                      ? speed === 0.5
                        ? "Баяу тыңдау (0.5x)"
                        : "Тыңдау"
                      : speed === 0.5
                        ? "Медленно (0.5x)"
                        : "Озвучить"}
                  </button>
                </div>

                {/* Profile-specific Coach Tip / Meaning Helper */}
                {currentCard.coach_tip && (
                  <div
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-bold ${
                      profileMode === "zpr"
                        ? "border-indigo-200 bg-indigo-50/90 text-indigo-950"
                        : profileMode === "dyslexia"
                          ? "border-sky-200 bg-sky-50/90 text-sky-950"
                          : "border-emerald-200 bg-emerald-50/90 text-emerald-950"
                    }`}
                  >
                    <div>
                      {profileMode === "zpr" && (
                        <span className="mr-1.5 inline-block rounded-md bg-indigo-600 px-2 py-0.5 text-[11px] font-extrabold uppercase text-white">
                          {lang === "kk" ? "Түсіндірме" : "Смысл"}
                        </span>
                      )}
                      {currentCard.coach_tip}
                    </div>
                    {currentCard.focus_word && (
                      <button
                        type="button"
                        onClick={() => handleSpeakCard(currentCard.focus_word!)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-extrabold text-slate-800 shadow-sm hover:bg-slate-50"
                      >
                        <Volume2 className="h-3.5 w-3.5 text-sky-600" />
                        «{currentCard.focus_word}»
                      </button>
                    )}
                  </div>
                )}

                {/* Explained Keywords */}
                {currentCard.keywords.length > 0 && (
                  <div className="rounded-2xl border border-amber-200/80 bg-white/80 p-4">
                    <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-amber-900">
                      {profileMode === "dyslexia"
                        ? lang === "kk"
                          ? "Буындық және дыбыстық талдау:"
                          : "Слоговой и звуковой разбор:"
                        : profileMode === "zpr"
                          ? lang === "kk"
                            ? "Сөздік сандықша (Қарапайым түсіндірме):"
                            : "Подробный словарик (Простыми словами):"
                          : lang === "kk"
                            ? "Тірек сөз:"
                            : "Ключевое слово:"}
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {currentCard.keywords.map((kw, i) => (
                        <div
                          key={i}
                          className="flex items-start justify-between gap-2 rounded-xl bg-amber-50/90 p-3"
                        >
                          <div>
                            <span className="font-black text-slate-900">«{kw.word}»</span> —{" "}
                            <span className="text-sm font-medium text-slate-700">
                              {kw.explanation}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSpeakCard(kw.word)}
                            className="shrink-0 rounded-lg bg-white p-1.5 text-sky-700 shadow-sm hover:bg-sky-50"
                            title={lang === "kk" ? "Сөзді тыңдау" : "Прослушать слово"}
                          >
                            <Volume2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* FINAL 2-QUESTION MINI-QUIZ */}
            {isQuizStep && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-xl font-black text-slate-900">
                  <HelpCircle className="h-6 w-6 text-sky-600" />
                  {lang === "kk"
                    ? "Жарайсың! Енді 2 жеңіл сұраққа жауап бер:"
                    : "Отлично прочитано! Ответь на 2 простых вопроса:"}
                </div>

                <div className="space-y-4">
                  {quiz.map((q, qIdx) => (
                    <div
                      key={qIdx}
                      className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
                    >
                      <p className="mb-3 text-base font-extrabold text-slate-900">
                        {qIdx + 1}. {q.question}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {q.options.map((opt, oIdx) => {
                          const picked = selectedAnswers[qIdx] === oIdx;
                          const isCorrect = q.answer_index === oIdx;
                          let btnStyle =
                            "border-slate-200 bg-slate-50 text-slate-800 hover:border-sky-300";
                          if (quizSubmitted) {
                            if (isCorrect) {
                              btnStyle = "border-emerald-500 bg-emerald-100 text-emerald-950";
                            } else if (picked) {
                              btnStyle = "border-red-400 bg-red-100 text-red-900";
                            }
                          } else if (picked) {
                            btnStyle = "border-sky-600 bg-sky-50 text-sky-950";
                          }
                          return (
                            <button
                              key={oIdx}
                              type="button"
                              disabled={quizSubmitted}
                              onClick={() =>
                                setSelectedAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))
                              }
                              className={`rounded-xl border-2 px-3.5 py-2.5 text-left text-sm font-bold transition ${btnStyle}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {!quizSubmitted ? (
                  <button
                    type="button"
                    disabled={Object.keys(selectedAnswers).length < quiz.length}
                    onClick={handleSubmitQuiz}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-base font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    {lang === "kk" ? "Жауапты тексеру" : "Проверить ответы"}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-400 bg-emerald-50 p-4 text-emerald-950">
                    <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-base font-black">
                        {lang === "kk"
                          ? "Тамаша! Оқу нәтижесі сақталды!"
                          : "Молодец! Результат чтения сохранён!"}
                      </p>
                      {progressSaved && (
                        <p className="text-xs font-semibold text-emerald-800">
                          {studentName} • {topicTitle}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Step Navigation */}
            <div className="mt-8 flex items-center justify-between border-t border-slate-200/80 pt-4">
              <button
                type="button"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                {lang === "kk" ? "Алдыңғы" : "Назад"}
              </button>

              <div className="flex gap-1.5">
                {Array.from({ length: totalSteps }).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setStepIndex(idx)}
                    className={`h-2.5 rounded-full transition-all ${
                      stepIndex === idx ? "w-7 bg-sky-600" : "w-2.5 bg-slate-300"
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                disabled={stepIndex >= totalSteps - 1}
                onClick={() => setStepIndex((i) => Math.min(totalSteps - 1, i + 1))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-40"
              >
                {stepIndex === cards.length - 1
                  ? lang === "kk"
                    ? "Сұрақтарға өту"
                    : "К вопросам"
                  : lang === "kk"
                    ? "Келесі"
                    : "Далее"}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        )
      )}
    </div>
  );
}
