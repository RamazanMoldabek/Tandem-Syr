import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Gamepad2,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  LogOut,
  Mic,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import {
  completeHomework,
  getAuthUsers,
  loginByCredentials,
  loginByRole,
  updateStudentAdaptiveProfile,
} from "./api/client";
import { AdaptiveReader } from "./components/AdaptiveReader";
import { BreathingGame } from "./components/BreathingGame";
import { LogopedDashboard } from "./components/LogopedDashboard";
import { SpeechTrainer } from "./components/SpeechTrainer";
import { UI_TEXT } from "./i18n/translations";
import type {
  HomeworkAssignment,
  Lang,
  ReaderProfileMode,
  TargetPhoneme,
  UserAccount,
  UserRole,
} from "./types/api";

type TabKey = "trainer" | "reader" | "breathing" | "dashboard";

const SESSION_STORAGE_KEY = "tandem_syr_session_user_v1";

const DEFAULT_USERS: Record<UserRole, UserAccount> = {
  teacher: {
    id: 1,
    username: "teacher",
    full_name: "Айжан Мұратқызы",
    role: "teacher",
    adaptive_profile: "dyslexia",
    grade: 2,
    linked_student_name: "Алихан",
  },
  student: {
    id: 2,
    username: "student",
    full_name: "Алихан",
    role: "student",
    adaptive_profile: "dyslexia",
    grade: 2,
    linked_student_name: "Алихан",
  },
  parent: {
    id: 3,
    username: "parent",
    full_name: "Марат (Ата-ана)",
    role: "parent",
    adaptive_profile: "dyslexia",
    grade: 2,
    linked_student_name: "Алихан",
  },
};

const DEFAULT_HOMEWORK: HomeworkAssignment[] = [
  {
    id: 1,
    student_name: "Алихан",
    teacher_name: "Айжан Мұратқызы",
    target_phoneme: "қ",
    target_level: 2,
    adaptive_profile: "dyslexia",
    reading_topic: "Қазақстан табиғаты",
    teacher_note:
      "Үйде «Қ» мен «К» дыбыстарының минималды жұптарын 5 минут қайталап, «Қазақстан табиғаты» мәтінін буынға бөліп оқып шығыңыздар.",
    status: "pending",
    created_at: new Date().toISOString(),
  },
];

const ROLE_META: {
  role: UserRole;
  short_kk: string;
  short_ru: string;
  title_kk: string;
  title_ru: string;
  username: string;
  pin: string;
  rights_kk: string;
  rights_ru: string;
}[] = [
  {
    role: "teacher",
    short_kk: "Мұғалім",
    short_ru: "Учитель",
    title_kk: "Логопед-мұғалім (Админ)",
    title_ru: "Учитель-логопед (Админ)",
    username: "teacher",
    pin: "1111",
    rights_kk:
      "Барлық деңгейлер ашық • Диктор дауысын калибрлеу • Оқушыға бейімдеу профилі мен үй тапсырмасын беру",
    rights_ru:
      "Все уровни открыты • Калибровка эталона голоса • Назначение профиля адаптации и домашнего задания",
  },
  {
    role: "student",
    short_kk: "Оқушы",
    short_ru: "Ученик",
    title_kk: "Оқушы (Алихан, 2-сынып)",
    title_ru: "Ученик (Алихан, 2 класс)",
    username: "student",
    pin: "2222",
    rights_kk:
      "Тек жаттығу мен ойын модульдері • Жұлдыздар арқылы деңгей ашу • Автоматты бейімделген оқу режимі",
    rights_ru:
      "Только игровые и учебные модули • Прогрессия по звёздам • Авто-профиль лёгкого чтения",
  },
  {
    role: "parent",
    short_kk: "Ата-ана",
    short_ru: "Родитель",
    title_kk: "Ата-ана (Марат)",
    title_ru: "Родитель (Марат)",
    username: "parent",
    pin: "3333",
    rights_kk:
      "Баланың апталық прогресі • Логопедтің үй тапсырмасы мен ұсынысы • Үйде бірге жаттығу және оқу",
    rights_ru:
      "Прогресс и аналитика ребёнка • Домашнее задание и заметки логопеда • Совместное чтение дома",
  },
];

export default function App() {
  const [lang, setLang] = useState<Lang>("kk");
  const [tab, setTab] = useState<TabKey>("trainer");
  const [logoImgFailed, setLogoImgFailed] = useState<boolean>(false);

  // Роль определяется ТОЛЬКО при входе в систему (null = экран авторизации)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as UserAccount) : null;
    } catch {
      return null;
    }
  });

  const [assignedProfile, setAssignedProfile] = useState<ReaderProfileMode>("dyslexia");
  const [homeworkList, setHomeworkList] = useState<HomeworkAssignment[]>(DEFAULT_HOMEWORK);

  // Login Screen Form state
  const [loginUsername, setLoginUsername] = useState<string>("teacher");
  const [loginPin, setLoginPin] = useState<string>("1111");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState<boolean>(false);

  const [trainerPhoneme, setTrainerPhoneme] = useState<TargetPhoneme>("қ");
  const [trainerMinimalPairs, setTrainerMinimalPairs] = useState<boolean>(false);

  useEffect(() => {
    getAuthUsers()
      .then((res) => {
        if (res.users && res.users.length > 0) {
          const studentAcc = res.users.find((u) => u.role === "student");
          if (studentAcc?.adaptive_profile) {
            setAssignedProfile(studentAcc.adaptive_profile);
          }
        }
        if (res.homework && res.homework.length > 0) {
          setHomeworkList(res.homework);
        }
      })
      .catch(() => {
        // Fallback to DEFAULT_USERS if backend hasn't reloaded yet
      });
  }, []);

  const establishSession = useCallback(
    (nextUser: UserAccount, hw?: HomeworkAssignment[]) => {
      setCurrentUser(nextUser);
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextUser));
      } catch {
        // ignore
      }
      if (nextUser.adaptive_profile) {
        setAssignedProfile(nextUser.adaptive_profile);
      }
      if (hw && hw.length > 0) {
        setHomeworkList(hw);
      }
      if (nextUser.role === "parent") {
        setTab("dashboard");
      } else {
        setTab("trainer");
      }
    },
    []
  );

  const handleLogout = () => {
    setCurrentUser(null);
    setLoginError(null);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handleQuickLoginAtGate = async (role: UserRole) => {
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await loginByRole(role);
      establishSession(res.user, res.homework);
    } catch {
      establishSession({
        ...DEFAULT_USERS[role],
        adaptive_profile: assignedProfile,
      });
    } finally {
      setLoggingIn(false);
    }
  };

  const handlePinLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await loginByCredentials(loginUsername, loginPin);
      establishSession(res.user, res.homework);
    } catch {
      const cleanU = loginUsername.trim().toLowerCase();
      const cleanP = loginPin.trim();
      if (cleanU === "teacher" && cleanP === "1111") {
        establishSession({ ...DEFAULT_USERS.teacher, adaptive_profile: assignedProfile });
      } else if (cleanU === "student" && cleanP === "2222") {
        establishSession({ ...DEFAULT_USERS.student, adaptive_profile: assignedProfile });
      } else if (cleanU === "parent" && cleanP === "3333") {
        establishSession({ ...DEFAULT_USERS.parent, adaptive_profile: assignedProfile });
      } else {
        setLoginError(
          lang === "kk"
            ? "Логин немесе PIN-код қате (teacher/1111, student/2222, parent/3333)"
            : "Неверный логин или PIN-код (teacher/1111, student/2222, parent/3333)"
        );
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleUpdateStudentProfile = useCallback((nextProfile: ReaderProfileMode) => {
    setAssignedProfile(nextProfile);
    updateStudentAdaptiveProfile(nextProfile).catch(() => {});
  }, []);

  const handleStartMinimalPairsFromDashboard = (phoneme: TargetPhoneme) => {
    setTrainerPhoneme(phoneme);
    setTrainerMinimalPairs(true);
    setTab("trainer");
  };

  const handleCompleteStudentHomework = async (hwId: number) => {
    try {
      const res = await completeHomework(hwId);
      setHomeworkList((prev) => prev.map((h) => (h.id === hwId ? res.homework : h)));
    } catch {
      setHomeworkList((prev) =>
        prev.map((h) => (h.id === hwId ? { ...h, status: "completed" } : h))
      );
    }
  };

  // =========================================================================
  // 1. ЭКРАН ВХОДА В СИСТЕМУ (Роль выбирается/авторизуется ДО входа в приложение)
  // =========================================================================
  if (!currentUser) {
    return (
      <div className="flex min-h-screen flex-col justify-between bg-[#F8FAFC] px-4 py-8 text-slate-800">
        {/* Top bar on Login Screen: Brand + Language */}
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            {!logoImgFailed && (
              <img
                src="/logo.png"
                alt="Tandem-Syr Logo"
                onError={() => setLogoImgFailed(true)}
                className="h-11 w-auto object-contain"
              />
            )}
            <span className="text-xl font-black tracking-tight text-slate-900">
              Tandem-Syr
            </span>
          </div>

          <div className="inline-flex h-9 items-center rounded-xl bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setLang("kk")}
              className={`rounded-lg px-3 py-1 text-xs font-extrabold transition ${
                lang === "kk"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              ҚАЗ
            </button>
            <button
              type="button"
              onClick={() => setLang("ru")}
              className={`rounded-lg px-3 py-1 text-xs font-extrabold transition ${
                lang === "ru"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              РУС
            </button>
          </div>
        </div>

        {/* Center Login Container */}
        <div className="mx-auto my-8 w-full max-w-4xl">
          <div className="grid gap-6 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-lg sm:p-8 lg:grid-cols-12">
            {/* Left Column (5 cols): Login + PIN Form */}
            <div className="flex flex-col justify-between border-b border-slate-100 pb-6 lg:col-span-5 lg:border-r lg:border-b-0 lg:pr-6 lg:pb-0">
              <div className="space-y-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <KeyRound className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-slate-900">
                    {lang === "kk" ? "Жүйеге кіру" : "Вход в систему"}
                  </h1>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                    {lang === "kk"
                      ? "Өз логиніңіз бен PIN-кодыңызды енгізіңіз немесе оң жақтан өз рөліңізді таңдап кіріңіз."
                      : "Введите логин и PIN-код вашего аккаунта или выберите свою роль справа."}
                  </p>
                </div>

                <form onSubmit={handlePinLoginSubmit} className="space-y-3 pt-2">
                  <div>
                    <label className="mb-1 block text-xs font-extrabold text-slate-700">
                      {lang === "kk" ? "Логин:" : "Логин:"}
                    </label>
                    <input
                      type="text"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="teacher / student / parent"
                      className="w-full rounded-2xl border border-slate-300 bg-slate-50/80 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-extrabold text-slate-700">
                      {lang === "kk" ? "PIN-код (Құпиясөз):" : "PIN-код (Пароль):"}
                    </label>
                    <input
                      type="password"
                      value={loginPin}
                      onChange={(e) => setLoginPin(e.target.value)}
                      placeholder="••••"
                      className="w-full rounded-2xl border border-slate-300 bg-slate-50/80 px-4 py-2.5 text-sm font-bold text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  {loginError && (
                    <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                      {loginError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loggingIn}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
                  >
                    <span>{lang === "kk" ? "Жүйеге кіру" : "Войти в систему"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              </div>

              <p className="mt-6 text-[11px] font-semibold text-slate-400">
                Tandem-Syr • {lang === "kk" ? "Логопед, Оқушы және Ата-ана тандемі" : "Тандем логопеда, ученика и родителя"}
              </p>
            </div>

            {/* Right Column (7 cols): Role Selection Cards at Login */}
            <div className="space-y-3 lg:col-span-7 lg:pl-2">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                {lang === "kk"
                  ? "Кім болып кіресіз? (Рөлді таңдау):"
                  : "Кем вы входите в систему? (Выбор роли):"}
              </div>

              <div className="space-y-3">
                {ROLE_META.map((rm) => {
                  const iconBox =
                    rm.role === "teacher"
                      ? "bg-sky-100 text-sky-700"
                      : rm.role === "student"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-indigo-100 text-indigo-700";
                  return (
                    <button
                      key={rm.role}
                      type="button"
                      disabled={loggingIn}
                      onClick={() => void handleQuickLoginAtGate(rm.role)}
                      className="group flex w-full items-start justify-between gap-4 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 text-left transition hover:border-sky-400 hover:bg-sky-50/50 hover:shadow-xs"
                    >
                      <div className="flex items-start gap-3.5">
                        <div
                          className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconBox}`}
                        >
                          {rm.role === "teacher" ? (
                            <Stethoscope className="h-5 w-5" />
                          ) : rm.role === "student" ? (
                            <GraduationCap className="h-5 w-5" />
                          ) : (
                            <HeartHandshake className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-slate-900 group-hover:text-sky-700">
                              {lang === "kk" ? rm.title_kk : rm.title_ru}
                            </span>
                            <span className="rounded-lg bg-white px-2 py-0.5 text-[10px] font-extrabold text-slate-500 ring-1 ring-slate-200">
                              {rm.username} / PIN: {rm.pin}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                            {lang === "kk" ? rm.rights_kk : rm.rights_ru}
                          </p>
                        </div>
                      </div>

                      <span className="mt-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-slate-400 shadow-2xs ring-1 ring-slate-200 transition group-hover:bg-sky-600 group-hover:text-white group-hover:ring-sky-600">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-xs font-medium text-slate-400">
          Tandem-Syr AI Platform
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. ОСНОВНОЕ ПРИЛОЖЕНИЕ (Роль уже определена при входе, в шапке нет селекта ролей)
  // =========================================================================
  const studentName = currentUser.linked_student_name || "Алихан";
  const latestPendingHw = homeworkList.find((h) => h.status === "pending") ?? null;
  const activeRoleMeta =
    ROLE_META.find((r) => r.role === currentUser.role) ?? ROLE_META[0];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800">
      {/* Full-Width 3-Column Grid Navbar: Left = Brand | Center = Role-Based Nav | Right = Account Badge + Logout + Lang */}
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
                  <rect width="36" height="36" rx="10" fill="#2563EB" />
                </svg>
              )}
              <span className="whitespace-nowrap text-xl font-black tracking-tight text-slate-900">
                Tandem-Syr
              </span>
            </div>
          </div>

          {/* 2. DEAD CENTER: Role-Aware Navigation Pill Bar */}
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

              {currentUser.role !== "student" && (
                <button
                  type="button"
                  onClick={() => setTab("dashboard")}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-extrabold transition-all ${
                    tab === "dashboard"
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {currentUser.role === "parent" ? (
                    <HeartHandshake className="h-4 w-4 shrink-0" />
                  ) : (
                    <Stethoscope className="h-4 w-4 shrink-0" />
                  )}
                  <span>
                    {currentUser.role === "parent"
                      ? lang === "kk"
                        ? "Ата-ана күнделігі"
                        : "Дневник родителя"
                      : UI_TEXT.tabs.dashboard[lang]}
                  </span>
                </button>
              )}
            </div>
          </nav>

          {/* 3. RIGHT EDGE: Current Account Badge + Logout Button + Language */}
          <div className="flex flex-nowrap items-center gap-2.5 justify-self-end">
            <div className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-xl bg-slate-100/90 px-3 text-xs font-extrabold text-slate-800">
              {currentUser.role === "teacher" ? (
                <Stethoscope className="h-3.5 w-3.5 text-sky-600" />
              ) : currentUser.role === "student" ? (
                <GraduationCap className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <HeartHandshake className="h-3.5 w-3.5 text-indigo-600" />
              )}
              <span>{currentUser.full_name}</span>
              <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-extrabold text-slate-500">
                {lang === "kk" ? activeRoleMeta.short_kk : activeRoleMeta.short_ru}
              </span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              title={lang === "kk" ? "Жүйеден шығу" : "Выйти из аккаунта"}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{lang === "kk" ? "Шығу" : "Выйти"}</span>
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
      <main className="mx-auto max-w-6xl px-6 py-6 space-y-5">
        {/* STUDENT VIEW: Friendly Teacher's Homework Banner */}
        {currentUser.role === "student" && latestPendingHw && (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50/85 px-5 py-3.5 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-black text-sky-950">
                  {lang === "kk"
                    ? `Мұғалім тапсырмасы (${latestPendingHw.teacher_name}):`
                    : `Задание от логопеда (${latestPendingHw.teacher_name}):`}
                </div>
                <div className="text-xs font-semibold text-sky-900">
                  {latestPendingHw.teacher_note}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTrainerPhoneme(latestPendingHw.target_phoneme);
                  setTrainerMinimalPairs(true);
                  setTab("trainer");
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-2xs hover:bg-sky-700"
              >
                <Mic className="h-3.5 w-3.5" />
                {lang === "kk"
                  ? `«${latestPendingHw.target_phoneme.toUpperCase()}» жаттығуы`
                  : `Звук «${latestPendingHw.target_phoneme.toUpperCase()}»`}
              </button>
              <button
                type="button"
                onClick={() => setTab("reader")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-white px-3.5 py-2 text-xs font-extrabold text-sky-900 hover:bg-sky-100/60"
              >
                <BookOpen className="h-3.5 w-3.5" />
                {latestPendingHw.reading_topic}
              </button>
              <button
                type="button"
                onClick={() => handleCompleteStudentHomework(latestPendingHw.id)}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {lang === "kk" ? "Орындадым!" : "Готово!"}
              </button>
            </div>
          </section>
        )}

        {tab === "trainer" && (
          <SpeechTrainer
            lang={lang}
            studentName={studentName}
            freeUnlock={currentUser.role === "teacher"}
            initialPhoneme={trainerPhoneme}
            initialMinimalPairsMode={trainerMinimalPairs}
          />
        )}
        {tab === "reader" && (
          <AdaptiveReader
            lang={lang}
            studentName={studentName}
            userRole={currentUser.role}
            assignedProfile={assignedProfile}
            onProfileChange={handleUpdateStudentProfile}
          />
        )}
        {tab === "breathing" && <BreathingGame lang={lang} />}
        {tab === "dashboard" && currentUser.role !== "student" && (
          <LogopedDashboard
            lang={lang}
            studentName={studentName}
            userRole={currentUser.role}
            assignedProfile={assignedProfile}
            homeworkList={homeworkList}
            onProfileChange={handleUpdateStudentProfile}
            onHomeworkUpdated={setHomeworkList}
            onStartMinimalPairs={handleStartMinimalPairsFromDashboard}
            onOpenReader={() => setTab("reader")}
          />
        )}
      </main>
    </div>
  );
}
