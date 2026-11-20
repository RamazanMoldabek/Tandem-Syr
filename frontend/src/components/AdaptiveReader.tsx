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
  Sparkles,
  Volume2,
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
} from "../types/api";

interface AdaptiveReaderProps {
  lang: Lang;
  studentName: string;
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

const PROFILE_MODES: { id: ReaderProfileMode; label_kk: string; label_ru: string }[] = [
  { id: "adhd", label_kk: "СДВГ (Зейін тапшылығы)", label_ru: "СДВГ" },
  { id: "dyslexia", label_kk: "Дислексия", label_ru: "Дислексия" },
  { id: "zpr", label_kk: "ПДТ (ЗПР)", label_ru: "ЗПР" },
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

function renderHighlightedText(
  card: AdaptiveCard,
  showSyllables: boolean,
  highlightPhonemes: boolean
) {
  const displayStr = showSyllables ? card.syllable_text : card.text;
  if (!highlightPhonemes) {
    return <span>{displayStr}</span>;
  }

  return (
    <>
      {Array.from(displayStr).map((ch, idx) => {
        if (TARGET_SPECIAL_CHARS.has(ch)) {
          return (
            <span
              key={idx}
              className="mx-0.5 inline-block rounded-md bg-amber-300/90 px-1 font-black text-slate-950 underline decoration-sky-700 decoration-2"
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

export function AdaptiveReader({ lang, studentName }: AdaptiveReaderProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESET_TOPICS[0].id);
  const [customText, setCustomText] = useState<string>(PRESET_TOPICS[0].text);
  const [topicTitle, setTopicTitle] = useState<string>(PRESET_TOPICS[0].title_kk);
  const [profileMode, setProfileMode] = useState<ReaderProfileMode>("adhd");

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
        setAdapted(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Adaptation failed");
      } finally {
        setLoading(false);
      }
    },
    [profileMode]
  );

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
            {/* Child Profile Selector (СДВГ / Дислексия / ЗПР) */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
              {PROFILE_MODES.map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setProfileMode(pm.id)}
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

            {adapted && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  adapted.source === "kazllm"
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-amber-100 text-amber-900"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {adapted.source === "kazllm"
                  ? `KazLLM-8B (${adapted.model})${adapted.cached ? " • Кэш" : ""}`
                  : lang === "kk"
                    ? "Локалды фолбэк (KazLLM офлайн)"
                    : "Локальный фолбэк (KazLLM офлайн)"}
              </span>
            )}
          </div>
        </div>

        {/* Preset Topic Pills */}
        <div className="mb-4 grid gap-2.5 sm:grid-cols-3">
          {PRESET_TOPICS.map((t) => {
            const active = selectedPresetId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectPreset(t)}
                className={`flex items-center gap-3 rounded-2xl p-3.5 text-left transition ${
                  active
                    ? "bg-blue-50/70 ring-2 ring-blue-500/40"
                    : "bg-[#F8FAFC] hover:bg-slate-100/80"
                }`}
              >
                <span className="text-2xl">{t.icon}</span>
                <div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {lang === "kk" ? t.title_kk : t.title_ru}
                  </div>
                  <div className="text-xs text-slate-500">
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

        {/* Custom Kazakh Text Textarea + Photo / PDF / Adapt Buttons */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={ocrLoading || loading}
                onClick={() => photoInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3.5 py-2 text-xs font-extrabold text-blue-800 transition hover:bg-blue-100 disabled:opacity-50"
              >
                <Camera className="h-4 w-4 text-blue-700" />
                {lang === "kk" ? "📷 Суретке түсіру / Кітап фотосы" : "📷 Фото учебника"}
              </button>

              <button
                type="button"
                disabled={ocrLoading || loading}
                onClick={() => pdfInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-3.5 py-2 text-xs font-extrabold text-indigo-800 transition hover:bg-indigo-100 disabled:opacity-50"
              >
                <FileText className="h-4 w-4 text-indigo-700" />
                {lang === "kk" ? "📄 PDF жүктеу" : "📄 Загрузить PDF"}
              </button>

              {/* Переключатель страниц, если загружен многостраничный PDF */}
              {lastPdfFile && pdfTotalPages > 1 && (
                <div className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-700">
                  <span>{lang === "kk" ? "Бет:" : "Стр:"}</span>
                  <button
                    type="button"
                    disabled={ocrLoading || pdfPage <= 1}
                    onClick={() => extractPageFromFile(lastPdfFile, pdfPage - 1)}
                    className="rounded-md bg-white px-1.5 py-0.5 shadow-sm disabled:opacity-40"
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
                    className="rounded-md bg-white px-1.5 py-0.5 shadow-sm disabled:opacity-40"
                  >
                    ▶
                  </button>
                </div>
              )}

              {ocrLoading && (
                <span className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-900">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                  {lang === "kk" ? "Мәтін оқылуда..." : "Извлекаем текст..."}
                </span>
              )}
            </div>

            {/* Предупреждение о лимитах PDF и фото */}
            <span className="text-[11px] font-semibold text-slate-400">
              {lang === "kk"
                ? "ℹ️ Шектеу: 10 МБ дейін • PDF-тен бір ретте 1 бет (1500 таңбаға дейін)"
                : "ℹ️ Лимит: файл до 10 МБ • из PDF за раз 1 страница (до 1500 символов)"}
            </span>
          </div>

          {ocrNotice && (
            <div className="rounded-xl bg-emerald-50/90 px-3.5 py-2 text-xs font-bold text-emerald-900">
              ✓ {ocrNotice}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea
              rows={2}
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
              className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              disabled={loading || ocrLoading || !customText.trim()}
              onClick={() => runAdaptation(customText, topicTitle, profileMode)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
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

      {/* Accessibility Toolbar */}
      <section className="surface-card flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSyllables((v) => !v)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-extrabold transition ${
              showSyllables
                ? "border-sky-600 bg-sky-600 text-white"
                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {lang === "kk" ? "Буынға бөлу (Ау-мақ)" : "По слогам (Ау-мақ)"}
          </button>

          <button
            type="button"
            onClick={() => setHighlightPhonemes((v) => !v)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-extrabold transition ${
              highlightPhonemes
                ? "border-amber-500 bg-amber-400 text-slate-950"
                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {lang === "kk"
              ? "Дыбыстарды белгілеу (қ, ғ, ң, ө, ү, р)"
              : "Подсветка (қ, ғ, ң, ө, ү, р)"}
          </button>

          <button
            type="button"
            onClick={() => setCreamBg((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition ${
              creamBg
                ? "border-amber-400 bg-[#fdf8ec] text-amber-950"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            {lang === "kk" ? "Көзге жайлы фон" : "Мягкий кремовый фон"}
          </button>
        </div>

        {/* TTS Voice & Speed Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setVoice("aigul")}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              voice === "aigul"
                ? "bg-sky-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {lang === "kk" ? "Айгүл" : "Айгуль"}
          </button>
          <button
            type="button"
            onClick={() => setVoice("daulet")}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              voice === "daulet"
                ? "bg-sky-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {lang === "kk" ? "Дәулет" : "Даулет"}
          </button>
          <button
            type="button"
            onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold ${
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

      {/* Single Step-by-Step Card or Final Quiz */}
      {loading || ocrLoading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white p-8">
          <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
          <p className="text-base font-bold text-slate-700">
            {ocrLoading
              ? lang === "kk"
                ? "Мәтін оқылуда..."
                : "Распознаём текст с фото..."
              : lang === "kk"
                ? "Мәтін балаға түсінікті карточкаларға бөлініп жатыр..."
                : "Адаптируем текст в короткие карточки..."}
          </p>
        </div>
      ) : (
        cards.length > 0 && (
          <section
            className={`rounded-3xl border-2 p-6 shadow-sm transition-colors sm:p-8 ${
              creamBg
                ? "border-amber-200 bg-[#fdf8ec] text-slate-900"
                : "border-slate-200 bg-white text-slate-900"
            }`}
          >
            {/* Top Progress Bar */}
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-600">
                <span>
                  {isQuizStep
                    ? lang === "kk"
                      ? "Қорытынды сұрақтар"
                      : "Проверочный мини-квиз"
                    : lang === "kk"
                      ? `Карточка ${stepIndex + 1} / ${cards.length}`
                      : `Карточка ${stepIndex + 1} из ${cards.length}`}
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200/80">
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
                    <p className="text-2xl font-extrabold leading-relaxed tracking-wide sm:text-3xl">
                      {renderHighlightedText(currentCard, showSyllables, highlightPhonemes)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSpeakCard(currentCard.text)}
                    className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700"
                  >
                    <Volume2 className="h-5 w-5" />
                    {lang === "kk" ? "Тыңдау" : "Озвучить"}
                  </button>
                </div>

                {/* Explained Keywords */}
                {currentCard.keywords.length > 0 && (
                  <div className="rounded-2xl border border-amber-200/80 bg-white/80 p-4">
                    <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-amber-900">
                      {lang === "kk" ? "Сөздік сандықша (Түсіндірме):" : "Понятный словарик:"}
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
