import { useState } from "react";
import { BookOpen, Gamepad2, Lock, Mic, Stethoscope, Unlock, User } from "lucide-react";
import { AdaptiveReader } from "./components/AdaptiveReader";
import { BreathingGame } from "./components/BreathingGame";
import { LogopedDashboard } from "./components/LogopedDashboard";
import { SpeechTrainer } from "./components/SpeechTrainer";
import { UI_TEXT } from "./i18n/translations";
import type { Lang, TargetPhoneme } from "./types/api";

type TabKey = "trainer" | "reader" | "breathing" | "dashboard";

const PRESET_STUDENTS = ["Алихан", "Айгерім", "Нұрислам", "Амина"];

export default function App() {
  const [lang, setLang] = useState<Lang>("kk");
  const [tab, setTab] = useState<TabKey>("trainer");
  const [studentName, setStudentName] = useState<string>("Алихан");
  const [specialistMode, setSpecialistMode] = useState<boolean>(true);
  const [logoImgFailed, setLogoImgFailed] = useState<boolean>(false);
  const [trainerPhoneme, setTrainerPhoneme] = useState<TargetPhoneme>("қ");
  const [trainerMinimalPairs, setTrainerMinimalPairs] = useState<boolean>(false);

  const handleStartMinimalPairsFromDashboard = (phoneme: TargetPhoneme) => {
    setTrainerPhoneme(phoneme);
    setTrainerMinimalPairs(true);
    setTab("trainer");
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800">
      {/* Full-Width 3-Column Grid Navbar: Left = Brand | Center = Nav | Right = Controls */}
      <header className="sticky top-0 z-30 w-full bg-white/95 shadow-[0_2px_16px_rgba(15,23,42,0.04)] backdrop-blur-md">
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-4 px-6 py-3 md:grid-cols-[1fr_auto_1fr] lg:px-10">
          {/* 1. LEFT EDGE: Logo + Non-Wrapping Brand Name */}
          <div className="flex items-center justify-self-start">
            <div className="flex items-center gap-3">
              {!logoImgFailed ? (
                <img
                  src="/logo.png"
                  alt="Tandem-Syr Logo"
                  onError={() => setLogoImgFailed(true)}
                  className="h-11 w-auto shrink-0 object-contain"
                />
              ) : (
                <svg
                  viewBox="0 0 36 36"
                  className="h-10 w-10 shrink-0 rounded-xl shadow-sm"
                  role="img"
                  aria-label="Tandem-Syr Logo"
                >
                  <defs>
                    <linearGradient id="tsLogoBg" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#2563EB" />
                      <stop offset="100%" stopColor="#0D9488" />
                    </linearGradient>
                  </defs>
                  <rect width="36" height="36" rx="10" fill="url(#tsLogoBg)" />
                  <path
                    d="M 6 24 Q 12 19 18 24 T 30 24"
                    fill="none"
                    stroke="#FDE68A"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  />
                  <line x1="12" y1="11" x2="12" y2="17" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
                  <line x1="18" y1="8" x2="18" y2="19" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
                  <line x1="24" y1="12" x2="24" y2="17" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
                </svg>
              )}
              <span className="whitespace-nowrap text-xl font-black tracking-tight text-slate-900">
                Tandem-Syr
              </span>
            </div>
          </div>

          {/* 2. DEAD CENTER: Single-Line Navigation Pill Bar (No Wrapping!) */}
          <nav className="justify-self-center">
            <div className="inline-flex flex-nowrap items-center gap-1 rounded-2xl bg-slate-100/90 p-1.5">
              <button
                type="button"
                onClick={() => setTab("trainer")}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-extrabold transition-all ${
                  tab === "trainer"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Mic className="h-4 w-4 shrink-0" />
                <span>{lang === "kk" ? "Дыбыс жаттығуы" : "Произношение"}</span>
              </button>

              <button
                type="button"
                onClick={() => setTab("reader")}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-extrabold transition-all ${
                  tab === "reader"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                <span>{lang === "kk" ? "Жеңіл оқу" : "Лёгкое чтение"}</span>
              </button>

              <button
                type="button"
                onClick={() => setTab("breathing")}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-extrabold transition-all ${
                  tab === "breathing"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Gamepad2 className="h-4 w-4 shrink-0" />
                <span>{lang === "kk" ? "Лого-ойындар" : "Лого-игры"}</span>
              </button>

              <button
                type="button"
                onClick={() => setTab("dashboard")}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-extrabold transition-all ${
                  tab === "dashboard"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Stethoscope className="h-4 w-4 shrink-0" />
                <span>{UI_TEXT.tabs.dashboard[lang]}</span>
              </button>
            </div>
          </nav>

          {/* 3. RIGHT EDGE: Student Profile + Specialist Lock + Language */}
          <div className="flex flex-nowrap items-center gap-2.5 justify-self-end">
            <div className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-slate-100/90 px-3">
              <User className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <label htmlFor="student-input" className="text-xs font-bold text-slate-500">
                {UI_TEXT.studentLabel[lang]}:
              </label>
              <input
                id="student-input"
                list="preset-students"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-20 bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none"
              />
              <datalist id="preset-students">
                {PRESET_STUDENTS.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <button
              type="button"
              onClick={() => setSpecialistMode((v) => !v)}
              title={
                lang === "kk"
                  ? "Маман режимі: барлық деңгейлерді еркін ашу"
                  : "Режим специалиста: свободный доступ ко всем уровням"
              }
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
                specialistMode
                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-500/30"
                  : "bg-slate-100 text-slate-400 hover:text-slate-700"
              }`}
            >
              {specialistMode ? (
                <Unlock className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
            </button>

            <div className="inline-flex h-9 shrink-0 items-center rounded-xl bg-slate-100/90 p-1">
              <button
                type="button"
                onClick={() => setLang("kk")}
                className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition ${
                  lang === "kk"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                ҚАЗ
              </button>
              <button
                type="button"
                onClick={() => setLang("ru")}
                className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition ${
                  lang === "ru"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                РУС
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Active Workspace */}
      <main className="mx-auto max-w-6xl px-6 py-6">
        {tab === "trainer" && (
          <SpeechTrainer
            lang={lang}
            studentName={studentName}
            freeUnlock={specialistMode}
            initialPhoneme={trainerPhoneme}
            initialMinimalPairsMode={trainerMinimalPairs}
          />
        )}
        {tab === "reader" && <AdaptiveReader lang={lang} studentName={studentName} />}
        {tab === "breathing" && <BreathingGame lang={lang} />}
        {tab === "dashboard" && (
          <LogopedDashboard lang={lang} studentName={studentName} onStartMinimalPairs={handleStartMinimalPairsFromDashboard} />
        )}
      </main>
    </div>
  );
}
