import { useEffect, useRef, useState } from "react";
import { Eye, Gauge, Play, Square, Volume2 } from "lucide-react";
import { getTtsStatus, getTtsUrl } from "../api/client";
import { ARTICULATION_GUIDES } from "../i18n/translations";
import type { Lang, TargetPhoneme, TtsVoice } from "../types/api";

interface ArticulationDiagramProps {
  phoneme: TargetPhoneme;
  targetWord: string;
  distractorPhoneme: string;
  lang: Lang;
  highlightCorrection?: boolean;
}

type Phase = 1 | 2 | 3;
type MouthType = "rest" | "open_deep" | "nasal_low" | "rounded_mid" | "rounded_tight" | "smile_trill";

interface AnatomyConfig {
  voiced: boolean;
  nasal: boolean;
  trill: boolean;
  zoneX: number;
  zoneY: number;
  jawDrop1: number;
  jawDrop2: number;
  tongueTarget: string;
  tongueRelease?: string;
  tongueMistake: string;
  innerMuscleTarget: string;
  airPath: string;
  mouthType: MouthType;
}

/* ------------------------------------------------------------------ */
/*  2D Vector Sagittal Geometry (viewBox 0 0 560 340, left x: 0..378)  */
/* ------------------------------------------------------------------ */

// Warm peach-terracotta head, face & neck silhouette (#ea8c55)
const HEAD_SILHOUETTE_PATH =
  "M 122,0 C 114,32 104,54 96,68 C 88,80 74,90 74,98 C 74,106 84,110 92,112 " +
  "C 94,118 84,124 84,130 C 84,136 92,140 96,142 C 88,146 84,152 86,158 " +
  "C 88,164 94,170 92,178 C 86,188 86,204 98,214 C 118,222 148,224 172,226 " +
  "C 178,256 180,296 180,340 L 284,340 C 280,275 278,195 280,115 C 282,62 278,25 270,0 Z";

// Dark cherry/burgundy internal nasal cavity, nasopharynx, pharynx & trachea (#9e2a3b)
const INTERNAL_TRACT_PATH =
  "M 84,108 C 98,82 132,62 176,60 C 218,60 246,78 254,114 C 260,150 256,220 254,340 " +
  "L 210,340 C 208,285 208,252 204,234 C 184,234 140,230 116,216 C 106,204 100,186 96,170 " +
  "C 92,160 92,146 96,138 C 114,132 152,124 200,124 L 200,114 C 166,110 126,110 96,112 Z";

// Light-pink airway lumen in the lower pharynx, larynx & trachea (#f4978e)
const LARYNX_LUMEN_PATH =
  "M 216,222 C 226,220 238,224 244,236 C 248,266 246,304 246,340 " +
  "L 216,340 C 216,304 214,268 214,236 C 214,228 215,224 216,222 Z";

// Creamy-yellow Maxilla & Hard Palate (#fde08d) above upper incisor
const MAXILLA_HARD_PALATE_PATH =
  "M 96,112 C 122,108 164,108 200,114 L 200,124 C 168,120 136,122 114,132 " +
  "C 106,136 100,136 96,130 C 92,124 92,116 96,112 Z";

// Movable Soft Palate & Uvula (#f8ad9d)
const VELUM_RAISED =
  "M 198,114 C 222,114 242,122 250,136 C 253,144 245,150 238,145 C 230,136 216,128 198,124 Z";
const VELUM_LOWERED =
  "M 198,114 C 212,122 220,138 223,156 C 224,165 215,168 212,160 C 208,146 204,132 198,124 Z";

// Shared compact tongue root & base ending strictly at the hyoid bone level (y ≈ 232)
// Every tongue path = M + 2C (tip) + 4C (dorsum ending at 218,214) + 3C (base)
const TONGUE_BASE =
  " C 216,226 206,232 192,232 C 164,232 134,226 118,214 C 114,208 112,204 112,198 Z";

// Rounded protruding tongue tips (starting behind the yellow mandible at x=112, y=198)
const TIP_LOW = "M 112,198 C 104,196 100,188 102,180 C 104,172 110,166 120,162";
const TIP_BACK = "M 112,198 C 108,196 106,188 108,182 C 110,175 116,170 126,168";
const TIP_FWD = "M 112,198 C 102,195 98,185 100,175 C 102,165 108,158 118,152";
const TIP_CURL = "M 112,198 C 104,192 100,164 104,144 C 106,134 112,128 118,134";

const TONGUE_REST =
  TIP_LOW +
  " C 138,156 160,154 178,156 C 196,158 210,166 218,180 C 222,188 222,198 220,206 C 219,210 218,212 218,214" +
  TONGUE_BASE;

const INNER_MUSCLE_REST =
  "M 120,210 C 122,190 138,176 162,176 C 184,176 200,188 202,208 C 194,222 142,222 120,210 Z";

const TONGUE_MISTAKE_VELAR =
  TIP_BACK +
  " C 142,150 168,126 192,126 C 212,128 222,150 224,172 C 225,188 222,200 220,208 C 219,211 218,212 218,214" +
  TONGUE_BASE;

const TONGUE_MISTAKE_ALVEOLAR =
  TIP_CURL +
  " C 126,146 152,160 184,166 C 204,170 216,180 220,192 C 222,200 220,206 219,210 C 218,212 218,213 218,214" +
  TONGUE_BASE;

const TONGUE_MISTAKE_BACK =
  TIP_BACK +
  " C 144,166 172,164 196,154 C 214,146 224,158 225,176 C 225,190 222,200 220,208 C 219,211 218,212 218,214" +
  TONGUE_BASE;

const ANATOMY_CONFIG: Record<TargetPhoneme, AnatomyConfig> = {
  қ: {
    voiced: false,
    nasal: false,
    trill: false,
    zoneX: 244,
    zoneY: 138,
    jawDrop1: 3,
    jawDrop2: 6,
    // Back dorsum rises high & back to press tightly against the uvula (Тілшік) at (244, 138)
    tongueTarget:
      TIP_BACK +
      " C 150,162 184,146 214,132 C 232,124 246,128 248,138 C 250,150 238,178 226,198 C 221,206 219,210 218,214" +
      TONGUE_BASE,
    tongueRelease:
      TIP_BACK +
      " C 150,166 182,154 210,142 C 226,136 238,140 240,150 C 242,162 234,184 224,200 C 220,207 219,211 218,214" +
      TONGUE_BASE,
    tongueMistake: TONGUE_MISTAKE_VELAR,
    innerMuscleTarget:
      "M 124,210 C 134,186 164,162 194,156 C 214,152 222,174 212,206 C 198,222 146,222 124,210 Z",
    airPath: "M 231,290 C 234,226 246,172 232,152 C 200,136 136,140 62,146",
    mouthType: "open_deep",
  },
  ғ: {
    voiced: true,
    nasal: false,
    trill: false,
    zoneX: 242,
    zoneY: 142,
    jawDrop1: 3,
    jawDrop2: 5,
    // Narrow 3-4 px gap to uvula + vocal cords pulse in trachea
    tongueTarget:
      TIP_BACK +
      " C 150,164 184,148 212,136 C 230,128 243,133 245,143 C 247,154 236,180 225,198 C 221,206 219,210 218,214" +
      TONGUE_BASE,
    tongueMistake: TONGUE_MISTAKE_VELAR,
    innerMuscleTarget:
      "M 124,210 C 134,186 164,164 192,158 C 212,154 220,176 210,206 C 196,222 146,222 124,210 Z",
    airPath: "M 231,290 C 234,226 246,174 232,154 C 200,138 136,142 62,146",
    mouthType: "open_deep",
  },
  ң: {
    voiced: true,
    nasal: true,
    trill: false,
    zoneX: 216,
    zoneY: 152,
    jawDrop1: 2,
    jawDrop2: 4,
    // Back dorsum closes against lowered soft palate, airflow goes through nasal cavity
    tongueTarget:
      TIP_LOW +
      " C 140,158 170,152 194,144 C 210,138 222,144 226,158 C 230,172 226,192 221,204 C 219,208 218,211 218,214" +
      TONGUE_BASE,
    tongueMistake: TONGUE_MISTAKE_ALVEOLAR,
    innerMuscleTarget:
      "M 122,210 C 130,188 158,166 186,162 C 206,160 214,180 206,208 C 194,222 144,222 122,210 Z",
    airPath: "M 231,290 C 236,220 248,160 244,112 C 234,80 196,70 156,74 C 118,80 92,94 66,102",
    mouthType: "nasal_low",
  },
  ө: {
    voiced: true,
    nasal: false,
    trill: false,
    zoneX: 150,
    zoneY: 134,
    jawDrop1: 3,
    jawDrop2: 4,
    // Tongue body shifted forward toward hard palate
    tongueTarget:
      TIP_FWD +
      " C 132,140 158,134 182,142 C 202,150 216,168 221,186 C 223,196 221,204 219,209 C 218,211 218,212 218,214" +
      TONGUE_BASE,
    tongueMistake: TONGUE_MISTAKE_BACK,
    innerMuscleTarget:
      "M 118,208 C 120,182 140,164 166,166 C 188,168 202,186 202,208 C 190,222 140,222 118,208 Z",
    airPath: "M 231,290 C 234,226 228,172 196,158 C 158,144 114,142 60,146",
    mouthType: "rounded_mid",
  },
  ү: {
    voiced: true,
    nasal: false,
    trill: false,
    zoneX: 146,
    zoneY: 128,
    jawDrop1: 2,
    jawDrop2: 3,
    // Tongue body shifted forward and high toward hard palate
    tongueTarget:
      TIP_FWD +
      " C 130,132 156,126 180,136 C 202,146 216,166 221,184 C 223,194 221,204 219,209 C 218,211 218,212 218,214" +
      TONGUE_BASE,
    tongueMistake: TONGUE_MISTAKE_BACK,
    innerMuscleTarget:
      "M 118,208 C 118,180 138,160 164,162 C 186,164 200,184 202,208 C 190,222 140,222 118,208 Z",
    airPath: "M 231,290 C 234,226 228,168 194,152 C 156,138 112,140 58,144",
    mouthType: "rounded_tight",
  },
  р: {
    voiced: true,
    nasal: false,
    trill: true,
    zoneX: 112,
    zoneY: 130,
    jawDrop1: 3,
    jawDrop2: 5,
    // Rounded tip curls up to the alveoli right behind upper incisor and vibrates
    tongueTarget:
      TIP_CURL +
      " C 124,146 144,158 168,162 C 194,166 214,178 220,194 C 222,201 220,207 219,210 C 218,212 218,213 218,214" +
      TONGUE_BASE,
    tongueMistake: TONGUE_MISTAKE_ALVEOLAR,
    innerMuscleTarget:
      "M 118,208 C 116,182 134,168 160,172 C 184,176 200,190 202,208 C 190,222 140,222 118,208 Z",
    airPath: "M 231,290 C 234,226 228,176 192,162 C 154,152 116,140 62,146",
    mouthType: "smile_trill",
  },
};

const PHASE_LABELS: Record<Phase, Record<Lang, string>> = {
  1: { kk: "1. Дайындық", ru: "1. Подготовка" },
  2: { kk: "2. Смычка / Орналасу", ru: "2. Смычка / Постановка" },
  3: { kk: "3. Дем шығару / Дыбыс", ru: "3. Выдох / Звук" },
};

/* ------------------------------------------------------------------ */
/*  Front mirror mouth geometry (right part, center 467,160)            */
/* ------------------------------------------------------------------ */

const MCX = 467;
const MCY = 160;

interface MouthParams {
  w: number;
  ui: number;
  lo: number;
  tu: number;
  tl: number;
}

const MOUTH_PARAMS: Record<MouthType, MouthParams> = {
  rest: { w: 44, ui: 3, lo: 4, tu: 11, tl: 11 },
  open_deep: { w: 46, ui: 12, lo: 20, tu: 11, tl: 11 },
  nasal_low: { w: 44, ui: 5, lo: 8, tu: 11, tl: 11 },
  rounded_mid: { w: 25, ui: 10, lo: 12, tu: 13, tl: 12 },
  rounded_tight: { w: 17, ui: 7, lo: 8, tu: 13, tl: 12 },
  smile_trill: { w: 52, ui: 8, lo: 13, tu: 9, tl: 10 },
};

const f = (n: number) => n.toFixed(1);

function upperInner(p: MouthParams, fromLeft: boolean): string {
  const { w, ui } = p;
  const y = MCY - ui;
  return fromLeft
    ? `C ${f(MCX - w * 0.55)},${f(y)} ${f(MCX - w * 0.2)},${f(y)} ${f(MCX)},${f(y)} ` +
        `C ${f(MCX + w * 0.2)},${f(y)} ${f(MCX + w * 0.55)},${f(y)} ${f(MCX + w)},${f(MCY)}`
    : `C ${f(MCX + w * 0.55)},${f(y)} ${f(MCX + w * 0.2)},${f(y)} ${f(MCX)},${f(y)} ` +
        `C ${f(MCX - w * 0.2)},${f(y)} ${f(MCX - w * 0.55)},${f(y)} ${f(MCX - w)},${f(MCY)}`;
}

function lowerInner(p: MouthParams, fromLeft: boolean): string {
  const { w, lo } = p;
  const y = MCY + lo;
  return fromLeft
    ? `C ${f(MCX - w * 0.55)},${f(y)} ${f(MCX - w * 0.2)},${f(y)} ${f(MCX)},${f(y)} ` +
        `C ${f(MCX + w * 0.2)},${f(y)} ${f(MCX + w * 0.55)},${f(y)} ${f(MCX + w)},${f(MCY)}`
    : `C ${f(MCX + w * 0.55)},${f(y)} ${f(MCX + w * 0.2)},${f(y)} ${f(MCX)},${f(y)} ` +
        `C ${f(MCX - w * 0.2)},${f(y)} ${f(MCX - w * 0.55)},${f(y)} ${f(MCX - w)},${f(MCY)}`;
}

function openingPath(p: MouthParams): string {
  return `M ${f(MCX - p.w)},${f(MCY)} ${upperInner(p, true)} ${lowerInner(p, false)} Z`;
}

function upperLipPath(p: MouthParams): string {
  const { w, ui, tu } = p;
  const top = MCY - ui - tu;
  return (
    `M ${f(MCX - w)},${f(MCY)} ` +
    `C ${f(MCX - w * 0.8)},${f(top + tu * 0.45)} ${f(MCX - w * 0.45)},${f(top - tu * 0.1)} ${f(MCX - w * 0.17)},${f(top - tu * 0.05)} ` +
    `C ${f(MCX - w * 0.08)},${f(top)} ${f(MCX - 3)},${f(top + tu * 0.2)} ${f(MCX)},${f(top + tu * 0.25)} ` +
    `C ${f(MCX + 3)},${f(top + tu * 0.2)} ${f(MCX + w * 0.08)},${f(top)} ${f(MCX + w * 0.17)},${f(top - tu * 0.05)} ` +
    `C ${f(MCX + w * 0.45)},${f(top - tu * 0.1)} ${f(MCX + w * 0.8)},${f(top + tu * 0.45)} ${f(MCX + w)},${f(MCY)} ` +
    `${upperInner(p, false)} Z`
  );
}

function lowerLipPath(p: MouthParams): string {
  const { w, lo, tl } = p;
  const bottom = MCY + lo + tl;
  return (
    `M ${f(MCX - w)},${f(MCY)} ${lowerInner(p, true)} ` +
    `C ${f(MCX + w * 0.7)},${f(bottom - tl * 0.1)} ${f(MCX + w * 0.3)},${f(bottom)} ${f(MCX)},${f(bottom)} ` +
    `C ${f(MCX - w * 0.3)},${f(bottom)} ${f(MCX - w * 0.7)},${f(bottom - tl * 0.1)} ${f(MCX - w)},${f(MCY)} Z`
  );
}

const VOICE_STORAGE_KEY = "tandem_syr_tts_voice";

export function ArticulationDiagram({
  phoneme,
  targetWord,
  distractorPhoneme,
  lang,
  highlightCorrection = false,
}: ArticulationDiagramProps) {
  const [phase, setPhase] = useState<Phase>(2);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 0.5>(1);
  const [showMistake, setShowMistake] = useState(false);
  const [ttsVoice, setTtsVoice] = useState<TtsVoice>(() => {
    try {
      const saved = localStorage.getItem(VOICE_STORAGE_KEY);
      if (saved === "live" || saved === "aigul" || saved === "daulet") return saved;
    } catch {
      // ignore storage errors
    }
    return "aigul";
  });
  const [hasLive, setHasLive] = useState(false);
  const [ttsNotice, setTtsNotice] = useState<string | null>(null);

  const intervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const cfg = ANATOMY_CONFIG[phoneme];
  const guide = ARTICULATION_GUIDES[phoneme];

  useEffect(() => {
    let cancelled = false;
    setTtsNotice(null);
    getTtsStatus(targetWord)
      .then((res) => {
        if (!cancelled) setHasLive(res.has_live);
      })
      .catch(() => {
        if (!cancelled) setHasLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetWord]);

  useEffect(() => {
    setIsPlaying(false);
    setPhase(2);
    setShowMistake(highlightCorrection);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [phoneme, targetWord, highlightCorrection]);

  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    const stepMs = speed === 0.5 ? 1600 : 850;
    intervalRef.current = window.setInterval(() => {
      setPhase((prev) => (prev === 3 ? 1 : ((prev + 1) as Phase)));
    }, stepMs);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, speed]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleSelectVoice = (voice: TtsVoice) => {
    setTtsVoice(voice);
    setTtsNotice(null);
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, voice);
    } catch {
      // ignore storage errors
    }
  };

  const handleTogglePlay = () => {
    if (!isPlaying) {
      setPhase(1);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  const handleSpeakReference = () => {
    setTtsNotice(null);
    if (ttsVoice === "live" && !hasLive) {
      setTtsNotice(
        lang === "kk"
          ? "Бұл сөзге жанды дауыс кабинетте жазылмаған"
          : "Живой эталон не записан в кабинете логопеда"
      );
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(getTtsUrl(targetWord, ttsVoice));
    audio.preservesPitch = true;
    audio.playbackRate = speed === 0.5 ? 0.75 : 1.0;
    audioRef.current = audio;
    audio.play().catch(() => {});
  };

  const transition = `all ${speed === 0.5 ? 0.9 : 0.45}s cubic-bezier(0.4, 0, 0.2, 1)`;
  const jawDrop = phase === 1 ? cfg.jawDrop1 : cfg.jawDrop2;
  const activeTongue =
    phase === 1
      ? TONGUE_REST
      : phase === 3 && cfg.tongueRelease
        ? cfg.tongueRelease
        : cfg.tongueTarget;
  const activeInnerMuscle = phase === 1 ? INNER_MUSCLE_REST : cfg.innerMuscleTarget;
  const velumLowered = cfg.nasal && phase >= 2;
  const activeVelum = velumLowered ? VELUM_LOWERED : VELUM_RAISED;
  const uvulaPoint = velumLowered ? { x: 217, y: 160 } : { x: 245, y: 142 };
  const showAirflow = phase === 3;
  const showVocalGlow = cfg.voiced && phase >= 2;
  const isTrilling = cfg.trill && phase === 3;
  const trillClass = isTrilling ? (speed === 0.5 ? "animate-trill-slow" : "animate-trill") : "";

  const accentStroke = highlightCorrection ? "#dc2626" : "#0284c7";
  const accentFill = highlightCorrection ? "rgba(239, 68, 68, 0.22)" : "rgba(14, 165, 233, 0.2)";

  // Mirror mouth (right panel)
  const mType: MouthType = phase >= 2 ? cfg.mouthType : "rest";
  const mp = MOUTH_PARAMS[mType];
  const opening = openingPath(mp);
  const upperTeethY = MCY - mp.ui - 4;
  const lowerTeethY = MCY + mp.lo - 9;

  return (
    <div
      className={`surface-card p-6 transition-all ${
        highlightCorrection ? "ring-2 ring-rose-400/50" : ""
      }`}
    >
      {/* Header + Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900">{guide.title[lang]}</h3>
          <span className="text-xs font-semibold text-teal-700">{guide.zoneLabel[lang]}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleTogglePlay}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
              isPlaying
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100"
            }`}
          >
            {isPlaying ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5" />}
            {isPlaying
              ? lang === "kk"
                ? "Тоқтату"
                : "Остановить"
              : lang === "kk"
                ? "Қозғалыста көрсету"
                : "Показать произношение"}
          </button>

          <button
            type="button"
            onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
              speed === 0.5
                ? "bg-amber-100 text-amber-900"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200/70"
            }`}
          >
            <Gauge className="h-3.5 w-3.5" />
            {speed === 1 ? "1x" : lang === "kk" ? "0.5x Баяу" : "0.5x Медленно"}
          </button>

          <button
            type="button"
            onClick={handleSpeakReference}
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-600"
          >
            <Volume2 className="h-3.5 w-3.5" />
            {lang === "kk" ? "Үлгіні тыңдау" : "Послушать эталон"}
          </button>

          <button
            type="button"
            onClick={() => setShowMistake((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
              showMistake
                ? "bg-rose-100 text-rose-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            {lang === "kk"
              ? `Қате (${distractorPhoneme.toUpperCase()})`
              : `Ошибка (${distractorPhoneme.toUpperCase()})`}
          </button>
        </div>
      </div>

      {/* 3-Phase Stepper */}
      <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-100/80 p-1">
        {([1, 2, 3] as Phase[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setPhase(p);
            }}
            className={`rounded-xl px-2 py-1.5 text-center text-xs font-extrabold transition ${
              phase === p
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {PHASE_LABELS[p][lang]}
          </button>
        ))}
      </div>

      {/* TTS Voice Selector */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100/80 px-3 py-2">
        <span className="text-xs font-bold text-slate-600">
          {lang === "kk" ? "Эталон дауысы:" : "Голос эталона:"}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleSelectVoice("live")}
            title={hasLive ? undefined : lang === "kk" ? "Кабинетте жазылмаған" : "Не записано в кабинете"}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              ttsVoice === "live"
                ? hasLive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-amber-100 text-amber-900 ring-1 ring-amber-400"
                : hasLive
                  ? "bg-white text-slate-700 hover:bg-emerald-50"
                  : "bg-white/60 text-slate-400"
            }`}
          >
            {lang === "kk" ? "Диктор (Жанды дауыс)" : "Диктор (Живой голос)"}
            {!hasLive && (
              <span className="ml-1 text-[10px] font-semibold">
                ({lang === "kk" ? "жазылмаған" : "не записано"})
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSelectVoice("aigul")}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              ttsVoice === "aigul" ? "bg-sky-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-sky-50"
            }`}
          >
            {lang === "kk" ? "Айгүл (Әйел)" : "Айгуль (Жен)"}
          </button>
          <button
            type="button"
            onClick={() => handleSelectVoice("daulet")}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              ttsVoice === "daulet" ? "bg-sky-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-sky-50"
            }`}
          >
            {lang === "kk" ? "Дәулет (Ер)" : "Даулет (Муж)"}
          </button>
        </div>
        {ttsNotice && <p className="w-full text-right text-[11px] font-semibold text-amber-700">{ttsNotice}</p>}
      </div>

      {/* Dual-view anatomical illustration (viewBox 0 0 560 340) */}
      <div className="rounded-2xl bg-[#F8FAFC] p-3">
        <svg viewBox="0 0 560 340" className="h-auto w-full" role="img" aria-label={guide.title[lang]}>
          <defs>
            {/* Gradients & filters used strictly by the right-hand Mirror view */}
            <linearGradient id="toothGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>
            <linearGradient id="lipGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e11d48" />
              <stop offset="100%" stopColor="#9f1239" />
            </linearGradient>
            <radialGradient id="mirrorTongueGrad" cx="50%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#fda4af" />
              <stop offset="100%" stopColor="#e11d48" />
            </radialGradient>
            <filter id="organShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#1e293b" floodOpacity="0.22" />
            </filter>
            <clipPath id="mouthOpeningClip">
              <path d={opening} style={{ transition }} />
            </clipPath>
            <marker id="airArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="#0284c7" />
            </marker>
          </defs>

          {/* ================= LEFT: CLEAN 2D VECTOR SAGITTAL SECTION ================= */}
          <g>
            {/* 1. Warm peach-terracotta head, face & neck silhouette (#ea8c55) */}
            <path d={HEAD_SILHOUETTE_PATH} fill="#ea8c55" />

            {/* 2. Dark cherry/burgundy nasal cavity, nasopharynx, pharynx & trachea (#9e2a3b) */}
            <path d={INTERNAL_TRACT_PATH} fill="#9e2a3b" />

            {/* 3. Light-pink airway lumen in larynx & trachea (#f4978e) */}
            <path d={LARYNX_LUMEN_PATH} fill="#f4978e" />

            {/* Subtle tracheal cartilage rings on anterior wall of trachea */}
            {[262, 276, 290, 304, 318].map((ry) => (
              <rect
                key={`tr-${ry}`}
                x="208"
                y={ry}
                width="6"
                height="8"
                rx="2.5"
                fill="#cbd5e1"
              />
            ))}

            {/* 4. Bluish-grey curved petal of Epiglottis (Көмекей, #cbd5e1) */}
            <path
              d="M 206,246 C 204,228 212,210 218,212 C 222,214 216,234 214,250 Z"
              fill="#cbd5e1"
            />

            {/* 5. Yellow Hyoid Bone arc (Подъязычная кость, #fde08d) at y ≈ 235 */}
            <path
              d="M 188,233 C 194,229 204,230 206,236 C 206,241 196,242 190,239 C 186,237 186,235 188,233 Z"
              fill="#fde08d"
            />

            {/* Mistake ghost contour */}
            {showMistake && (
              <path
                d={cfg.tongueMistake}
                fill="rgba(239, 68, 68, 0.16)"
                stroke="#dc2626"
                strokeWidth="1.8"
                strokeDasharray="6 4"
              />
            )}

            {/* 6. Anatomically proportional Tongue (Тіл, #d94e4e) + inner genioglossus muscle (#c23b3b) */}
            <g className={trillClass}>
              <path d={activeTongue} fill="#d94e4e" style={{ transition }} />
              <path d={activeInnerMuscle} fill="#c23b3b" style={{ transition }} />
            </g>

            {/* 7. Creamy-yellow Maxilla & Hard Palate (#fde08d) */}
            <path d={MAXILLA_HARD_PALATE_PATH} fill="#fde08d" />

            {/* 8. Movable Soft Palate & Uvula (Тілшік, #f8ad9d) */}
            <path d={activeVelum} fill="#f8ad9d" style={{ transition }} />

            {/* 9. Upper Incisor (#ffffff) */}
            <path
              d="M 96,124 C 101,122 106,126 105,134 L 102,146 C 100,149 96,149 95,145 L 94,132 C 94,127 94,125 96,124 Z"
              fill="#ffffff"
            />

            {/* 10. Movable Lower Jaw: Lower Incisor (#ffffff) + Teardrop Mandible (#fde08d) */}
            <g style={{ transform: `translateY(${jawDrop}px)`, transition }}>
              <path
                d="M 97,174 L 97,160 C 97,156 102,156 104,160 L 106,171 C 106,176 101,179 98,177 Z"
                fill="#ffffff"
              />
              {/* Teardrop Mandible bone inside chin behind lower incisor */}
              <path
                d="M 96,175 C 104,173 112,180 112,193 C 112,205 102,211 95,205 C 89,199 90,181 96,175 Z"
                fill="#fde08d"
              />
            </g>

            {/* 11. Vocal Cords in Trachea (Дауыс желбезегі, y ≈ 278) */}
            <g className={showVocalGlow ? "animate-vocal" : "opacity-55"}>
              <ellipse
                cx="231"
                cy="278"
                rx="12"
                ry="5"
                fill={showVocalGlow ? "rgba(249, 115, 22, 0.45)" : "rgba(255, 255, 255, 0.45)"}
                stroke={showVocalGlow ? "#ea580c" : "#9e2a3b"}
                strokeWidth="1.6"
              />
              <line
                x1="222"
                y1="278"
                x2="240"
                y2="278"
                stroke={showVocalGlow ? "#ea580c" : "#9e2a3b"}
                strokeWidth="1.6"
              />
            </g>

            {/* 12. Animated Blue Airflow Stream (Phase 3) */}
            {showAirflow && (
              <path
                d={cfg.airPath}
                fill="none"
                stroke="#0284c7"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeDasharray="8 5"
                markerEnd="url(#airArrow)"
                className={speed === 0.5 ? "animate-airflow-slow" : "animate-airflow"}
              />
            )}

            {/* 13. Active Articulation Target Badge */}
            <circle
              cx={cfg.zoneX}
              cy={cfg.zoneY}
              r={phase >= 2 ? 13 : 9.5}
              fill={accentFill}
              stroke={accentStroke}
              strokeWidth="1.8"
              className={highlightCorrection || phase === 3 ? "animate-pulse" : ""}
              style={{ transition }}
            />
            <text
              x={cfg.zoneX}
              y={cfg.zoneY + 4}
              textAnchor="middle"
              fontSize="10.5"
              fontWeight="800"
              fill={accentStroke}
            >
              {phoneme.toUpperCase()}
            </text>

            {/* 14. Clean Callout Labels (Left & Right margins, thin dark lines + black dot) */}
            <g fontSize="9.2" fontWeight="700" fill="#0f172a">
              {/* LEFT CALLOUTS */}
              {/* Мұрын қуысы (Nasal cavity) */}
              <line x1="76" y1="54" x2="142" y2="84" stroke="#1e293b" strokeWidth="1" />
              <circle cx="142" cy="84" r="2.2" fill="#0f172a" />
              <text x="72" y="51" textAnchor="end">
                {lang === "kk" ? "Мұрын қуысы" : "Носовая полость"}
              </text>

              {/* Қатты таңдай (Hard palate) */}
              <line x1="76" y1="118" x2="152" y2="115" stroke="#1e293b" strokeWidth="1" />
              <circle cx="152" cy="115" r="2.2" fill="#0f172a" />
              <text x="72" y="115" textAnchor="end">
                {lang === "kk" ? "Қатты таңдай" : "Твёрдое нёбо"}
              </text>

              {/* Тіл (Tongue) */}
              <line x1="72" y1="176" x2="154" y2="184" stroke="#1e293b" strokeWidth="1" />
              <circle cx="154" cy="184" r="2.2" fill="#0f172a" />
              <text x="68" y="179" textAnchor="end">
                {lang === "kk" ? "Тіл" : "Язык"}
              </text>

              {/* Төменгі жақ (Mandible) */}
              <line
                x1="76"
                y1="234"
                x2="103"
                y2={194 + jawDrop}
                stroke="#1e293b"
                strokeWidth="1"
              />
              <circle cx="103" cy={194 + jawDrop} r="2.2" fill="#0f172a" />
              <text x="72" y="237" textAnchor="end">
                {lang === "kk" ? "Төменгі жақ" : "Нижняя челюсть"}
              </text>

              {/* RIGHT CALLOUTS */}
              {/* Тілшік (Увула) */}
              <line
                x1="288"
                y1="138"
                x2={uvulaPoint.x}
                y2={uvulaPoint.y}
                stroke="#1e293b"
                strokeWidth="1"
                style={{ transition }}
              />
              <circle
                cx={uvulaPoint.x}
                cy={uvulaPoint.y}
                r="2.2"
                fill="#0f172a"
                style={{ transition }}
              />
              <text x="292" y="141" textAnchor="start">
                {lang === "kk" ? "Тілшік (Увула)" : "Язычок (Увула)"}
              </text>

              {/* Көмекей (Epiglottis / Pharynx) */}
              <line x1="288" y1="216" x2="215" y2="224" stroke="#1e293b" strokeWidth="1" />
              <circle cx="215" cy="224" r="2.2" fill="#0f172a" />
              <text x="292" y="219" textAnchor="start">
                {lang === "kk" ? "Көмекей" : "Надгортанник"}
              </text>

              {/* Дауыс желбезегі (Vocal cords) */}
              <line x1="288" y1="278" x2="238" y2="278" stroke="#1e293b" strokeWidth="1" />
              <circle cx="238" cy="278" r="2.2" fill="#0f172a" />
              <text x="292" y="281" textAnchor="start">
                {lang === "kk" ? "Дауыс желбезегі" : "Голосовые связки"}
              </text>
            </g>
          </g>

          {/* ================= RIGHT: MIRROR (mouth only — untouched) ================= */}
          <g>
            <rect x="385" y="12" width="165" height="316" rx="22" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.6" />
            <text x={MCX} y="36" textAnchor="middle" fontSize="11" fontWeight="800" fill="#0369a1">
              {lang === "kk" ? "Айнадағы көрініс" : "Вид в зеркале"}
            </text>

            {cfg.nasal && showAirflow && (
              <g stroke="#0284c7" strokeWidth="2.4" fill="none" strokeDasharray="5 3" strokeLinecap="round">
                <path d={`M ${MCX - 10},96 Q ${MCX - 28},108 ${MCX - 34},124`} className="animate-airflow" />
                <path d={`M ${MCX + 10},96 Q ${MCX + 28},108 ${MCX + 34},124`} className="animate-airflow" />
              </g>
            )}

            {/* Layers 1–3 strictly inside the lip opening */}
            <g clipPath="url(#mouthOpeningClip)">
              {/* Layer 1: dark oral cavity */}
              <rect x={MCX - 70} y={MCY - 40} width="140" height="80" fill="#3b0d1e" />

              {/* Layer 2: tongue (behind the teeth) */}
              {mType === "open_deep" && (
                <ellipse cx={MCX} cy={MCY + mp.lo + 1} rx={mp.w * 0.55} ry="9" fill="url(#mirrorTongueGrad)" opacity="0.85" />
              )}
              {(mType === "nasal_low" || mType === "rest") && (
                <ellipse cx={MCX} cy={MCY + mp.lo + 2} rx={mp.w * 0.6} ry="6" fill="url(#mirrorTongueGrad)" />
              )}
              {(mType === "rounded_mid" || mType === "rounded_tight") && (
                <ellipse cx={MCX} cy={MCY + mp.lo} rx={mp.w * 0.55} ry="4.5" fill="url(#mirrorTongueGrad)" opacity="0.9" />
              )}
              {mType === "smile_trill" && (
                <g className={trillClass}>
                  <path
                    d={`M ${MCX - 18},${MCY + mp.lo + 4} C ${MCX - 14},${MCY - mp.ui - 2} ${MCX + 14},${MCY - mp.ui - 2} ${MCX + 18},${MCY + mp.lo + 4} Z`}
                    fill="url(#mirrorTongueGrad)"
                  />
                </g>
              )}

              {/* Layer 3: teeth rows (after the tongue) */}
              <g style={{ transition }}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <rect
                    key={`ut-${i}`}
                    x={MCX - 31.5 + i * 10.5 + 0.4}
                    y={upperTeethY}
                    width="9.7"
                    height="11"
                    rx="3"
                    fill="url(#toothGrad)"
                    stroke="#cbd5e1"
                    strokeWidth="0.6"
                    style={{ transition }}
                  />
                ))}
                {[0, 1, 2, 3, 4].map((i) => (
                  <rect
                    key={`lt-${i}`}
                    x={MCX - 26.25 + i * 10.5 + 0.4}
                    y={lowerTeethY}
                    width="9.7"
                    height="12"
                    rx="3"
                    fill="url(#toothGrad)"
                    stroke="#cbd5e1"
                    strokeWidth="0.6"
                    style={{ transition }}
                  />
                ))}
              </g>
            </g>

            {/* Layer 4: lips on top of everything */}
            <path d={upperLipPath(mp)} fill="url(#lipGrad)" filter="url(#organShadow)" style={{ transition }} />
            <path d={lowerLipPath(mp)} fill="url(#lipGrad)" filter="url(#organShadow)" style={{ transition }} />
            <ellipse
              cx={MCX}
              cy={MCY + mp.lo + mp.tl * 0.5}
              rx={mp.w * 0.3}
              ry={mp.tl * 0.18}
              fill="#ffffff"
              opacity="0.35"
              style={{ transition }}
            />

            <text x={MCX} y="278" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#475569">
              {mType === "rounded_tight" || mType === "rounded_mid"
                ? lang === "kk"
                  ? "Ерін дөңгелек"
                  : "Губы трубочкой"
                : mType === "smile_trill"
                  ? lang === "kk"
                    ? "Тіл ұшы жоғарыда"
                    : "Кончик языка вверх"
                  : mType === "open_deep"
                    ? lang === "kk"
                      ? "Тіл артқа тартылған"
                      : "Язык оттянут вглубь"
                    : cfg.nasal && phase >= 2
                      ? lang === "kk"
                        ? "Дем мұрыннан"
                        : "Выдох через нос"
                      : lang === "kk"
                        ? "Дайындық"
                        : "Подготовка"}
            </text>
          </g>
        </svg>
      </div>

      {/* Articulation guide cards */}
      <div className="mt-3 grid gap-2.5 text-sm leading-relaxed text-slate-700 md:grid-cols-2">
        <div className="rounded-xl bg-slate-100 p-3">
          <p className="font-semibold text-slate-900">{guide.contrast[lang]}</p>
        </div>
        <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
          <p className="font-medium text-sky-950">{guide.tip[lang]}</p>
        </div>
      </div>
    </div>
  );
}
