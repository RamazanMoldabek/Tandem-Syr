import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Play, RotateCcw, Square, Volume2, Wind } from "lucide-react";
import { getTtsUrl } from "../api/client";
import type { Lang } from "../types/api";

interface BreathingGameProps {
  lang: Lang;
}

type GameId = "sailboat" | "motor" | "dandelion" | "bee" | "drums";
type BreathZone = "quiet" | "good" | "loud" | "wrong_sound";

interface GameMeta {
  id: GameId;
  emoji: string;
  title_kk: string;
  title_ru: string;
  badge_kk: string;
  badge_ru: string;
  desc_kk: string;
  desc_ru: string;
}

const GAMES: GameMeta[] = [
  {
    id: "sailboat",
    emoji: "⛵",
    title_kk: "Сырдария желкені",
    title_ru: "Парусник на Сырдарье",
    badge_kk: "Таза тыныс (дауыссыз)",
    badge_ru: "Чистый выдох (без голоса)",
    desc_kk: "Дауыс қоспай, тек таза ауамен жұмсақ әрі ұзақ үрлеп қайықты жағаға жеткіз.",
    desc_ru: "Без голоса, только чистым и плавным потоком воздуха дуй в микрофон, чтобы доплыть до берега.",
  },
  {
    id: "motor",
    emoji: "🚗",
    title_kk: "Моторды оталдыр",
    title_ru: "Заведи моторчик",
    badge_kk: "Р / Ғ дірілі",
    badge_ru: "Вибрация Р / Ғ",
    desc_kk: "«Д-р-р-р!», «Р-р-р-р!» немесе «Ғ-ғ-ғ!» деп дауыспен дірілдетіп айт (жай үрлегенге мотор оталмайды!).",
    desc_ru: "Звонко рычи «Д-р-р-р!», «Р-р-р-р!» или «Ғ-ғ-ғ!» с вибрацией (от простого дутья мотор не заведётся!).",
  },
  {
    id: "dandelion",
    emoji: "🌼",
    title_kk: "Бақбақ гүлі",
    title_ru: "Сдуй одуванчик",
    badge_kk: "Қ дыбысы (Қа! Қо!)",
    badge_ru: "Слоги Қа! Қо!",
    desc_kk: "5 рет қысқа әрі анық дауыспен «Қа! ... Қо! ... Ақ!» деп айтып, 5 үлпілдекті ұшыр (жай үрлеу есептелмейді).",
    desc_ru: "Произнеси голосом 5 чётких слогов с паузой («Қа! ... Қо! ... Ақ!»), чтобы сдуть 5 пушинок (простое дутьё не считается).",
  },
  {
    id: "bee",
    emoji: "🐝",
    title_kk: "Бал арасы",
    title_ru: "Пчёлка собирает мёд",
    badge_kk: "Ң / Ө / Ү дауысы",
    badge_ru: "Голос Ң / Ө / Ү",
    desc_kk: "«Ң-ң-ң-ң», «Ө-ө-ө» немесе «Ү-ү-ү» дыбысын таза дауыспен үзбей созып, араны 3 гүлге қондыр.",
    desc_ru: "Тяни голосом непрерывный звук «Ң-ң-ң», «Ө-ө-ө» или «Ү-ү-ү» (не воздухом!), чтобы пчёлка облетела 3 цветка.",
  },
  {
    id: "drums",
    emoji: "🥁",
    title_kk: "Буын барабаны",
    title_ru: "Ритм-барабан по слогам",
    badge_kk: "СДВГ / Буын ырғағы",
    badge_ru: "Слоговой ритм",
    desc_kk: "Сөзді буынға бөліп, әр буынды дауыспен анық айт — әр дауысты буын келесі барабанды жағады!",
    desc_ru: "Произнеси слово чётко по слогам голосом с паузами — каждый голосовой слог зажигает следующий барабан!",
  },
];

interface DrumWord {
  word: string;
  syllables: string[];
  meaning_kk: string;
  meaning_ru: string;
}

const DRUM_WORDS: DrumWord[] = [
  {
    word: "Қарақарға",
    syllables: ["Қа", "ра", "қар", "ға"],
    meaning_kk: "Қара қарға (4 буын)",
    meaning_ru: "Чёрная ворона (4 слога)",
  },
  {
    word: "Қызылорда",
    syllables: ["Қы", "зыл", "ор", "да"],
    meaning_kk: "Қызылорда қаласы (4 буын)",
    meaning_ru: "Город Кызылорда (4 слога)",
  },
  {
    word: "Қоңырау",
    syllables: ["Қо", "ңы", "рау"],
    meaning_kk: "Мектеп қоңырауы (3 буын)",
    meaning_ru: "Школьный колокольчик (3 слога)",
  },
  {
    word: "Көбелек",
    syllables: ["Кө", "бе", "лек"],
    meaning_kk: "Әдемі көбелек (3 буын)",
    meaning_ru: "Бабочка (3 слога)",
  },
];

/**
 * Сверхлёгкий DSP-расчёт периодичности голоса (Normalized Autocorrelation) и ZCR.
 * Выполняет всего ~3500 операций с плавающей точкой на кадр (< 0.05 мс на CPU, 0% GPU).
 * - Человеческий голос (периодическая волна связок 110..380 Гц): clarity >= 0.50
 * - Дутьё в микрофон, ветер, стук, шипение (хаотичный шум): clarity < 0.38
 */
function analyzeVoiceVsBreath(buf: Float32Array, sampleRate: number): {
  rms: number;
  pitchClarity: number;
  zcr: number;
} {
  const n = 512; // Достаточно 512 отсчётов (~11 мс)
  let energy = 0;
  let zeroCrossings = 0;
  for (let i = 0; i < n; i++) {
    const s = buf[i];
    energy += s * s;
    if (i > 0 && ((buf[i - 1] >= 0 && s < 0) || (buf[i - 1] < 0 && s >= 0))) {
      zeroCrossings++;
    }
  }
  const rms = Math.sqrt(energy / n);
  const zcr = zeroCrossings / n;

  if (rms < 0.015) {
    return { rms, pitchClarity: 0, zcr };
  }

  // Диапазон основного тона голоса F0: 110 Гц .. 380 Гц
  const minLag = Math.max(20, Math.floor(sampleRate / 380));
  const maxLag = Math.min(220, Math.floor(sampleRate / 110));
  const windowLen = 256;

  let norm0 = 0;
  for (let i = 0; i < windowLen; i++) {
    norm0 += buf[i] * buf[i];
  }
  if (norm0 < 1e-6) {
    return { rms, pitchClarity: 0, zcr };
  }

  let bestCorr = 0;
  // Шаг по лагу 2 отсчёта экономит половину умножений без потери точности
  for (let lag = minLag; lag <= maxLag; lag += 2) {
    let sum = 0;
    let normLag = 0;
    for (let i = 0; i < windowLen; i++) {
      const a = buf[i];
      const b = buf[i + lag];
      sum += a * b;
      normLag += b * b;
    }
    const denom = Math.sqrt(norm0 * normLag);
    if (denom > 1e-6) {
      const corr = sum / denom;
      if (corr > bestCorr) bestCorr = corr;
    }
  }

  return {
    rms,
    pitchClarity: Math.max(0, Math.min(1, bestCorr)),
    zcr,
  };
}

export function BreathingGame({ lang }: BreathingGameProps) {
  const [selectedGame, setSelectedGame] = useState<GameId>("sailboat");
  const [active, setActive] = useState(false);
  const [rms, setRms] = useState(0);
  const [pitchClarity, setPitchClarity] = useState(0);
  const [zone, setZone] = useState<BreathZone>("quiet");
  const [wrongSoundHint, setWrongSoundHint] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [smoothSeconds, setSmoothSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Game 3 (Dandelion): 0..5 seeds blown
  const [seedsBlown, setSeedsBlown] = useState(0);

  // Game 5 (Drums): selected word & number of syllables hit
  const [drumWordIdx, setDrumWordIdx] = useState(0);
  const [drumsHit, setDrumsHit] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Rolling RMS history (last 8 frames) to detect vibration/trill ripple for Motor game
  const rmsHistoryRef = useRef<number[]>([]);
  // Pulse confirmation state for Dandelion & Drums (must see voiced frames during a burst)
  const armedForPulseRef = useRef<boolean>(true);
  const voicedFramesInBurstRef = useRef<number>(0);
  const lastPulseTimeRef = useRef<number>(0);

  const gameIdRef = useRef<GameId>(selectedGame);
  gameIdRef.current = selectedGame;
  const langRef = useRef<Lang>(lang);
  langRef.current = lang;

  const currentDrumWord = DRUM_WORDS[drumWordIdx];
  const drumTargetCountRef = useRef<number>(currentDrumWord.syllables.length);
  drumTargetCountRef.current = currentDrumWord.syllables.length;

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    setActive(false);
    setRms(0);
    setPitchClarity(0);
    setZone("quiet");
    setWrongSoundHint(null);
  }, []);

  useEffect(() => {
    return () => {
      stop();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [stop]);

  const resetCurrentGame = useCallback(() => {
    setProgress(0);
    setSmoothSeconds(0);
    setSeedsBlown(0);
    setDrumsHit(0);
    setWrongSoundHint(null);
    rmsHistoryRef.current = [];
    armedForPulseRef.current = true;
    voicedFramesInBurstRef.current = 0;
    lastPulseTimeRef.current = 0;
  }, []);

  const handleSelectGame = (id: GameId) => {
    stop();
    setSelectedGame(id);
    resetCurrentGame();
  };

  const handleSpeakDrumWord = (word: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(getTtsUrl(word, "aigul"));
    audio.preservesPitch = true;
    audio.playbackRate = 0.85;
    audioRef.current = audio;
    audio.play().catch(() => {});
  };

  const start = async () => {
    setError(null);
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);

      // Аппаратный High-Pass фильтр 85 Гц (внутри C++ движка браузера, 0% нагрузки):
      // отсекает низкочастотный гул ветра при задувании в микрофон
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 85;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;

      source.connect(highpass);
      highpass.connect(analyser);

      const timeBuffer = new Float32Array(analyser.fftSize);
      lastFrameRef.current = performance.now();
      armedForPulseRef.current = true;
      voicedFramesInBurstRef.current = 0;
      rmsHistoryRef.current = [];
      setActive(true);

      const loop = (now: number) => {
        const dt = Math.min(0.1, (now - lastFrameRef.current) / 1000);
        lastFrameRef.current = now;

        analyser.getFloatTimeDomainData(timeBuffer);
        const { rms: currentRms, pitchClarity: clarity, zcr } = analyzeVoiceVsBreath(
          timeBuffer,
          ctx.sampleRate
        );

        setRms(currentRms);
        setPitchClarity(clarity);

        // Обновляем короткую историю RMS (8 кадров) для оценки вибрации/пульсации в «Моторчике»
        const hist = rmsHistoryRef.current;
        hist.push(currentRms);
        if (hist.length > 8) hist.shift();
        let ripple = 0;
        for (let i = 1; i < hist.length; i++) {
          ripple += Math.abs(hist[i] - hist[i - 1]);
        }
        const modRatio = currentRms > 0.02 ? ripple / (hist.length * currentRms) : 0;

        const gId = gameIdRef.current;
        const curLang = langRef.current;

        if (gId === "sailboat") {
          // Парусник: нужен ТОЛЬКО чистый выдох (апериодический шум воздуха: clarity < 0.48)
          if (currentRms < 0.022) {
            setZone("quiet");
            setWrongSoundHint(null);
          } else if (currentRms > 0.24) {
            setZone("loud");
            setWrongSoundHint(null);
          } else if (clarity >= 0.52) {
            // Ребёнок гудит голосом вместо чистого выдоха
            setZone("wrong_sound");
            setWrongSoundHint(
              curLang === "kk"
                ? "Дауыс қоспай, тек таза ауамен жұмсақ үрле!"
                : "Это голос! Дуй только воздухом, без гудения!"
            );
          } else {
            setZone("good");
            setWrongSoundHint(null);
            setSmoothSeconds((s) => Number((s + dt).toFixed(1)));
            setProgress((p) => Math.min(100, p + dt * 13));
          }
        } else if (gId === "bee") {
          // Пчёлка: нужен ТОЛЬКО периодический голос (Ң-ң-ң / Ө-ө-ө / Ү-ү-ү: clarity >= 0.50)
          if (currentRms < 0.024) {
            setZone("quiet");
            setWrongSoundHint(null);
          } else if (currentRms > 0.3) {
            setZone("loud");
            setWrongSoundHint(null);
          } else if (clarity < 0.48) {
            // Это просто дутьё воздухом или шум
            setZone("wrong_sound");
            setWrongSoundHint(
              curLang === "kk"
                ? "Бұл жай тыныс (ауа)! «Ң-ң-ң» немесе «Ү-ү-ү» деп дауыспен соз!"
                : "Это просто выдох воздухом! Включи голос: тяни «Ң-ң-ң» или «Ү-ү-ү»!"
            );
          } else {
            setZone("good");
            setWrongSoundHint(null);
            setSmoothSeconds((s) => Number((s + dt).toFixed(1)));
            setProgress((p) => Math.min(100, p + dt * 14));
          }
        } else if (gId === "motor") {
          // Моторчик: нужен голос (clarity >= 0.44) + вибрация/рычание (modRatio >= 0.08 или ZCR >= 0.045)
          if (currentRms < 0.028) {
            setZone("quiet");
            setWrongSoundHint(null);
          } else if (currentRms > 0.36) {
            setZone("loud");
            setWrongSoundHint(null);
          } else if (clarity < 0.42) {
            setZone("wrong_sound");
            setWrongSoundHint(
              curLang === "kk"
                ? "Жай үрлегенге мотор оталмайды! Дауыспен «Д-р-р-р!» деп гүрілде!"
                : "От простого дутья мотор не заведётся! Рычи голосом: «Д-р-р-р!»"
            );
          } else if (modRatio < 0.065 && zcr < 0.04) {
            setZone("wrong_sound");
            setWrongSoundHint(
              curLang === "kk"
                ? "Тілді дірілдетіп «Д-р-р-р!» немесе «Ғ-ғ-ғ!» деп айт!"
                : "Добавь вибрацию кончиком языка: «Д-р-р-р!»"
            );
          } else {
            setZone("good");
            setWrongSoundHint(null);
            setSmoothSeconds((s) => Number((s + dt).toFixed(1)));
            setProgress((p) => Math.min(100, p + dt * 15));
          }
        } else if (gId === "dandelion") {
          // Одуванчик: короткий слог с голосом («Қа! Қо! Ақ!»), простое дутьё отсекается по clarity
          if (currentRms < 0.025) {
            armedForPulseRef.current = true;
            voicedFramesInBurstRef.current = 0;
            setZone("quiet");
          } else if (currentRms >= 0.05) {
            if (clarity >= 0.48) {
              voicedFramesInBurstRef.current += 1;
            } else if (currentRms >= 0.065 && voicedFramesInBurstRef.current === 0) {
              setZone("wrong_sound");
              setWrongSoundHint(
                curLang === "kk"
                  ? "Жай үрлеме! Дауыспен қысқа «ҚА!» немесе «АҚ!» деп айт!"
                  : "Не просто дуй воздухом! Чётко скажи голосом: «ҚА!» или «АҚ!»"
              );
            }

            if (
              armedForPulseRef.current &&
              voicedFramesInBurstRef.current >= 2 &&
              now - lastPulseTimeRef.current > 320
            ) {
              armedForPulseRef.current = false;
              lastPulseTimeRef.current = now;
              setZone("good");
              setWrongSoundHint(null);
              setSeedsBlown((prev) => Math.min(5, prev + 1));
            }
          }
        } else if (gId === "drums") {
          // Ритм-барабан: каждый слог должен быть произнесён голосом (clarity >= 0.48)
          if (currentRms < 0.025) {
            armedForPulseRef.current = true;
            voicedFramesInBurstRef.current = 0;
            setZone("quiet");
          } else if (currentRms >= 0.048) {
            if (clarity >= 0.48) {
              voicedFramesInBurstRef.current += 1;
            } else if (currentRms >= 0.065 && voicedFramesInBurstRef.current === 0) {
              setZone("wrong_sound");
              setWrongSoundHint(
                curLang === "kk"
                  ? "Бұл тыныс немесе шу! Буынды дауыспен анық айт!"
                  : "Это выдох или шум! Произнеси слог чётко голосом!"
              );
            }

            if (
              armedForPulseRef.current &&
              voicedFramesInBurstRef.current >= 2 &&
              now - lastPulseTimeRef.current > 260
            ) {
              armedForPulseRef.current = false;
              lastPulseTimeRef.current = now;
              setZone("good");
              setWrongSoundHint(null);
              setDrumsHit((prev) => Math.min(drumTargetCountRef.current, prev + 1));
            }
          }
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      stop();
      setError(err instanceof Error ? err.message : "Microphone access denied");
    }
  };

  const currentMeta = GAMES.find((g) => g.id === selectedGame)!;
  const meterPercent = Math.min(100, Math.round((rms / 0.3) * 100));

  const isFinished =
    selectedGame === "dandelion"
      ? seedsBlown >= 5
      : selectedGame === "drums"
        ? drumsHit >= currentDrumWord.syllables.length
        : progress >= 100;

  const rpmValue =
    selectedGame === "motor" && zone === "good"
      ? Math.min(8000, Math.round(2800 + pitchClarity * 5000))
      : selectedGame === "motor" && active
        ? 850
        : 0;

  return (
    <div className="space-y-6">
      {/* 5 Mini-Games Selector Grid */}
      <section className="surface-card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-slate-900">
          <Wind className="h-5 w-5 text-blue-600" />
          {lang === "kk"
            ? "Дыбыс пен тыныс ойындары"
            : "Игры для дыхания и голоса"}
        </h2>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {GAMES.map((g) => {
            const isSelected = g.id === selectedGame;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => handleSelectGame(g.id)}
                className={`flex flex-col justify-between rounded-2xl p-3.5 text-left transition ${
                  isSelected
                    ? "bg-blue-50/70 ring-2 ring-blue-500/40"
                    : "bg-[#F8FAFC] hover:bg-slate-100/80"
                }`}
              >
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-2xl">{g.emoji}</span>
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-extrabold text-sky-900">
                      {lang === "kk" ? g.badge_kk : g.badge_ru}
                    </span>
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    {lang === "kk" ? g.title_kk : g.title_ru}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Active Game Arena */}
      <section className="surface-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900">
              <span>{currentMeta.emoji}</span>
              {lang === "kk" ? currentMeta.title_kk : currentMeta.title_ru}
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {lang === "kk" ? currentMeta.desc_kk : currentMeta.desc_ru}
            </p>
          </div>

          <div className="flex gap-2">
            {!active ? (
              <button
                type="button"
                onClick={start}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-base font-bold text-white shadow-sm hover:bg-sky-700"
              >
                <Play className="h-5 w-5" />
                {lang === "kk" ? "Ойынды бастау" : "Начать игру"}
              </button>
            ) : (
              <button
                type="button"
                onClick={stop}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-base font-bold text-white shadow-sm hover:bg-red-700"
              >
                <Square className="h-4 w-4 fill-current" />
                {lang === "kk" ? "Тоқтату" : "Остановить"}
              </button>
            )}
            <button
              type="button"
              onClick={resetCurrentGame}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              {lang === "kk" ? "Қайта бастау" : "Сначала"}
            </button>
          </div>
        </div>

        {/* ==================== GAME 1: SAILBOAT ON SYR DARYA ==================== */}
        {selectedGame === "sailboat" && (
          <div className="relative overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-100 via-sky-50 to-cyan-200 p-4">
            <svg viewBox="0 0 600 210" className="h-52 w-full">
              <circle cx="535" cy="42" r="24" fill="#fde047" />
              <path
                d="M 0 155 Q 75 142 150 155 T 300 155 T 450 155 T 600 155 L 600 210 L 0 210 Z"
                fill="#0284c7"
                opacity="0.85"
              />
              <path
                d="M 0 172 Q 60 162 120 172 T 240 172 T 360 172 T 480 172 T 600 172 L 600 210 L 0 210 Z"
                fill="#0369a1"
                opacity="0.7"
              />
              <line x1="555" y1="95" x2="555" y2="155" stroke="#475569" strokeWidth="4" />
              <polygon points="555,95 588,108 555,120" fill="#10b981" />

              <g transform={`translate(${35 + (progress / 100) * 455}, 0)`}>
                <line x1="35" y1="68" x2="35" y2="145" stroke="#78350f" strokeWidth="4" />
                <path
                  d={
                    zone === "good"
                      ? "M 37 72 Q 84 105 37 136 Z"
                      : zone === "loud"
                        ? "M 37 72 Q 96 95 37 136 Z"
                        : "M 37 72 Q 52 105 37 136 Z"
                  }
                  fill={zone === "loud" || zone === "wrong_sound" ? "#fca5a5" : "#ffffff"}
                  stroke={zone === "good" ? "#0284c7" : "#94a3b8"}
                  strokeWidth="2.5"
                />
                <path d="M 10 144 L 66 144 L 56 162 L 20 162 Z" fill="#b45309" />
              </g>
            </svg>
          </div>
        )}

        {/* ==================== GAME 2: START THE MOTOR (Р-Р-Р / Д-Р-Р) ==================== */}
        {selectedGame === "motor" && (
          <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 via-orange-50 to-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="rounded-xl bg-slate-900 px-3 py-1 text-xs font-black text-amber-400">
                ⚡ {rpmValue} RPM ({lang === "kk" ? "Мотор айналымы" : "Обороты моторчика"})
              </span>
              <span className="text-xs font-extrabold text-slate-700">
                {lang === "kk" ? "Дыбыс: «Д-р-р-р!» / «Р-р-р-р!»" : "Рычи: «Д-р-р-р!» / «Р-р-р-р!»"}
              </span>
            </div>

            <svg viewBox="0 0 600 190" className="h-48 w-full">
              <path d="M 0 130 Q 150 95 300 125 T 600 120 L 600 190 L 0 190 Z" fill="#fde68a" />
              <rect x="0" y="142" width="600" height="44" fill="#334155" />
              <line
                x1="0"
                y1="164"
                x2="600"
                y2="164"
                stroke="#f8fafc"
                strokeWidth="3"
                strokeDasharray="18 14"
              />

              <rect x="548" y="86" width="6" height="58" fill="#0f172a" />
              <rect x="554" y="86" width="30" height="20" fill="#10b981" rx="3" />

              <g
                transform={`translate(${25 + (progress / 100) * 445}, ${
                  zone === "good" ? (Math.round(rms * 1000) % 2 === 0 ? -2 : 1) : 0
                })`}
              >
                {zone === "good" && (
                  <>
                    <circle cx="-10" cy="136" r="7" fill="#cbd5e1" opacity="0.8" />
                    <circle cx="-24" cy="130" r="10" fill="#e2e8f0" opacity="0.6" />
                  </>
                )}
                <path
                  d="M 8 136 L 8 116 L 24 114 L 38 96 L 74 96 L 88 114 L 106 118 L 106 136 Z"
                  fill="#ef4444"
                  stroke="#991b1b"
                  strokeWidth="2"
                />
                <polygon points="41,100 56,100 56,113 30,113" fill="#bae6fd" />
                <polygon points="60,100 72,100 82,113 60,113" fill="#bae6fd" />
                <circle cx="28" cy="138" r="12" fill="#0f172a" />
                <circle cx="28" cy="138" r="5" fill="#94a3b8" />
                <circle cx="84" cy="138" r="12" fill="#0f172a" />
                <circle cx="84" cy="138" r="5" fill="#94a3b8" />
              </g>
            </svg>
          </div>
        )}

        {/* ==================== GAME 3: BLOW THE DANDELION (ҚА! ҚО! АҚ!) ==================== */}
        {selectedGame === "dandelion" && (
          <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-b from-sky-100 via-emerald-50 to-emerald-100 p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-black text-white">
                🌼 {lang === "kk" ? `Ұшқан үлпілдек: ${seedsBlown} / 5` : `Сдуто пушинок: ${seedsBlown} из 5`}
              </span>
              <span className="text-xs font-extrabold text-emerald-900">
                {lang === "kk"
                  ? "Дауыспен қысқа «ҚА!» немесе «АҚ!» деп айт"
                  : "Скажи голосом чёткий слог «ҚА!» или «АҚ!»"}
              </span>
            </div>

            <svg viewBox="0 0 600 200" className="h-48 w-full">
              <path d="M 160 200 Q 165 150 160 105" stroke="#15803d" strokeWidth="7" fill="none" />
              <path d="M 160 175 Q 120 160 110 185 Q 135 190 160 185" fill="#22c55e" />
              <path d="M 162 170 Q 200 155 210 180 Q 185 188 162 180" fill="#22c55e" />
              <circle cx="160" cy="102" r="14" fill="#eab308" stroke="#ca8a04" strokeWidth="2" />

              {[0, 1, 2, 3, 4].map((idx) => {
                const isBlown = idx < seedsBlown;
                const angles = [-65, -32, 0, 32, 65];
                const rad = (angles[idx] * Math.PI) / 180;
                const baseX = 160 + Math.sin(rad) * 34;
                const baseY = 102 - Math.cos(rad) * 34;

                const flyX = 290 + idx * 58;
                const flyY = 38 + (idx % 2) * 32;

                const cx = isBlown ? flyX : baseX;
                const cy = isBlown ? flyY : baseY;

                return (
                  <g
                    key={idx}
                    style={{
                      transform: `translate(${cx}px, ${cy}px)`,
                      transition: "transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1)",
                    }}
                  >
                    <line x1="0" y1="0" x2="0" y2="18" stroke="#64748b" strokeWidth="1.8" />
                    <circle cx="0" cy="-4" r="13" fill="#ffffff" opacity="0.92" stroke="#bae6fd" strokeWidth="1.5" />
                    <circle cx="0" cy="0" r="3" fill="#f59e0b" />
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* ==================== GAME 4: BEE COLLECTS HONEY (Ң-Ң-Ң / Ө-Ө-Ө / Ү-Ү-Ү) ==================== */}
        {selectedGame === "bee" && (
          <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-b from-sky-100 via-amber-50 to-lime-100 p-4">
            <svg viewBox="0 0 600 200" className="h-48 w-full">
              {[
                { x: 175, pct: 30, color: "#f43f5e" },
                { x: 335, pct: 65, color: "#a855f7" },
                { x: 495, pct: 95, color: "#f59e0b" },
              ].map((fl, i) => {
                const visited = progress >= fl.pct;
                return (
                  <g key={i}>
                    <line x1={fl.x} y1="132" x2={fl.x} y2="200" stroke="#16a34a" strokeWidth="5" />
                    <circle
                      cx={fl.x}
                      cy="126"
                      r="20"
                      fill={fl.color}
                      opacity={visited ? "1" : "0.55"}
                      stroke={visited ? "#fde047" : "none"}
                      strokeWidth="4"
                    />
                    <circle cx={fl.x} cy="126" r="8" fill="#fde047" />
                  </g>
                );
              })}

              <g
                transform={`translate(${40 + (progress / 100) * 485}, ${
                  zone === "good" ? 58 : 112
                })`}
                style={{ transition: "transform 0.25s ease-out" }}
              >
                <ellipse cx="-4" cy="-14" rx="10" ry="7" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="1.5" />
                <ellipse cx="8" cy="-14" rx="10" ry="7" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="1.5" />
                <ellipse cx="0" cy="0" rx="18" ry="12" fill="#facc15" stroke="#0f172a" strokeWidth="2" />
                <line x1="-6" y1="-10" x2="-6" y2="10" stroke="#0f172a" strokeWidth="3.5" />
                <line x1="4" y1="-10" x2="4" y2="10" stroke="#0f172a" strokeWidth="3.5" />
                <circle cx="12" cy="-2" r="2" fill="#0f172a" />
              </g>
            </svg>
          </div>
        )}

        {/* ==================== GAME 5: SYLLABLE RHYTHM DRUMS (СДВГ & ДИСЛЕКСИЯ) ==================== */}
        {selectedGame === "drums" && (
          <div className="space-y-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {DRUM_WORDS.map((dw, idx) => (
                  <button
                    key={dw.word}
                    type="button"
                    onClick={() => {
                      setDrumWordIdx(idx);
                      setDrumsHit(0);
                      armedForPulseRef.current = true;
                    }}
                    className={`rounded-xl border-2 px-3.5 py-1.5 text-xs font-extrabold transition ${
                      drumWordIdx === idx
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                        : "border-indigo-200 bg-white text-indigo-950 hover:border-indigo-400"
                    }`}
                  >
                    {dw.syllables.join("-")}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleSpeakDrumWord(currentDrumWord.word)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100"
              >
                <Volume2 className="h-4 w-4" />
                {lang === "kk" ? "Сөзді тыңдау" : "Прослушать слово"}
              </button>
            </div>

            <p className="text-center text-xs font-bold text-indigo-900">
              {lang === "kk" ? currentDrumWord.meaning_kk : currentDrumWord.meaning_ru}
            </p>

            <div className="grid grid-cols-2 gap-4 py-3 sm:grid-cols-4">
              {currentDrumWord.syllables.map((syl, idx) => {
                const isLit = idx < drumsHit;
                const isNext = idx === drumsHit;
                return (
                  <div
                    key={idx}
                    className={`flex flex-col items-center justify-center rounded-2xl border-4 p-5 text-center transition-all ${
                      isLit
                        ? "scale-105 border-emerald-500 bg-emerald-500 text-white shadow-md"
                        : isNext && active
                          ? "border-indigo-500 bg-white text-indigo-950 ring-4 ring-indigo-200"
                          : "border-slate-300 bg-white/80 text-slate-700"
                    }`}
                  >
                    <span className="text-xs font-extrabold uppercase opacity-75">
                      {idx + 1}-{lang === "kk" ? "буын" : "слог"}
                    </span>
                    <span className="mt-1 text-3xl font-black">{syl}</span>
                    <span className="mt-2 text-lg">{isLit ? "🥁✨" : "🥁"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Victory Banner */}
        {isFinished && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-center text-base font-extrabold text-white shadow-sm">
            <CheckCircle2 className="h-6 w-6" />
            {lang === "kk"
              ? "Жарайсың! Тапсырма толық орындалды!"
              : "Молодец! Упражнение полностью выполнено!"}
          </div>
        )}

        {/* Microphone Breath / Voice Discriminator Meter */}
        <div className="mt-5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
            <span
              className={
                zone === "good"
                  ? "text-emerald-700"
                  : zone === "wrong_sound"
                    ? "text-amber-700"
                    : zone === "loud"
                      ? "text-red-600"
                      : "text-slate-600"
              }
            >
              {wrongSoundHint
                ? `⚠️ ${wrongSoundHint}`
                : zone === "good"
                  ? lang === "kk"
                    ? "✓ Дұрыс дыбыс! Дәл осылай жалғастыр!"
                    : "✓ Правильный звук! Продолжай в том же духе!"
                  : zone === "loud"
                    ? lang === "kk"
                      ? "Тым қатты! Айқайламай, жұмсақ айт"
                      : "Слишком громко! Без крика — мягче"
                    : lang === "kk"
                      ? "Микрофонға дыбыс шығарыңыз..."
                      : "Произнеси звук или подуй в микрофон..."}
            </span>

            <div className="flex items-center gap-3 text-xs text-slate-700">
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold">
                {rms < 0.02
                  ? lang === "kk"
                    ? "Тыныштық"
                    : "Тишина"
                  : pitchClarity >= 0.48
                    ? lang === "kk"
                      ? `🗣️ Дауыс (${Math.round(pitchClarity * 100)}%)`
                      : `🗣️ Голос (${Math.round(pitchClarity * 100)}%)`
                    : lang === "kk"
                      ? "💨 Тыныс / Ауа"
                      : "💨 Выдох / Воздух"}
              </span>

              <span>
                {selectedGame === "dandelion" ? (
                  <>
                    {lang === "kk" ? "Үлпілдек" : "Пушинки"}: <strong>{seedsBlown} / 5</strong>
                  </>
                ) : selectedGame === "drums" ? (
                  <>
                    {lang === "kk" ? "Буындар" : "Слоги"}:{" "}
                    <strong>
                      {drumsHit} / {currentDrumWord.syllables.length}
                    </strong>
                  </>
                ) : (
                  <>
                    {lang === "kk" ? "Уақыт" : "Время"}: <strong>{smoothSeconds}s</strong> •{" "}
                    {lang === "kk" ? "Нәтиже" : "Прогресс"}:{" "}
                    <strong>{Math.round(progress)}%</strong>
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="relative h-5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="absolute inset-y-0 bg-emerald-200/80"
              style={{ left: "8%", width: "65%" }}
            />
            <div
              className={`relative h-full transition-all duration-75 ${
                zone === "good"
                  ? "bg-emerald-600"
                  : zone === "wrong_sound"
                    ? "bg-amber-500"
                    : zone === "loud"
                      ? "bg-red-500"
                      : "bg-sky-500"
              }`}
              style={{ width: `${meterPercent}%` }}
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
      </section>
    </div>
  );
}
