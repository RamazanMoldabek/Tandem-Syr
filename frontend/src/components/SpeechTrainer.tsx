import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Mic,
  RotateCcw,
  Square,
  Star,
  Target,
} from "lucide-react";
import {
  adaptLesson,
  evaluatePronunciation,
  getLessons,
  getProgressWeakPhonemes,
  recordSpeechProgress,
} from "../api/client";
import {
  PHONEME_CURRICULUM,
  calculateStars,
  type DifficultyLevel,
  type LevelExerciseItem,
  type MinimalPairItem,
} from "../data/phonemeLessons";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { UI_TEXT } from "../i18n/translations";
import type {
  EvaluateResponse,
  Lang,
  LessonRecord,
  TargetPhoneme,
  WeakPhonemeRecommendation,
} from "../types/api";
import { ArticulationDiagram } from "./ArticulationDiagram";

interface SpeechTrainerProps {
  lang: Lang;
  studentName: string;
  freeUnlock?: boolean;
  initialPhoneme?: TargetPhoneme;
  initialMinimalPairsMode?: boolean;
}

const ALL_PHONEMES: TargetPhoneme[] = ["қ", "ғ", "ң", "ө", "ү", "р"];

// Детские иллюстрации-эмодзи к каждому слову, слогу и чистоговорке для оживления карточки
const WORD_ILLUSTRATIONS: Record<string, string> = {
  қар: "❄️",
  қол: "✋",
  құс: "🐦",
  қасық: "🥄",
  қал: "🏠",
  қас: "👁️",
  ақ: "☁️",
  ағаш: "🌳",
  тауық: "🐓",
  баға: "🏅",
  сағат: "⌚",
  аға: "👦",
  аң: "🦌",
  таң: "🌅",
  шаңғы: "🎿",
  қоңырау: "🔔",
  мың: "✨",
  оң: "🧭",
  көл: "🌊",
  төл: "🐑",
  өзен: "🏞️",
  бөрік: "🧢",
  өр: "⛰️",
  түн: "🌙",
  күн: "☀️",
  үйрек: "🦆",
  гүл: "🌸",
  үш: "3️⃣",
  ара: "🐝",
  арба: "🛒",
  қарбыз: "🍉",
  торғай: "🐤",
  бар: "✅",
  тар: "🛤️",
};

function getIllustrationForWord(word: string, level: DifficultyLevel, isMinimalPair: boolean): string {
  const clean = word.trim().toLowerCase();
  if (WORD_ILLUSTRATIONS[clean]) return WORD_ILLUSTRATIONS[clean];
  if (isMinimalPair) return "🎯";
  if (level === 1) return "🔤";
  if (level === 3) return "🎵";
  return "✨";
}

export function SpeechTrainer({
  lang,
  studentName,
  freeUnlock = true,
  initialPhoneme = "қ",
  initialMinimalPairsMode = false,
}: SpeechTrainerProps) {
  const [selectedPhoneme, setSelectedPhoneme] = useState<TargetPhoneme>(initialPhoneme);
  const [level, setLevel] = useState<DifficultyLevel>(2);
  const [minimalPairsMode, setMinimalPairsMode] = useState<boolean>(initialMinimalPairsMode);
  const [showSavedLessons, setShowSavedLessons] = useState<boolean>(false);

  const currentLevelItems = PHONEME_CURRICULUM[selectedPhoneme].levels[level];
  const [selectedItem, setSelectedItem] = useState<LevelExerciseItem>(currentLevelItems[0]);

  const [weakRecs, setWeakRecs] = useState<WeakPhonemeRecommendation[]>([]);
  const [loadingWeak, setLoadingWeak] = useState(false);
  const activePairs: MinimalPairItem[] = PHONEME_CURRICULUM[selectedPhoneme].minimal_pairs;
  const [selectedPair, setSelectedPair] = useState<MinimalPairItem>(activePairs[0]);
  const [pairStep, setPairStep] = useState<"target" | "distractor">("target");

  const starsStorageKey = `tandem_syr_stars_${studentName}`;
  const [starsMap, setStarsMap] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(starsStorageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(starsStorageKey);
      setStarsMap(raw ? JSON.parse(raw) : {});
    } catch {
      setStarsMap({});
    }
  }, [starsStorageKey]);

  const saveStarForItem = useCallback(
    (itemId: string, earned: number) => {
      setStarsMap((prev) => {
        const nextVal = Math.max(prev[itemId] || 0, earned);
        const updated = { ...prev, [itemId]: nextVal };
        try {
          localStorage.setItem(starsStorageKey, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    },
    [starsStorageKey]
  );

  useEffect(() => {
    setSelectedPhoneme(initialPhoneme);
    setMinimalPairsMode(initialMinimalPairsMode);
  }, [initialPhoneme, initialMinimalPairsMode]);

  useEffect(() => {
    const items = PHONEME_CURRICULUM[selectedPhoneme].levels[level];
    setSelectedItem(items[0]);
    const pairs = PHONEME_CURRICULUM[selectedPhoneme].minimal_pairs;
    setSelectedPair(pairs[0]);
    setPairStep("target");
    setResult(null);
    setApiError(null);
  }, [selectedPhoneme, level]);

  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const [earnedStars, setEarnedStars] = useState<0 | 1 | 2 | 3>(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [autoSavedNotice, setAutoSavedNotice] = useState(false);

  const loadLessons = useCallback(async () => {
    setLoadingLessons(true);
    try {
      const data = await getLessons();
      setLessons(data.lessons);
    } catch {
      // ignore offline
    } finally {
      setLoadingLessons(false);
    }
  }, []);

  const loadWeakRecommendations = useCallback(async () => {
    setLoadingWeak(true);
    try {
      const res = await getProgressWeakPhonemes(studentName);
      setWeakRecs(res.weak_phonemes);
      if (res.weak_phonemes.length > 0 && minimalPairsMode) {
        const topWeak = res.weak_phonemes[0].phoneme;
        if (ALL_PHONEMES.includes(topWeak)) {
          setSelectedPhoneme(topWeak);
        }
      }
    } catch {
      // ignore offline
    } finally {
      setLoadingWeak(false);
    }
  }, [studentName, minimalPairsMode]);

  useEffect(() => {
    loadLessons();
  }, [loadLessons]);

  const handleToggleMinimalPairsMode = () => {
    const next = !minimalPairsMode;
    setMinimalPairsMode(next);
    setResult(null);
    setApiError(null);
    if (next) {
      loadWeakRecommendations();
    }
  };

  const getLevelStars = (ph: TargetPhoneme, lvl: DifficultyLevel): number => {
    const items = PHONEME_CURRICULUM[ph].levels[lvl];
    return items.reduce((acc, it) => acc + Math.min(3, starsMap[it.id] || 0), 0);
  };

  const level1Stars = getLevelStars(selectedPhoneme, 1);
  const level2Stars = getLevelStars(selectedPhoneme, 2);
  const level3Stars = getLevelStars(selectedPhoneme, 3);

  const isLevelUnlocked = (lvl: DifficultyLevel): boolean => {
    if (freeUnlock || lvl === 1) return true;
    if (lvl === 2) return level1Stars >= 6;
    return level2Stars >= 6;
  };

  const activeWord = minimalPairsMode
    ? pairStep === "target"
      ? selectedPair.target_word
      : selectedPair.distractor_word
    : selectedItem.text;

  const activeDistractorWord = minimalPairsMode
    ? pairStep === "target"
      ? selectedPair.distractor_word
      : selectedPair.target_word
    : selectedItem.distractor_word;

  const currentItemIndex = currentLevelItems.findIndex((it) => it.id === selectedItem.id);
  const currentItemStars = minimalPairsMode
    ? starsMap[selectedPair.id] || 0
    : starsMap[selectedItem.id] || 0;

  const handleStepWord = (dir: -1 | 1) => {
    if (minimalPairsMode) {
      const idx = activePairs.findIndex((p) => p.id === selectedPair.id);
      const nextIdx = (idx + dir + activePairs.length) % activePairs.length;
      setSelectedPair(activePairs[nextIdx]);
      setPairStep("target");
    } else {
      const nextIdx = (currentItemIndex + dir + currentLevelItems.length) % currentLevelItems.length;
      setSelectedItem(currentLevelItems[nextIdx]);
    }
    setResult(null);
    setApiError(null);
  };

  const handleRecorded = useCallback(
    async (blob: Blob) => {
      setEvaluating(true);
      setApiError(null);
      setAutoSavedNotice(false);
      try {
        const evalRes = await evaluatePronunciation(blob, activeWord, {
          phoneme: selectedPhoneme,
          distractorWord: activeDistractorWord,
          level: minimalPairsMode ? 2 : level,
          studentName,
        });
        setResult(evalRes);

        const normScore =
          typeof evalRes.score === "number"
            ? evalRes.score
            : evalRes.passed
              ? Math.max(0.7, evalRes.target_score)
              : Math.min(0.55, evalRes.target_score * 0.7);
        const stars = evalRes.stars ?? calculateStars(normScore);
        setEarnedStars(stars);

        if (!minimalPairsMode) {
          saveStarForItem(selectedItem.id, stars);
        } else {
          saveStarForItem(selectedPair.id, stars);
        }

        recordSpeechProgress({
          student_name: studentName,
          target_word: activeWord,
          phoneme: selectedPhoneme,
          level: minimalPairsMode ? 2 : level,
          score: normScore,
          passed: evalRes.passed,
        }).catch(() => {});

        if (evalRes.passed) {
          try {
            await adaptLesson({
              grade: 2,
              subject: "Логопедия",
              title: `${studentName}: ${activeWord} (${selectedPhoneme}, ${level}-деңгей)`,
              raw_text: `${activeWord} — «${selectedPhoneme}» дыбысын ${level}-деңгейде (${stars} жұлдыз) сәтті орындады.`,
            });
            setAutoSavedNotice(true);
            loadLessons();
          } catch {
            // Non-blocking
          }
        }
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Evaluation failed");
      } finally {
        setEvaluating(false);
      }
    },
    [
      activeDistractorWord,
      activeWord,
      level,
      loadLessons,
      minimalPairsMode,
      saveStarForItem,
      selectedItem.id,
      selectedPair.id,
      selectedPhoneme,
      studentName,
    ]
  );

  const { isRecording, waveform, error: micError, startRecording, stopRecording } =
    useAudioRecorder({
      onRecorded: handleRecorded,
    });

  const distractorPhoneme = PHONEME_CURRICULUM[selectedPhoneme].distractor_phoneme;
  const wordEmoji = getIllustrationForWord(activeWord, level, minimalPairsMode);

  return (
    <div className="space-y-6">
      {/* 1. COMPACT TOP STEPPER BAR (Phoneme + Level + Word Carousel in one compact card) */}
      <section className="surface-card px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Soft Pastel Phoneme Pills (No solid blue circles!) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-extrabold uppercase tracking-wider text-slate-400">
              {lang === "kk" ? "Дыбыс:" : "Звук:"}
            </span>
            {ALL_PHONEMES.map((ph) => {
              const cur = PHONEME_CURRICULUM[ph];
              const active = ph === selectedPhoneme;
              const totalPhStars =
                getLevelStars(ph, 1) + getLevelStars(ph, 2) + getLevelStars(ph, 3);
              return (
                <button
                  key={ph}
                  type="button"
                  onClick={() => setSelectedPhoneme(ph)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold transition-all ${
                    active
                      ? "bg-blue-50/90 text-blue-800 ring-2 ring-blue-500/40"
                      : "bg-slate-100/80 text-slate-600 hover:bg-blue-50/40 hover:text-blue-700"
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${
                      active
                        ? "bg-blue-100 text-blue-700"
                        : "bg-white text-slate-700"
                    }`}
                  >
                    {ph.toUpperCase()}
                  </span>
                  <span>
                    {ph.toUpperCase()}↔{cur.distractor_phoneme.toUpperCase()}
                  </span>
                  <span className="text-[11px] font-bold text-amber-500">
                    ★{totalPhStars}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: Compact Level Pills + Minimal Pairs Toggle */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex rounded-xl bg-slate-100/90 p-1">
              {(
                [
                  { lvl: 1 as DifficultyLevel, kk: "1. Буын", ru: "1. Слог", stars: level1Stars },
                  { lvl: 2 as DifficultyLevel, kk: "2. Сөз", ru: "2. Слово", stars: level2Stars },
                  { lvl: 3 as DifficultyLevel, kk: "3. Жаңылтпаш", ru: "3. Фраза", stars: level3Stars },
                ] as const
              ).map((tab) => {
                const unlocked = isLevelUnlocked(tab.lvl);
                const active = !minimalPairsMode && level === tab.lvl;
                return (
                  <button
                    key={tab.lvl}
                    type="button"
                    disabled={!unlocked}
                    onClick={() => {
                      setMinimalPairsMode(false);
                      setLevel(tab.lvl);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all ${
                      active
                        ? "bg-white text-blue-700 shadow-sm"
                        : unlocked
                          ? "text-slate-600 hover:text-slate-900"
                          : "cursor-not-allowed text-slate-400 opacity-60"
                    }`}
                  >
                    {!unlocked && <Lock className="h-3 w-3" />}
                    <span>{lang === "kk" ? tab.kk : tab.ru}</span>
                    <span className="text-[11px] text-amber-500">★{tab.stars}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleToggleMinimalPairsMode}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition-all ${
                minimalPairsMode
                  ? "bg-amber-100/90 text-amber-900 ring-2 ring-amber-500/40"
                  : "bg-slate-100/80 text-slate-600 hover:bg-amber-50 hover:text-amber-800"
              }`}
            >
              <Target className="h-3.5 w-3.5 text-amber-600" />
              {lang === "kk" ? "Жұптар" : "Пары"}
            </button>
          </div>
        </div>

        {/* Sub-row: Compact Word / Pair Selector Pills (No giant cards!) */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          {!minimalPairsMode ? (
            <div className="flex flex-wrap items-center gap-2">
              {currentLevelItems.map((item) => {
                const active = item.id === selectedItem.id;
                const itemStars = starsMap[item.id] || 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedItem(item);
                      setResult(null);
                      setApiError(null);
                    }}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition-all ${
                      active
                        ? "bg-blue-50/80 text-blue-800 ring-2 ring-blue-500/40"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span>{item.text}</span>
                    <span className="flex items-center gap-0.5">
                      {[1, 2, 3].map((s) => (
                        <Star
                          key={s}
                          className={`h-3 w-3 ${
                            s <= itemStars
                              ? "fill-amber-400 text-amber-400"
                              : "text-slate-300"
                          }`}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {activePairs.map((pair) => {
                const active = pair.id === selectedPair.id;
                return (
                  <button
                    key={pair.id}
                    type="button"
                    onClick={() => {
                      setSelectedPair(pair);
                      setPairStep("target");
                      setResult(null);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition-all ${
                      active
                        ? "bg-amber-50 text-amber-900 ring-2 ring-amber-500/40"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span>
                      {pair.target_word} ↔ {pair.distractor_word}
                    </span>
                  </button>
                );
              })}
              {loadingWeak && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />}
              {weakRecs.length > 0 && (
                <span className="text-[11px] font-semibold text-slate-400">
                  ({lang === "kk" ? "Ұсыныс:" : "Рекомендовано:"}{" "}
                  {weakRecs.map((w) => w.phoneme.toUpperCase()).join(", ")})
                </span>
              )}
            </div>
          )}

          {/* Quick Prev / Next Word Stepper */}
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleStepWord(-1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
              title={lang === "kk" ? "Алдыңғы сөз" : "Предыдущее слово"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-1.5 text-xs font-bold text-slate-400">
              {minimalPairsMode
                ? `${activePairs.findIndex((p) => p.id === selectedPair.id) + 1}/${activePairs.length}`
                : `${currentItemIndex + 1}/${currentLevelItems.length}`}
            </span>
            <button
              type="button"
              onClick={() => handleStepWord(1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
              title={lang === "kk" ? "Келесі сөз" : "Следующее слово"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* 2. UNIFIED WORKSPACE (Fits on 1 Screen: Left = Articulation, Right = Student Practice Card) */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column (7 cols): Articulation & Audio Reference */}
        <div className="lg:col-span-7">
          <ArticulationDiagram
            phoneme={selectedPhoneme}
            targetWord={activeWord}
            distractorPhoneme={distractorPhoneme}
            lang={lang}
            highlightCorrection={result !== null && !result.passed}
          />
        </div>

        {/* Right Column (5 cols): Child's Practice Card + Single Primary Microphone CTA */}
        <div className="surface-card flex flex-col justify-between p-6 lg:col-span-5">
          <div>
            {/* Card Top Meta + Earned Stars */}
            <div className="mb-4 flex items-center justify-between">
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-600">
                {minimalPairsMode
                  ? lang === "kk"
                    ? "Минималды жұп"
                    : "Минимальная пара"
                  : lang === "kk"
                    ? `${level}-деңгей жаттығуы`
                    : `Упражнение ${level}-го уровня`}
              </span>

              <div className="flex items-center gap-1">
                {[1, 2, 3].map((s) => (
                  <Star
                    key={s}
                    className={`h-4 w-4 ${
                      s <= currentItemStars
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-200"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Minimal Pair Step Pill (if in Minimal Pairs mode) */}
            {minimalPairsMode && (
              <div className="mb-3 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPairStep("target");
                    setResult(null);
                  }}
                  className={`rounded-lg px-3 py-1 text-xs font-extrabold transition ${
                    pairStep === "target"
                      ? "bg-blue-50 text-blue-800 ring-2 ring-blue-500/40"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  1. «{selectedPair.target_word}»
                </button>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                <button
                  type="button"
                  onClick={() => {
                    setPairStep("distractor");
                    setResult(null);
                  }}
                  className={`rounded-lg px-3 py-1 text-xs font-extrabold transition ${
                    pairStep === "distractor"
                      ? "bg-amber-50 text-amber-900 ring-2 ring-amber-500/40"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  2. «{selectedPair.distractor_word}»
                </button>
              </div>
            )}

            {/* Main Word Display with Child-Friendly Illustration */}
            <div className="mb-5 flex flex-col items-center rounded-2xl bg-[#F8FAFC] px-4 py-7 text-center">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-4xl shadow-sm">
                {wordEmoji}
              </div>

              <div
                className={`font-black tracking-wide text-slate-900 ${
                  activeWord.length > 12 ? "text-2xl leading-snug" : "text-4xl"
                }`}
              >
                {activeWord}
              </div>

              <p className="mt-1.5 text-sm font-bold text-slate-500">
                {minimalPairsMode
                  ? lang === "kk"
                    ? selectedPair.meaning_kk
                    : selectedPair.meaning_ru
                  : lang === "kk"
                    ? selectedItem.hint_kk
                    : selectedItem.hint_ru}
              </p>

              <span className="mt-3 inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700">
                [{selectedPhoneme}] ≠ [{distractorPhoneme}]
              </span>
            </div>
          </div>

          {/* Bottom: Waveform + Main Primary Microphone CTA */}
          <div>
            <p className="mb-3 text-center text-xs font-semibold text-slate-400">
              {UI_TEXT.trainer.recordPrompt[lang]}
            </p>

            {/* Clean Waveform Bars */}
            <div className="mb-4 flex h-12 items-end justify-center gap-1 rounded-2xl bg-slate-50 px-4 py-2">
              {waveform.map((v, idx) => (
                <div
                  key={idx}
                  className={`w-1.5 rounded-full transition-all duration-75 ${
                    isRecording ? "bg-blue-600" : "bg-slate-200"
                  }`}
                  style={{ height: `${Math.round(v * 100)}%` }}
                />
              ))}
            </div>

            {!isRecording ? (
              <button
                type="button"
                disabled={evaluating}
                onClick={startRecording}
                className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#2563EB] px-6 py-4 text-base font-extrabold text-white shadow-[0_8px_20px_rgba(37,99,235,0.25)] transition hover:bg-blue-700 disabled:opacity-60"
              >
                {evaluating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {UI_TEXT.trainer.analyzing[lang]}
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5" />
                    {UI_TEXT.trainer.startRecord[lang]}
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-rose-600 px-6 py-4 text-base font-extrabold text-white shadow-[0_8px_20px_rgba(225,29,72,0.25)] transition hover:bg-rose-700"
              >
                <Square className="h-4 w-4 fill-current" />
                {UI_TEXT.trainer.stopRecord[lang]}
              </button>
            )}

            {(micError || apiError) && (
              <p className="mt-2 text-center text-xs font-semibold text-rose-600">
                {micError || apiError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 3. Evaluation Feedback Banner (Soft surface with ring) */}
      {result && (
        <section
          className={`surface-card p-6 ${
            result.passed
              ? "bg-emerald-50/70 ring-2 ring-emerald-500/30"
              : "bg-amber-50/70 ring-2 ring-amber-500/30"
          }`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              {result.passed ? (
                <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-8 w-8 shrink-0 text-amber-500" />
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-lg font-black text-slate-900">
                    {result.passed
                      ? UI_TEXT.trainer.successTitle[lang]
                      : UI_TEXT.trainer.retryTitle[lang]}
                  </h3>
                  <div className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-0.5 shadow-sm">
                    {[1, 2, 3].map((s) => (
                      <Star
                        key={s}
                        className={`h-4 w-4 ${
                          s <= earnedStars
                            ? "fill-amber-400 text-amber-400"
                            : "text-slate-200"
                        }`}
                      />
                    ))}
                    <span className="ml-1 text-xs font-black text-slate-700">
                      {earnedStars}/3
                    </span>
                  </div>
                </div>

                {!result.passed && (
                  <p className="mt-1 text-sm font-semibold text-amber-900">
                    {lang === "kk"
                      ? `Қазір «${result.phoneme}» орнына «${result.distractor_phoneme}» дыбысына жақын шықты. Сол жақтағы артикуляция сызбасына қараңыз.`
                      : `Сейчас прозвучало ближе к [${result.distractor_phoneme}] вместо [${result.phoneme}]. Обрати внимание на схему артикуляции слева.`}
                  </p>
                )}

                {autoSavedNotice && (
                  <p className="mt-1 text-xs font-bold text-emerald-700">
                    ✓ {UI_TEXT.trainer.autoSaved[lang]}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {minimalPairsMode && pairStep === "target" && (
                <button
                  type="button"
                  onClick={() => {
                    setPairStep("distractor");
                    setResult(null);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-blue-700"
                >
                  {lang === "kk"
                    ? `Енді «${selectedPair.distractor_word}»`
                    : `Теперь «${selectedPair.distractor_word}»`}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setResult(null)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {UI_TEXT.trainer.retryButton[lang]}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 4. Collapsible Saved Lessons Accordion (keeps main workspace clean!) */}
      <section className="surface-card px-6 py-4">
        <button
          type="button"
          onClick={() => setShowSavedLessons((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="flex items-center gap-2 text-sm font-extrabold text-slate-700">
            <BookOpen className="h-4 w-4 text-teal-600" />
            {UI_TEXT.trainer.lessonsHeading[lang]} ({lessons.length})
          </span>
          <div className="flex items-center gap-2">
            {loadingLessons && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform ${
                showSavedLessons ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>

        {showSavedLessons && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            {lessons.length === 0 ? (
              <p className="text-sm text-slate-400">{UI_TEXT.trainer.noLessons[lang]}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {lessons.slice(0, 4).map((lesson) => (
                  <div
                    key={lesson.id}
                    className="rounded-xl bg-[#F8FAFC] p-4"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-800">{lesson.title}</span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                        {lesson.subject}
                      </span>
                    </div>
                    {lesson.adapted.cards[0] && (
                      <p className="text-sm font-medium leading-relaxed text-slate-600">
                        {lesson.adapted.cards[0].dyslexia_markup.syllable_text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
