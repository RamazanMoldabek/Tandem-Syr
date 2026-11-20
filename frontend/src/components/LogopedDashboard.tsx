import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Cpu,
  Loader2,
  Mic,
  RefreshCw,
  Square,
  Target,
  Volume2,
} from "lucide-react";
import {
  calibrateReference,
  getLlmHealth,
  getProgressSummary,
  getProgressWeakPhonemes,
  getStudentWeakPhonemes,
  getTtsStatus,
  getTtsUrl,
} from "../api/client";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { UI_TEXT } from "../i18n/translations";
import {
  MINIMAL_PAIRS,
  type CalibrateResponse,
  type Lang,
  type LlmHealthResponse,
  type ProgressSummaryResponse,
  type TargetPhoneme,
  type WeakPhonemeRecommendation,
  type WeakPhonemeStat,
} from "../types/api";

interface LogopedDashboardProps {
  lang: Lang;
  studentName: string;
  onStartMinimalPairs?: (phoneme: TargetPhoneme) => void;
}

const ALL_CALIBRATION_WORDS = MINIMAL_PAIRS.flatMap((p) => [
  p.target_word,
  p.distractor_word,
]);

export function LogopedDashboard({
  lang,
  studentName,
  onStartMinimalPairs,
}: LogopedDashboardProps) {
  const [stats, setStats] = useState<WeakPhonemeStat[]>([]);
  const [recommendations, setRecommendations] = useState<WeakPhonemeRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [llmHealth, setLlmHealth] = useState<LlmHealthResponse | null>(null);
  const [summary, setSummary] = useState<ProgressSummaryResponse | null>(null);

  const [selectedWord, setSelectedWord] = useState<string>(ALL_CALIBRATION_WORDS[0]);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationResult, setCalibrationResult] = useState<CalibrateResponse | null>(null);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [hasLiveWord, setHasLiveWord] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const checkLiveStatus = useCallback((word: string) => {
    getTtsStatus(word)
      .then((res) => setHasLiveWord(res.has_live))
      .catch(() => setHasLiveWord(false));
  }, []);

  useEffect(() => {
    checkLiveStatus(selectedWord);
  }, [selectedWord, checkLiveStatus]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleListenLive = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(`${getTtsUrl(selectedWord, "live")}&_t=${Date.now()}`);
    audio.preservesPitch = true;
    audioRef.current = audio;
    audio.play().catch(() => {});
  };

  const loadStats = useCallback(async () => {
    setLoading(true);
    setStatsError(null);
    try {
      const [weakRes, healthRes, sumRes, recRes] = await Promise.all([
        getStudentWeakPhonemes(studentName),
        getLlmHealth().catch(() => ({ online: false, model: "kazllm:8b" })),
        getProgressSummary(studentName).catch(() => null),
        getProgressWeakPhonemes(studentName).catch(() => ({ student_name: studentName, weak_phonemes: [] })),
      ]);
      setStats(weakRes.weak_phonemes);
      setLlmHealth(healthRes);
      setSummary(sumRes);
      setRecommendations(recRes.weak_phonemes);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : "Failed to load statistics");
    } finally {
      setLoading(false);
    }
  }, [studentName]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleCalibrateRecorded = useCallback(
    async (blob: Blob) => {
      setCalibrating(true);
      setCalibrationError(null);
      setCalibrationResult(null);
      try {
        const res = await calibrateReference(blob, selectedWord);
        setCalibrationResult(res);
        setHasLiveWord(true);
      } catch (err) {
        setCalibrationError(err instanceof Error ? err.message : "Calibration failed");
      } finally {
        setCalibrating(false);
      }
    },
    [selectedWord]
  );

  const { isRecording, waveform, error: micError, startRecording, stopRecording } =
    useAudioRecorder({
      onRecorded: handleCalibrateRecorded,
    });

  return (
    <div className="space-y-6">
      {/* Top Status Bar: KazLLM-8B Health + Student Progress Summary */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card flex items-center justify-between p-5">
          <div className="flex items-center gap-3">
            <Cpu className="h-8 w-8 text-blue-600" />
            <div>
              <div className="text-xs font-bold uppercase text-slate-400">KazLLM-8B Server</div>
              <div className="text-sm font-extrabold text-slate-900">
                {llmHealth?.model || "kazllm:8b"}
              </div>
              {llmHealth?.base_url && (
                <div className="text-[11px] text-slate-400">{llmHealth.base_url}</div>
              )}
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-extrabold ${
              llmHealth?.online
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {llmHealth?.online ? "ONLINE" : "FALLBACK"}
          </span>
        </div>

        <div className="surface-card flex items-center gap-3 p-5">
          <Mic className="h-8 w-8 text-emerald-600" />
          <div>
            <div className="text-xs font-bold uppercase text-slate-400">
              {lang === "kk" ? "Дыбыс жаттығуы" : "Произношение"}
            </div>
            <div className="text-lg font-black text-slate-900">
              {summary ? `${summary.speech_passed_attempts} / ${summary.speech_total_attempts}` : "0 / 0"}
            </div>
          </div>
        </div>

        <div className="surface-card flex items-center gap-3 p-5">
          <BookOpen className="h-8 w-8 text-amber-500" />
          <div>
            <div className="text-xs font-bold uppercase text-slate-400">
              {lang === "kk" ? "Жеңіл оқу және квиз" : "Чтение и квиз"}
            </div>
            <div className="text-lg font-black text-slate-900">
              {summary
                ? `${summary.completed_readings} мәтін • Квиз ${summary.quiz_correct}/${summary.quiz_total}`
                : "0"}
            </div>
          </div>
        </div>
      </section>

      {/* Stage 3: Weak Phonemes Recommendations & Quick Minimal Pairs Trainer Launch */}
      {recommendations.length > 0 && (
        <section className="surface-card p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-amber-950">
                <Target className="h-5 w-5 text-amber-600" />
                {lang === "kk"
                  ? "Әлсіз дыбыстар бойынша ұсыныс (Минималды жұптар)"
                  : "Рекомендации по слабым звукам (Минимальные пары)"}
              </h2>
              <p className="text-xs text-amber-800">
                {lang === "kk"
                  ? "Оқушының қателері негізінде автоматты түрде іріктелген жұптар"
                  : "Автоматически подобранные минимальные пары на основе истории попыток ученика"}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {recommendations.slice(0, 3).map((rec) => (
              <div
                key={rec.phoneme}
                className="flex flex-col justify-between rounded-xl border border-amber-200 bg-white p-4 shadow-sm"
              >
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-950">
                      [{rec.phoneme.toUpperCase()}] ↔ [{rec.distractor_phoneme.toUpperCase()}]
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      ⭐ {rec.avg_stars} • {Math.round((1 - rec.error_rate) * 100)}%
                    </span>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {rec.recommended_pairs.map((p, idx) => (
                      <span
                        key={idx}
                        className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800"
                      >
                        {p.target_word} — {p.distractor_word}
                      </span>
                    ))}
                  </div>
                </div>

                {onStartMinimalPairs && (
                  <button
                    type="button"
                    onClick={() => onStartMinimalPairs(rec.phoneme)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-extrabold text-slate-950 transition hover:bg-amber-400"
                  >
                    <Target className="h-3.5 w-3.5" />
                    {lang === "kk"
                      ? `«${rec.phoneme.toUpperCase()}» жұптарын жаттықтыру`
                      : `Тренировать пары «${rec.phoneme.toUpperCase()}»`}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
      {/* Weak Phonemes Analytics */}
      <section className="surface-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <BarChart3 className="h-5 w-5 text-sky-600" />
            {UI_TEXT.dashboard.weakTitle[lang]} ({studentName})
          </h2>
          <button
            type="button"
            onClick={loadStats}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {UI_TEXT.dashboard.refresh[lang]}
          </button>
        </div>

        {statsError && (
          <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
            {statsError}
          </p>
        )}

        {stats.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
            {UI_TEXT.dashboard.noStats[lang]}
          </div>
        ) : (
          <div className="space-y-3">
            {stats.map((row) => {
              const errPct = Math.round(row.error_rate * 100);
              return (
                <div
                  key={row.phoneme}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-base font-extrabold text-blue-700">
                        {row.phoneme.toUpperCase()}
                      </span>
                      <span className="text-sm font-bold text-slate-800">
                        {lang === "kk" ? "Қателер" : "Ошибок"}: {row.failed_attempts} /{" "}
                        {row.total_attempts}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        errPct >= 50
                          ? "bg-red-100 text-red-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {errPct}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full ${errPct >= 50 ? "bg-red-500" : "bg-emerald-500"}`}
                      style={{ width: `${errPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Live Reference Calibration */}
      <section className="surface-card p-6">
        <h2 className="text-lg font-extrabold text-slate-900">
          {UI_TEXT.dashboard.calibrateTitle[lang]}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {UI_TEXT.dashboard.calibrateDesc[lang]}
        </p>

        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-bold text-slate-700">
            {UI_TEXT.dashboard.selectWord[lang]}
          </label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {ALL_CALIBRATION_WORDS.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => {
                  setSelectedWord(word);
                  setCalibrationResult(null);
                  setCalibrationError(null);
                }}
                className={`rounded-xl border-2 px-3 py-2 text-sm font-bold transition ${
                  selectedWord === word
                    ? "border-sky-600 bg-sky-50 text-sky-900"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-300"
                }`}
              >
                {word}
              </button>
            ))}
          </div>
        </div>

        {/* Waveform */}
        <div className="my-4 flex h-14 items-end justify-center gap-1 rounded-xl bg-slate-900/5 px-3 py-2">
          {waveform.map((v, idx) => (
            <div
              key={idx}
              className={`w-2 rounded-full transition-all duration-75 ${
                isRecording ? "bg-sky-600" : "bg-slate-300"
              }`}
              style={{ height: `${Math.round(v * 100)}%` }}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {!isRecording ? (
            <button
              type="button"
              disabled={calibrating}
              onClick={startRecording}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3.5 text-base font-bold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {calibrating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
              {UI_TEXT.dashboard.recordCalibration[lang]}: «{selectedWord}»
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3.5 text-base font-bold text-white hover:bg-red-700"
            >
              <Square className="h-4 w-4 fill-current" />
              {UI_TEXT.trainer.stopRecord[lang]}
            </button>
          )}

          <button
            type="button"
            disabled={!hasLiveWord}
            onClick={handleListenLive}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3.5 text-sm font-bold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Volume2 className="h-5 w-5" />
            {lang === "kk" ? "Тыңдау" : "Прослушать"}
          </button>
        </div>

        {(micError || calibrationError) && (
          <p className="mt-3 text-sm font-semibold text-red-600">
            {micError || calibrationError}
          </p>
        )}

        {calibrationResult && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-sm text-emerald-950">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-bold">{UI_TEXT.dashboard.calibratedOk[lang]}</p>
              <p className="mt-0.5 text-xs text-emerald-800">
                word: <strong>{calibrationResult.word}</strong> • live_samples_count:{" "}
                <strong>{calibrationResult.live_samples_count}</strong>
              </p>
            </div>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
