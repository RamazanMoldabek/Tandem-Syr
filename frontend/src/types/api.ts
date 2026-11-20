export type Lang = "kk" | "ru";

export type TargetPhoneme = "қ" | "ң" | "ғ" | "ө" | "ү" | "р";

export interface MinimalPair {
  target_word: string;
  distractor_word: string;
  phoneme: TargetPhoneme;
  distractor_phoneme: string;
  meaning_kk: string;
  meaning_ru: string;
}

export const MINIMAL_PAIRS: MinimalPair[] = [
  {
    target_word: "қар",
    distractor_word: "кар",
    phoneme: "қ",
    distractor_phoneme: "к",
    meaning_kk: "қар (ақ қар)",
    meaning_ru: "снег",
  },
  {
    target_word: "аң",
    distractor_word: "ан",
    phoneme: "ң",
    distractor_phoneme: "н",
    meaning_kk: "аң (жануар)",
    meaning_ru: "зверь",
  },
  {
    target_word: "ғалым",
    distractor_word: "галым",
    phoneme: "ғ",
    distractor_phoneme: "г",
    meaning_kk: "ғалым",
    meaning_ru: "учёный",
  },
  {
    target_word: "көл",
    distractor_word: "кол",
    phoneme: "ө",
    distractor_phoneme: "о",
    meaning_kk: "көл (су айдыны)",
    meaning_ru: "озеро",
  },
  {
    target_word: "түн",
    distractor_word: "тұн",
    phoneme: "ү",
    distractor_phoneme: "ұ",
    meaning_kk: "түн (қараңғы мезгіл)",
    meaning_ru: "ночь",
  },
  {
    target_word: "ара",
    distractor_word: "ала",
    phoneme: "р",
    distractor_phoneme: "л",
    meaning_kk: "ара (бал арасы)",
    meaning_ru: "пчела",
  },
];

// FastAPI contracts from lesson_routes.py & stt_server.py

export interface DyslexiaChar {
  char: string;
  highlight: string | null;
}

export interface DyslexiaSyllable {
  text: string;
  chars: DyslexiaChar[];
}

export type DyslexiaToken =
  | { type: "punct_or_space"; raw: string }
  | { type: "word"; raw: string; syllables: DyslexiaSyllable[] };

export interface DyslexiaMarkup {
  syllable_text: string;
  tokens: DyslexiaToken[];
}

export interface LessonCard {
  card_number: number;
  text: string;
  practice_word: string;
  question: string;
  dyslexia_markup: DyslexiaMarkup;
}

export interface AdaptedLessonPayload {
  source: string;
  model: string;
  cards: LessonCard[];
}

export interface LessonRecord {
  id: number;
  grade: number;
  subject: string;
  title: string;
  raw_text: string;
  adapted: AdaptedLessonPayload;
  created_at: string;
}

export interface GetLessonsResponse {
  lessons: LessonRecord[];
  count: number;
}

export interface AdaptLessonRequest {
  grade: number;
  subject: string;
  title: string;
  raw_text: string;
  ollama_url?: string | null;
}

export interface AdaptLessonResponse {
  id: number;
  grade: number;
  subject: string;
  title: string;
  source: string;
  cards: LessonCard[];
}

export interface WeakPhonemeStat {
  phoneme: string;
  total_attempts: number;
  failed_attempts: number;
  error_rate: number;
  avg_diff_score: number;
}

export interface WeakPhonemesResponse {
  student_name: string;
  weak_phonemes: WeakPhonemeStat[];
}

export interface EvaluateResponse {
  passed: boolean;
  reason?: "ok" | "wrong_word" | "weak_phoneme" | "too_quiet";
  target_word: string;
  phoneme: string;
  distractor_phoneme: string;
  whisper_heard: string;
  target_score: number;
  distractor_word: string;
  distractor_score: number;
  diff: number;
  target_ctc_prob: number;
  distractor_ctc_prob: number;
  ctc_margin: number;
  final_score: number;
  score?: number;
  stars?: 0 | 1 | 2 | 3;
  level?: number;
  used_live_refs: boolean;
}

export interface SpeechProgressPayload {
  student_name: string;
  target_word: string;
  phoneme: string;
  level: 1 | 2 | 3;
  score: number;
  passed?: boolean;
}

export interface SpeechProgressResponse {
  status: string;
  id: number;
  level: number;
  score: number;
  stars: 0 | 1 | 2 | 3;
}

export interface RecommendedMinimalPair {
  target_word: string;
  distractor_word: string;
  phoneme: TargetPhoneme;
  distractor_phoneme: string;
  meaning_kk: string;
  meaning_ru: string;
}

export interface WeakPhonemeRecommendation {
  phoneme: TargetPhoneme;
  distractor_phoneme: string;
  total_attempts: number;
  failed_attempts: number;
  error_rate: number;
  avg_score: number;
  avg_stars: number;
  recommended_pairs: RecommendedMinimalPair[];
}

export interface ProgressWeakPhonemesResponse {
  student_name: string;
  weak_phonemes: WeakPhonemeRecommendation[];
  level_stars?: Record<string, Record<string, number>>;
}

export interface CalibrateResponse {
  status: string;
  word: string;
  live_samples_count: number;
}

export type TtsVoice = "auto" | "live" | "aigul" | "daulet";

export interface TtsStatusResponse {
  has_live: boolean;
}

// Module B: KazLLM-8B Adaptive Reader & Progress types

export type ReaderProfileMode = "adhd" | "dyslexia" | "zpr";

export interface OcrExtractResponse {
  text: string;
  source_type: "pdf" | "image";
  page?: number;
  total_pages?: number;
  truncated?: boolean;
  char_limit?: number;
}

export interface LlmHealthResponse {
  online: boolean;
  model: string;
  base_url?: string;
  available_models?: string[];
}

export interface AdaptiveKeyword {
  word: string;
  explanation: string;
}

export interface AdaptiveCard {
  id: number;
  text: string;
  syllable_text: string;
  tokens: DyslexiaToken[];
  icon: string;
  keywords: AdaptiveKeyword[];
}

export interface AdaptiveQuizQuestion {
  question: string;
  options: string[];
  answer_index: number;
}

export interface AdaptTextResponse {
  source: "kazllm" | "local_fallback";
  model: string;
  cached?: boolean;
  cards: AdaptiveCard[];
  quiz: AdaptiveQuizQuestion[];
}

export interface ReadingProgressPayload {
  student_name: string;
  topic_title: string;
  cards_count: number;
  quiz_score: number;
  quiz_total: number;
}

export interface ProgressSummaryResponse {
  student_name: string;
  speech_total_attempts: number;
  speech_passed_attempts: number;
  speech_accuracy: number;
  completed_readings: number;
  total_cards_read: number;
  quiz_correct: number;
  quiz_total: number;
  cached_texts_count: number;
}
