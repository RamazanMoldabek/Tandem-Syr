import type { TargetPhoneme } from "../types/api";

export type DifficultyLevel = 1 | 2 | 3;

export interface LevelExerciseItem {
  id: string;
  text: string;
  phoneme: TargetPhoneme;
  level: DifficultyLevel;
  hint_kk: string;
  hint_ru: string;
  distractor_word?: string;
}

export interface MinimalPairItem {
  id: string;
  phoneme: TargetPhoneme;
  distractor_phoneme: string;
  target_word: string;
  distractor_word: string;
  meaning_kk: string;
  meaning_ru: string;
}

export interface PhonemeCurriculum {
  phoneme: TargetPhoneme;
  distractor_phoneme: string;
  title_kk: string;
  title_ru: string;
  levels: Record<DifficultyLevel, LevelExerciseItem[]>;
  minimal_pairs: MinimalPairItem[];
}

export function calculateStars(score: number): 0 | 1 | 2 | 3 {
  if (score >= 0.85) return 3;
  if (score >= 0.65) return 2;
  if (score >= 0.45) return 1;
  return 0;
}

export const PHONEME_CURRICULUM: Record<TargetPhoneme, PhonemeCurriculum> = {
  қ: {
    phoneme: "қ",
    distractor_phoneme: "к",
    title_kk: "Қ дыбысы (Қ ↔ К)",
    title_ru: "Звук Қ (Қ ↔ К)",
    levels: {
      1: [
        { id: "q-1-1", text: "қа", phoneme: "қ", level: 1, hint_kk: "Ашық буын", hint_ru: "Открытый слог", distractor_word: "ка" },
        { id: "q-1-2", text: "қо", phoneme: "қ", level: 1, hint_kk: "Ашық буын", hint_ru: "Открытый слог", distractor_word: "ко" },
        { id: "q-1-3", text: "ақ", phoneme: "қ", level: 1, hint_kk: "Тұйық буын", hint_ru: "Закрытый слог", distractor_word: "ак" },
        { id: "q-1-4", text: "ық", phoneme: "қ", level: 1, hint_kk: "Тұйық буын", hint_ru: "Закрытый слог", distractor_word: "ык" },
      ],
      2: [
        { id: "q-2-1", text: "қар", phoneme: "қ", level: 2, hint_kk: "Аппақ қар", hint_ru: "Белый снег", distractor_word: "кар" },
        { id: "q-2-2", text: "қол", phoneme: "қ", level: 2, hint_kk: "Оң қол", hint_ru: "Рука", distractor_word: "кол" },
        { id: "q-2-3", text: "құс", phoneme: "қ", level: 2, hint_kk: "Ұшқан құс", hint_ru: "Птица", distractor_word: "кус" },
        { id: "q-2-4", text: "қасық", phoneme: "қ", level: 2, hint_kk: "Ас қасық", hint_ru: "Ложка", distractor_word: "касык" },
      ],
      3: [
        { id: "q-3-1", text: "Қа-қа-қа — қара қарға", phoneme: "қ", level: 3, hint_kk: "Жаңылтпаш", hint_ru: "Чистоговорка" },
        { id: "q-3-2", text: "Қо-қо-қо — қоңыр қозы", phoneme: "қ", level: 3, hint_kk: "Жаңылтпаш", hint_ru: "Чистоговорка" },
        { id: "q-3-3", text: "Ақ-ақ-ақ — аппақ қар", phoneme: "қ", level: 3, hint_kk: "Сөз тіркесі", hint_ru: "Чистоговорка" },
        { id: "q-3-4", text: "Ық-ық-ық — алтын қасық", phoneme: "қ", level: 3, hint_kk: "Сөз тіркесі", hint_ru: "Чистоговорка" },
      ],
    },
    minimal_pairs: [
      { id: "mp-q-1", phoneme: "қ", distractor_phoneme: "к", target_word: "қал", distractor_word: "кал", meaning_kk: "қал (осында қал)", meaning_ru: "останься" },
      { id: "mp-q-2", phoneme: "қ", distractor_phoneme: "к", target_word: "қар", distractor_word: "кар", meaning_kk: "қар (ақ қар)", meaning_ru: "снег" },
      { id: "mp-q-3", phoneme: "қ", distractor_phoneme: "к", target_word: "қас", distractor_word: "кас", meaning_kk: "қас (қас-кірпік)", meaning_ru: "бровь" },
      { id: "mp-q-4", phoneme: "қ", distractor_phoneme: "к", target_word: "ақ", distractor_word: "ак", meaning_kk: "ақ (ақ түс)", meaning_ru: "белый" },
    ],
  },
  ғ: {
    phoneme: "ғ",
    distractor_phoneme: "г",
    title_kk: "Ғ дыбысы (Ғ ↔ Г)",
    title_ru: "Звук Ғ (Ғ ↔ Г)",
    levels: {
      1: [
        { id: "gh-1-1", text: "ға", phoneme: "ғ", level: 1, hint_kk: "Ашық буын", hint_ru: "Открытый слог", distractor_word: "га" },
        { id: "gh-1-2", text: "ғо", phoneme: "ғ", level: 1, hint_kk: "Ашық буын", hint_ru: "Открытый слог", distractor_word: "го" },
        { id: "gh-1-3", text: "ағ", phoneme: "ғ", level: 1, hint_kk: "Тұйық буын", hint_ru: "Закрытый слог", distractor_word: "аг" },
        { id: "gh-1-4", text: "ығ", phoneme: "ғ", level: 1, hint_kk: "Тұйық буын", hint_ru: "Закрытый слог", distractor_word: "ыг" },
      ],
      2: [
        { id: "gh-2-1", text: "ағаш", phoneme: "ғ", level: 2, hint_kk: "Жасыл ағаш", hint_ru: "Дерево", distractor_word: "агаш" },
        { id: "gh-2-2", text: "ғалым", phoneme: "ғ", level: 2, hint_kk: "Білгір ғалым", hint_ru: "Учёный", distractor_word: "галым" },
        { id: "gh-2-3", text: "баға", phoneme: "ғ", level: 2, hint_kk: "Жақсы баға", hint_ru: "Оценка / цена", distractor_word: "бага" },
        { id: "gh-2-4", text: "сағат", phoneme: "ғ", level: 2, hint_kk: "Қол сағат", hint_ru: "Часы", distractor_word: "сагат" },
      ],
      3: [
        { id: "gh-3-1", text: "Ға-ға-ға — биік тауға", phoneme: "ғ", level: 3, hint_kk: "Жаңылтпаш", hint_ru: "Чистоговорка" },
        { id: "gh-3-2", text: "Ағ-ағ-ағ — алтын таға", phoneme: "ғ", level: 3, hint_kk: "Жаңылтпаш", hint_ru: "Чистоговорка" },
        { id: "gh-3-3", text: "Ғы-ғы-ғы — білім бұлағы", phoneme: "ғ", level: 3, hint_kk: "Сөз тіркесі", hint_ru: "Чистоговорка" },
        { id: "gh-3-4", text: "Ға-ға-ға — алтын сағат", phoneme: "ғ", level: 3, hint_kk: "Сөз тіркесі", hint_ru: "Чистоговорка" },
      ],
    },
    minimal_pairs: [
      { id: "mp-gh-1", phoneme: "ғ", distractor_phoneme: "г", target_word: "аға", distractor_word: "ага", meaning_kk: "аға (үлкен аға)", meaning_ru: "старший брат" },
      { id: "mp-gh-2", phoneme: "ғ", distractor_phoneme: "г", target_word: "баға", distractor_word: "бага", meaning_kk: "баға (бестік баға)", meaning_ru: "оценка" },
      { id: "mp-gh-3", phoneme: "ғ", distractor_phoneme: "г", target_word: "сағат", distractor_word: "сагат", meaning_kk: "сағат (уақыт)", meaning_ru: "часы" },
    ],
  },
  ң: {
    phoneme: "ң",
    distractor_phoneme: "н",
    title_kk: "Ң дыбысы (Ң ↔ Н)",
    title_ru: "Звук Ң (Ң ↔ Н)",
    levels: {
      1: [
        { id: "ng-1-1", text: "аң", phoneme: "ң", level: 1, hint_kk: "Мұрын жолды буын", hint_ru: "Носовой слог", distractor_word: "ан" },
        { id: "ng-1-2", text: "оң", phoneme: "ң", level: 1, hint_kk: "Мұрын жолды буын", hint_ru: "Носовой слог", distractor_word: "он" },
        { id: "ng-1-3", text: "ең", phoneme: "ң", level: 1, hint_kk: "Мұрын жолды буын", hint_ru: "Носовой слог", distractor_word: "ен" },
        { id: "ng-1-4", text: "ің", phoneme: "ң", level: 1, hint_kk: "Мұрын жолды буын", hint_ru: "Носовой слог", distractor_word: "ін" },
      ],
      2: [
        { id: "ng-2-1", text: "аң", phoneme: "ң", level: 2, hint_kk: "Дала аңы", hint_ru: "Зверь", distractor_word: "ан" },
        { id: "ng-2-2", text: "таң", phoneme: "ң", level: 2, hint_kk: "Арайлы таң", hint_ru: "Рассвет", distractor_word: "тан" },
        { id: "ng-2-3", text: "шаңғы", phoneme: "ң", level: 2, hint_kk: "Қысқы шаңғы", hint_ru: "Лыжи", distractor_word: "шангы" },
        { id: "ng-2-4", text: "қоңырау", phoneme: "ң", level: 2, hint_kk: "Мектеп қоңырауы", hint_ru: "Колокольчик", distractor_word: "конырау" },
      ],
      3: [
        { id: "ng-3-1", text: "Аң-аң-аң — атты таң", phoneme: "ң", level: 3, hint_kk: "Жаңылтпаш", hint_ru: "Чистоговорка" },
        { id: "ng-3-2", text: "Оң-оң-оң — жолың болсын оң", phoneme: "ң", level: 3, hint_kk: "Жаңылтпаш", hint_ru: "Чистоговорка" },
        { id: "ng-3-3", text: "Ең-ең-ең — даламыз кең", phoneme: "ң", level: 3, hint_kk: "Сөз тіркесі", hint_ru: "Чистоговорка" },
        { id: "ng-3-4", text: "Ің-ің-ің — сыңғыр қоңырау", phoneme: "ң", level: 3, hint_kk: "Сөз тіркесі", hint_ru: "Чистоговорка" },
      ],
    },
    minimal_pairs: [
      { id: "mp-ng-1", phoneme: "ң", distractor_phoneme: "н", target_word: "аң", distractor_word: "ан", meaning_kk: "аң (жануар)", meaning_ru: "зверь" },
      { id: "mp-ng-2", phoneme: "ң", distractor_phoneme: "н", target_word: "таң", distractor_word: "тан", meaning_kk: "таң (таңертең)", meaning_ru: "рассвет" },
      { id: "mp-ng-3", phoneme: "ң", distractor_phoneme: "н", target_word: "мың", distractor_word: "мын", meaning_kk: "мың (1000 саны)", meaning_ru: "тысяча" },
      { id: "mp-ng-4", phoneme: "ң", distractor_phoneme: "н", target_word: "оң", distractor_word: "он", meaning_kk: "оң (оң жақ)", meaning_ru: "правый" },
    ],
  },
  ө: {
    phoneme: "ө",
    distractor_phoneme: "о",
    title_kk: "Ө дыбысы (Ө ↔ О)",
    title_ru: "Звук Ө (Ө ↔ О)",
    levels: {
      1: [
        { id: "oe-1-1", text: "кө", phoneme: "ө", level: 1, hint_kk: "Ашық буын", hint_ru: "Открытый слог", distractor_word: "ко" },
        { id: "oe-1-2", text: "тө", phoneme: "ө", level: 1, hint_kk: "Ашық буын", hint_ru: "Открытый слог", distractor_word: "то" },
        { id: "oe-1-3", text: "өз", phoneme: "ө", level: 1, hint_kk: "Тұйық буын", hint_ru: "Закрытый слог", distractor_word: "оз" },
        { id: "oe-1-4", text: "өр", phoneme: "ө", level: 1, hint_kk: "Тұйық буын", hint_ru: "Закрытый слог", distractor_word: "ор" },
      ],
      2: [
        { id: "oe-2-1", text: "көл", phoneme: "ө", level: 2, hint_kk: "Мөлдір көл", hint_ru: "Озеро", distractor_word: "кол" },
        { id: "oe-2-2", text: "төл", phoneme: "ө", level: 2, hint_kk: "Малдың төлі", hint_ru: "Молодняк", distractor_word: "тол" },
        { id: "oe-2-3", text: "өзен", phoneme: "ө", level: 2, hint_kk: "Сырдария өзені", hint_ru: "Река", distractor_word: "озен" },
        { id: "oe-2-4", text: "бөрік", phoneme: "ө", level: 2, hint_kk: "Қазақы бөрік", hint_ru: "Шапка", distractor_word: "борик" },
      ],
      3: [
        { id: "oe-3-1", text: "Кө-кө-кө — мөлдір көл", phoneme: "ө", level: 3, hint_kk: "Жаңылтпаш", hint_ru: "Чистоговорка" },
        { id: "oe-3-2", text: "Тө-тө-тө — сүйкімді төл", phoneme: "ө", level: 3, hint_kk: "Жаңылтпаш", hint_ru: "Чистоговорка" },
        { id: "oe-3-3", text: "Өз-өз-өз — ағынды өзен", phoneme: "ө", level: 3, hint_kk: "Сөз тіркесі", hint_ru: "Чистоговорка" },
        { id: "oe-3-4", text: "Өр-өр-өр — биікке өрле", phoneme: "ө", level: 3, hint_kk: "Сөз тіркесі", hint_ru: "Чистоговорка" },
      ],
    },
    minimal_pairs: [
      { id: "mp-oe-1", phoneme: "ө", distractor_phoneme: "о", target_word: "көл", distractor_word: "кол", meaning_kk: "көл (су айдыны)", meaning_ru: "озеро" },
      { id: "mp-oe-2", phoneme: "ө", distractor_phoneme: "о", target_word: "төл", distractor_word: "тол", meaning_kk: "төл (қозы-лақ)", meaning_ru: "приплод" },
      { id: "mp-oe-3", phoneme: "ө", distractor_phoneme: "о", target_word: "өр", distractor_word: "ор", meaning_kk: "өр (биік жер)", meaning_ru: "возвышенность" },
    ],
  },
  ү: {
    phoneme: "ү",
    distractor_phoneme: "у",
    title_kk: "Ү дыбысы (Ү ↔ Ұ/У)",
    title_ru: "Звук Ү (Ү ↔ Ұ/У)",
    levels: {
      1: [
        { id: "ue-1-1", text: "кү", phoneme: "ү", level: 1, hint_kk: "Ашық буын", hint_ru: "Открытый слог", distractor_word: "ку" },
        { id: "ue-1-2", text: "тү", phoneme: "ү", level: 1, hint_kk: "Ашық буын", hint_ru: "Открытый слог", distractor_word: "ту" },
        { id: "ue-1-3", text: "үш", phoneme: "ү", level: 1, hint_kk: "Тұйық буын", hint_ru: "Закрытый слог", distractor_word: "уш" },
        { id: "ue-1-4", text: "үй", phoneme: "ү", level: 1, hint_kk: "Тұйық буын", hint_ru: "Закрытый слог", distractor_word: "уй" },
      ],
      2: [
        { id: "ue-2-1", text: "түн", phoneme: "ү", level: 2, hint_kk: "Жұлдызды түн", hint_ru: "Ночь", distractor_word: "тун" },
        { id: "ue-2-2", text: "күн", phoneme: "ү", level: 2, hint_kk: "Ашық күн", hint_ru: "Солнце / день", distractor_word: "кун" },
        { id: "ue-2-3", text: "үйрек", phoneme: "ү", level: 2, hint_kk: "Судағы үйрек", hint_ru: "Утка", distractor_word: "уйрек" },
        { id: "ue-2-4", text: "гүл", phoneme: "ү", level: 2, hint_kk: "Әдемі гүл", hint_ru: "Цветок", distractor_word: "гул" },
      ],
      3: [
        { id: "ue-3-1", text: "Тү-тү-тү — тыныш түн", phoneme: "ү", level: 3, hint_kk: "Жаңылтпаш", hint_ru: "Чистоговорка" },
        { id: "ue-3-2", text: "Кү-кү-кү — шуақты күн", phoneme: "ү", level: 3, hint_kk: "Жаңылтпаш", hint_ru: "Чистоговорка" },
        { id: "ue-3-3", text: "Үй-үй-үй — жүзген үйрек", phoneme: "ү", level: 3, hint_kk: "Сөз тіркесі", hint_ru: "Чистоговорка" },
        { id: "ue-3-4", text: "Гү-гү-гү — әдемі гүл", phoneme: "ү", level: 3, hint_kk: "Сөз тіркесі", hint_ru: "Чистоговорка" },
      ],
    },
    minimal_pairs: [
      { id: "mp-ue-1", phoneme: "ү", distractor_phoneme: "у", target_word: "түн", distractor_word: "тун", meaning_kk: "түн (қараңғы мезгіл)", meaning_ru: "ночь" },
      { id: "mp-ue-2", phoneme: "ү", distractor_phoneme: "у", target_word: "күн", distractor_word: "кун", meaning_kk: "күн (жарық күн)", meaning_ru: "солнце" },
      { id: "mp-ue-3", phoneme: "ү", distractor_phoneme: "у", target_word: "үш", distractor_word: "уш", meaning_kk: "үш (3 саны)", meaning_ru: "три" },
    ],
  },
  р: {
    phoneme: "р",
    distractor_phoneme: "л",
    title_kk: "Р дыбысы (Р ↔ Л)",
    title_ru: "Звук Р (Р ↔ Л)",
    levels: {
      1: [
        { id: "r-1-1", text: "ра", phoneme: "р", level: 1, hint_kk: "Ашық буын", hint_ru: "Открытый слог", distractor_word: "ла" },
        { id: "r-1-2", text: "ро", phoneme: "р", level: 1, hint_kk: "Ашық буын", hint_ru: "Открытый слог", distractor_word: "ло" },
        { id: "r-1-3", text: "ар", phoneme: "р", level: 1, hint_kk: "Тұйық буын", hint_ru: "Закрытый слог", distractor_word: "ал" },
        { id: "r-1-4", text: "ыр", phoneme: "р", level: 1, hint_kk: "Тұйық буын", hint_ru: "Закрытый слог", distractor_word: "ыл" },
      ],
      2: [
        { id: "r-2-1", text: "ара", phoneme: "р", level: 2, hint_kk: "Бал арасы", hint_ru: "Пчела", distractor_word: "ала" },
        { id: "r-2-2", text: "арба", phoneme: "р", level: 2, hint_kk: "Ағаш арба", hint_ru: "Телега", distractor_word: "алба" },
        { id: "r-2-3", text: "қарбыз", phoneme: "р", level: 2, hint_kk: "Тәтті қарбыз", hint_ru: "Арбуз", distractor_word: "калбыз" },
        { id: "r-2-4", text: "торғай", phoneme: "р", level: 2, hint_kk: "Кішкентай торғай", hint_ru: "Воробей", distractor_word: "толгай" },
      ],
      3: [
        { id: "r-3-1", text: "Ра-ра-ра — биік мұнара", phoneme: "р", level: 3, hint_kk: "Жаңылтпаш", hint_ru: "Чистоговорка" },
        { id: "r-3-2", text: "Ар-ар-ар — тәтті қарбыз бар", phoneme: "р", level: 3, hint_kk: "Жаңылтпаш", hint_ru: "Чистоговорка" },
        { id: "r-3-3", text: "Ро-ро-ро — жүйрік торғай", phoneme: "р", level: 3, hint_kk: "Сөз тіркесі", hint_ru: "Чистоговорка" },
        { id: "r-3-4", text: "Ыр-ыр-ыр — бал жинаған ара", phoneme: "р", level: 3, hint_kk: "Сөз тіркесі", hint_ru: "Чистоговорка" },
      ],
    },
    minimal_pairs: [
      { id: "mp-r-1", phoneme: "р", distractor_phoneme: "л", target_word: "ара", distractor_word: "ала", meaning_kk: "ара (бал арасы)", meaning_ru: "пчела" },
      { id: "mp-r-2", phoneme: "р", distractor_phoneme: "л", target_word: "қар", distractor_word: "қал", meaning_kk: "қар (аппақ қар)", meaning_ru: "снег" },
      { id: "mp-r-3", phoneme: "р", distractor_phoneme: "л", target_word: "бар", distractor_word: "бал", meaning_kk: "бар (бару / бар болу)", meaning_ru: "есть / иди" },
      { id: "mp-r-4", phoneme: "р", distractor_phoneme: "л", target_word: "тар", distractor_word: "тал", meaning_kk: "тар (тар жол)", meaning_ru: "узкий" },
    ],
  },
};

export const ALL_EXPANDED_MINIMAL_PAIRS: MinimalPairItem[] = Object.values(
  PHONEME_CURRICULUM
).flatMap((c) => c.minimal_pairs);
