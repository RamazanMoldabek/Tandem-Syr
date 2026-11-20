import type {
  AdaptLessonRequest,
  AdaptLessonResponse,
  AdaptTextResponse,
  AuthLoginResponse,
  AuthUsersResponse,
  CalibrateResponse,
  CreateHomeworkPayload,
  EvaluateResponse,
  GetLessonsResponse,
  HomeworkAssignment,
  LlmHealthResponse,
  OcrExtractResponse,
  ProgressSummaryResponse,
  ProgressWeakPhonemesResponse,
  ReaderProfileMode,
  ReadingProgressPayload,
  SpeechProgressPayload,
  SpeechProgressResponse,
  TtsStatusResponse,
  TtsVoice,
  UserRole,
  WeakPhonemesResponse,
} from "../types/api";

function resolveApiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && String(envUrl).trim()) {
    return String(envUrl).trim().replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    // В режиме разработки Vite (порт 5173) стучимся на тот же хост (localhost или LAN/Tailscale IP) порт 8001
    if (window.location.port === "5173") {
      return `${window.location.protocol}//${window.location.hostname}:8001`;
    }
    // В продакшене (когда фронтенд раздаётся самим FastAPI или через единый домен/прокси) используем относительные пути
    return "";
  }
  return "http://localhost:8001";
}

const API_BASE = resolveApiBase();

export function getTtsUrl(word: string, voice: TtsVoice = "auto"): string {
  const params = new URLSearchParams({
    word,
    voice,
  });
  return `${API_BASE}/tts?${params.toString()}`;
}

export async function getTtsStatus(word: string): Promise<TtsStatusResponse> {
  const params = new URLSearchParams({ word });
  const res = await fetch(`${API_BASE}/tts/status?${params.toString()}`);
  return handleResponse<TtsStatusResponse>(res);
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) detail = String(data.detail);
    } catch {
      // ignore json parse error
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function getLessons(): Promise<GetLessonsResponse> {
  const res = await fetch(`${API_BASE}/lessons`);
  return handleResponse<GetLessonsResponse>(res);
}

export async function adaptLesson(payload: AdaptLessonRequest): Promise<AdaptLessonResponse> {
  const res = await fetch(`${API_BASE}/lessons/adapt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<AdaptLessonResponse>(res);
}

export async function getStudentWeakPhonemes(
  studentName: string
): Promise<WeakPhonemesResponse> {
  const encoded = encodeURIComponent(studentName.trim() || "Алихан");
  const res = await fetch(`${API_BASE}/students/${encoded}/weak-phonemes`);
  return handleResponse<WeakPhonemesResponse>(res);
}

export async function evaluatePronunciation(
  audioBlob: Blob,
  targetWord: string,
  options?: {
    phoneme?: string;
    distractorWord?: string;
    level?: number;
    studentName?: string;
  }
): Promise<EvaluateResponse> {
  const formData = new FormData();
  const ext = audioBlob.type.includes("webm")
    ? "webm"
    : audioBlob.type.includes("ogg")
      ? "ogg"
      : audioBlob.type.includes("mp4")
        ? "m4a"
        : "wav";
  formData.append("file", audioBlob, `recording.${ext}`);
  formData.append("target_word", targetWord);
  if (options?.phoneme) formData.append("phoneme", options.phoneme);
  if (options?.distractorWord) formData.append("distractor_word", options.distractorWord);
  if (options?.level) formData.append("level", String(options.level));
  if (options?.studentName) formData.append("student_name", options.studentName);

  const res = await fetch(`${API_BASE}/evaluate`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<EvaluateResponse>(res);
}

export async function recordSpeechProgress(
  payload: SpeechProgressPayload
): Promise<SpeechProgressResponse> {
  const res = await fetch(`${API_BASE}/progress/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<SpeechProgressResponse>(res);
}

export async function getProgressWeakPhonemes(
  studentName?: string
): Promise<ProgressWeakPhonemesResponse> {
  const params = new URLSearchParams();
  if (studentName?.trim()) {
    params.set("student_name", studentName.trim());
  }
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${API_BASE}/progress/weak-phonemes${qs}`);
  return handleResponse<ProgressWeakPhonemesResponse>(res);
}

export async function calibrateReference(
  audioBlob: Blob,
  word: string
): Promise<CalibrateResponse> {
  const formData = new FormData();
  const ext = audioBlob.type.includes("webm")
    ? "webm"
    : audioBlob.type.includes("ogg")
      ? "ogg"
      : audioBlob.type.includes("mp4")
        ? "m4a"
        : "wav";
  formData.append("file", audioBlob, `calibration.${ext}`);
  formData.append("word", word);

  const res = await fetch(`${API_BASE}/calibrate`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<CalibrateResponse>(res);
}

export async function getLlmHealth(): Promise<LlmHealthResponse> {
  const res = await fetch(`${API_BASE}/llm/health`);
  return handleResponse<LlmHealthResponse>(res);
}

export async function extractTextFromFile(
  file: File,
  page = 1
): Promise<OcrExtractResponse> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("page", String(page));
  const res = await fetch(`${API_BASE}/ocr/extract`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<OcrExtractResponse>(res);
}

export async function adaptTextForReader(
  text: string,
  mode = "adhd",
  title?: string
): Promise<AdaptTextResponse> {
  const res = await fetch(`${API_BASE}/adapt-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode, title }),
  });
  return handleResponse<AdaptTextResponse>(res);
}

export async function recordReadingProgress(
  payload: ReadingProgressPayload
): Promise<{ status: string; id: number }> {
  const res = await fetch(`${API_BASE}/progress/reading`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<{ status: string; id: number }>(res);
}

export async function getProgressSummary(
  studentName?: string
): Promise<ProgressSummaryResponse> {
  const params = new URLSearchParams();
  if (studentName?.trim()) {
    params.set("student_name", studentName.trim());
  }
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${API_BASE}/progress/summary${qs}`);
  return handleResponse<ProgressSummaryResponse>(res);
}

export async function getAuthUsers(): Promise<AuthUsersResponse> {
  const res = await fetch(`${API_BASE}/auth/users`);
  return handleResponse<AuthUsersResponse>(res);
}

export async function loginByRole(role: UserRole): Promise<AuthLoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return handleResponse<AuthLoginResponse>(res);
}

export async function loginByCredentials(
  username: string,
  pinCode: string
): Promise<AuthLoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, pin_code: pinCode }),
  });
  return handleResponse<AuthLoginResponse>(res);
}

export async function updateStudentAdaptiveProfile(
  adaptiveProfile: ReaderProfileMode
): Promise<{ status: string; adaptive_profile: ReaderProfileMode }> {
  const res = await fetch(`${API_BASE}/auth/student-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adaptive_profile: adaptiveProfile }),
  });
  return handleResponse<{ status: string; adaptive_profile: ReaderProfileMode }>(res);
}

export async function getHomeworkList(): Promise<{ homework: HomeworkAssignment[] }> {
  const res = await fetch(`${API_BASE}/homework`);
  return handleResponse<{ homework: HomeworkAssignment[] }>(res);
}

export async function createHomework(
  payload: CreateHomeworkPayload
): Promise<{ status: string; homework: HomeworkAssignment }> {
  const res = await fetch(`${API_BASE}/homework`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<{ status: string; homework: HomeworkAssignment }>(res);
}

export async function completeHomework(
  homeworkId: number
): Promise<{ status: string; homework: HomeworkAssignment }> {
  const res = await fetch(`${API_BASE}/homework/${homeworkId}/complete`, {
    method: "POST",
  });
  return handleResponse<{ status: string; homework: HomeworkAssignment }>(res);
}
