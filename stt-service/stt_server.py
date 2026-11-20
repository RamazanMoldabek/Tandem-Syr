import asyncio
import difflib
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Пробрасываем пути к NVIDIA CUDA DLL из виртуального окружения для Windows
venv_base = Path(sys.prefix)
nvidia_bins = [
    venv_base / "Lib" / "site-packages" / "nvidia" / "cublas" / "bin",
    venv_base / "Lib" / "site-packages" / "nvidia" / "cudnn" / "bin",
]
for bin_path in nvidia_bins:
    if bin_path.exists():
        os.environ["PATH"] = str(bin_path) + os.pathsep + os.environ["PATH"]
        if hasattr(os, "add_dll_directory"):
            os.add_dll_directory(str(bin_path))

# Кэшируем веса на диск D:
os.environ["HF_HOME"] = "D:/models/huggingface"

ENV_FILE_PATH = Path(__file__).parent / ".env"


def _load_env_file(env_path: Path = ENV_FILE_PATH) -> None:
    try:
        from dotenv import load_dotenv  # type: ignore

        load_dotenv(dotenv_path=env_path, override=True)
    except Exception:
        pass

    if env_path.exists():
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ[k.strip()] = v.strip().strip('"').strip("'")


_load_env_file()


def get_kazllm_config() -> tuple[str, str]:
    """Читает актуальные KAZLLM_BASE_URL и KAZLLM_MODEL из .env без необходимости перезапуска сервера."""
    _load_env_file()
    base_url = os.getenv("KAZLLM_BASE_URL", "http://127.0.0.1:11434").strip().rstrip("/")
    model_name = os.getenv("KAZLLM_MODEL", "kazllm:8b").strip()
    return base_url, model_name


import av
import edge_tts
import librosa
import numpy as np
import soundfile as sf
import torch
import torch.nn.functional as F
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from faster_whisper import WhisperModel
from pydantic import BaseModel, Field
from transformers import AutoProcessor, Wav2Vec2ForCTC

from lesson_engine import log_speech_attempt
from lesson_routes import router as lesson_router
from syllable_parser import format_for_dyslexia

try:
    import httpx  # type: ignore

    HAS_HTTPX = True
except Exception:
    HAS_HTTPX = False

app = FastAPI(title="Tandem-Syr STT & Adaptive Learning Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lesson_router)

# ---------------------------------------------------------------------------
# Инициализация SQLite базы прогресса и кэша адаптации (tandem_progress.db)
# ---------------------------------------------------------------------------
PROGRESS_DB_PATH = Path(__file__).parent / "tandem_progress.db"


def _get_progress_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(PROGRESS_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_progress_db() -> None:
    with _get_progress_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS adapted_texts_cache (
                text_hash TEXT PRIMARY KEY,
                response_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS speech_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_name TEXT NOT NULL,
                target_word TEXT NOT NULL,
                phoneme TEXT NOT NULL,
                level INTEGER NOT NULL DEFAULT 1,
                passed INTEGER NOT NULL,
                final_score REAL NOT NULL,
                stars INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        for col_sql in (
            "ALTER TABLE speech_progress ADD COLUMN level INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE speech_progress ADD COLUMN stars INTEGER NOT NULL DEFAULT 0",
        ):
            try:
                conn.execute(col_sql)
            except sqlite3.OperationalError:
                pass
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reading_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_name TEXT NOT NULL,
                topic_title TEXT NOT NULL,
                cards_count INTEGER NOT NULL,
                quiz_score INTEGER NOT NULL,
                quiz_total INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                pin_code TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL,
                adaptive_profile TEXT NOT NULL DEFAULT 'dyslexia',
                grade INTEGER NOT NULL DEFAULT 2,
                linked_student_name TEXT NOT NULL DEFAULT 'Алихан',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS homework_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_name TEXT NOT NULL DEFAULT 'Алихан',
                teacher_name TEXT NOT NULL,
                target_phoneme TEXT NOT NULL,
                target_level INTEGER NOT NULL DEFAULT 2,
                adaptive_profile TEXT NOT NULL DEFAULT 'dyslexia',
                reading_topic TEXT NOT NULL,
                teacher_note TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL
            )
            """
        )

        # Предзаполнение 3 ролей (Учитель/Админ, Ученик, Родитель), если таблица пуста
        existing_users = conn.execute("SELECT COUNT(*) AS cnt FROM users").fetchone()["cnt"]
        now_iso = datetime.now(timezone.utc).isoformat()
        if existing_users == 0:
            seed_users = [
                (
                    "teacher",
                    "1111",
                    "Айжан Мұратқызы",
                    "teacher",
                    "dyslexia",
                    2,
                    "Алихан",
                    now_iso,
                ),
                (
                    "student",
                    "2222",
                    "Алихан",
                    "student",
                    "dyslexia",
                    2,
                    "Алихан",
                    now_iso,
                ),
                (
                    "parent",
                    "3333",
                    "Марат (Ата-ана)",
                    "parent",
                    "dyslexia",
                    2,
                    "Алихан",
                    now_iso,
                ),
            ]
            conn.executemany(
                """
                INSERT INTO users (
                    username, pin_code, full_name, role, adaptive_profile, grade, linked_student_name, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                seed_users,
            )

        existing_hw = conn.execute("SELECT COUNT(*) AS cnt FROM homework_assignments").fetchone()["cnt"]
        if existing_hw == 0:
            conn.execute(
                """
                INSERT INTO homework_assignments (
                    student_name, teacher_name, target_phoneme, target_level,
                    adaptive_profile, reading_topic, teacher_note, status, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "Алихан",
                    "Айжан Мұратқызы",
                    "қ",
                    2,
                    "dyslexia",
                    "Қазақстан табиғаты",
                    "Үйде «Қ» мен «К» дыбыстарының минималды жұптарын 5 минут қайталап, «Қазақстан табиғаты» мәтінін буынға бөліп оқып шығыңыздар.",
                    "pending",
                    now_iso,
                ),
            )
        conn.commit()


init_progress_db()

# ---------------------------------------------------------------------------
# Загрузка GPU-моделей Whisper и MMS-1B
# ---------------------------------------------------------------------------
print("Загрузка faster-whisper (large-v3-turbo) на GPU...")
model = WhisperModel(
    "large-v3-turbo",
    device="cuda",
    compute_type="float16",
    download_root="D:/models/whisper",
)
print("Модель Whisper готова к работе!")

MMS_MODEL_ID = "facebook/mms-1b-all"
REF_PATH = Path(__file__).parent / "reference_embeddings.pt"

print(f"Загрузка {MMS_MODEL_ID} (адаптер 'kaz') на GPU...")
mms_processor = AutoProcessor.from_pretrained(MMS_MODEL_ID)
mms_processor.tokenizer.set_target_lang("kaz")
mms_model = Wav2Vec2ForCTC.from_pretrained(
    MMS_MODEL_ID,
    torch_dtype=torch.float16,
)
mms_model.load_adapter("kaz")
mms_model.to("cuda")
mms_model.eval()
print("Модель MMS-1B-all готова к работе!")

PHONEME_CONTRAST = {
    "қ": "к",
    "ң": "н",
    "ғ": "г",
    "ө": "о",
    "ү": "ұ",
    "р": "л",
}

mms_vocab = mms_processor.tokenizer.get_vocab()

reference_db = None
if REF_PATH.exists():
    reference_db = torch.load(str(REF_PATH), map_location="cpu", weights_only=False)
    reference_db.setdefault("live_embeddings", {})
    print(
        f"Загружены эталонные эмбеддинги: {REF_PATH} "
        f"({len(reference_db.get('embeddings', {}))} синтетических, "
        f"{len(reference_db.get('live_embeddings', {}))} живых слов)"
    )
else:
    print(f"[WARN] Файл эталонов не найден: {REF_PATH}")

REF_AUDIO_DIR = Path(__file__).parent / "reference_audio"
REF_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

TTS_CACHE_DIR = Path(__file__).parent / "tts_cache"
TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _safe_word_slug(word: str) -> str:
    return re.sub(r'[\\/:*?"<>|\s]+', "_", word.strip().lower())


def _get_contrast_phoneme(target_word: str, distractor_word: str, target_phoneme: str) -> str:
    if target_phoneme in PHONEME_CONTRAST:
        return PHONEME_CONTRAST[target_phoneme]
    for ch_t, ch_d in zip(target_word.lower(), distractor_word.lower()):
        if ch_t != ch_d:
            return ch_d
    return ""


def _get_word_refs(word: str) -> tuple[torch.Tensor, bool]:
    """Возвращает эталонные эмбеддинги слова с приоритетом живых записей над синтетическими."""
    live = reference_db.get("live_embeddings", {})
    if word in live and len(live[word]) > 0:
        return live[word], True
    return reference_db["embeddings"][word], False


def load_audio_16k(path: str) -> np.ndarray:
    """Декодирует любой аудиоконтейнер (.m4a, .webm, .ogg, .mp3, .wav) в 1D float32 @ 16kHz через PyAV."""
    resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)
    chunks: list[np.ndarray] = []

    with av.open(path) as container:
        for frame in container.decode(audio=0):
            for resampled in resampler.resample(frame):
                arr = resampled.to_ndarray()
                chunks.append(arr.reshape(-1))
        for resampled in resampler.resample(None):
            arr = resampled.to_ndarray()
            chunks.append(arr.reshape(-1))

    if not chunks:
        return np.zeros(0, dtype=np.float32)

    return np.concatenate(chunks).astype(np.float32, copy=False)


def _extract_features(waveform: np.ndarray) -> tuple[torch.Tensor, torch.Tensor]:
    """Извлекает L2-нормализованный 3-сегментный эмбеддинг (hidden_states[-2]) и CTC-логиты."""
    inputs = mms_processor(waveform, sampling_rate=16000, return_tensors="pt")
    input_values = inputs.input_values.to(device="cuda", dtype=torch.float16)
    with torch.no_grad():
        outputs = mms_model(input_values=input_values, output_hidden_states=True)
        hidden = outputs.hidden_states[-2].squeeze(0).float()
        logits = outputs.logits.squeeze(0).float().cpu()
    segments = torch.tensor_split(hidden, 3, dim=0)
    pooled = torch.cat([seg.mean(dim=0) for seg in segments], dim=0)
    emb = F.normalize(pooled, p=2, dim=0).cpu()
    return emb, logits


def _compute_ctc_phoneme_scores(
    logits: torch.Tensor,
    target_phoneme: str,
    distractor_phoneme: str,
) -> tuple[float, float, float]:
    """Считает max-вероятность целевой и контрастной фонем по кадрам CTC-логитов."""
    probs = F.softmax(logits, dim=-1)
    t_id = mms_vocab.get(target_phoneme.lower())
    d_id = mms_vocab.get(distractor_phoneme.lower())

    target_prob = float(probs[:, t_id].max().item()) if t_id is not None else 0.0
    distractor_prob = float(probs[:, d_id].max().item()) if d_id is not None else 0.0
    ctc_margin = round(target_prob - distractor_prob, 4)
    return round(target_prob, 4), round(distractor_prob, 4), ctc_margin


@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    hint_words: str = Form(default=""),
):
    suffix = Path(file.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        prompt = (
            f"Қазақша сөздер: {hint_words}"
            if hint_words
            else "Қазақ тіліндегі сөйлемдер мен сөздер."
        )

        segments, info = model.transcribe(
            tmp_path,
            language="kk",
            beam_size=5,
            vad_filter=True,
            word_timestamps=True,
            initial_prompt=prompt,
        )

        words_list = []
        full_text = []

        for seg in segments:
            full_text.append(seg.text.strip())
            if seg.words:
                for w in seg.words:
                    words_list.append(
                        {
                            "word": w.word.strip(),
                            "start": round(w.start, 2),
                            "end": round(w.end, 2),
                            "confidence": round(w.probability, 3),
                        }
                    )

        return {
            "text": " ".join(full_text),
            "language": info.language,
            "duration": round(info.duration, 2),
            "words": words_list,
        }
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _calculate_stars(score: float) -> int:
    if score >= 0.85:
        return 3
    if score >= 0.65:
        return 2
    if score >= 0.45:
        return 1
    return 0


def _resolve_pair_and_refs(
    target_word: str,
    phoneme_hint: Optional[str] = None,
    distractor_hint: Optional[str] = None,
) -> tuple[str, str, str, torch.Tensor, torch.Tensor, bool]:
    """
    Находит эталонные эмбеддинги для любого слога, слова, чистоговорки или минимальной пары.
    Если точного слова нет в reference_db, использует эталонную пару соответствующей фонемы.
    """
    target_norm = target_word.strip().lower()
    for t_w, d_w, ph in reference_db["pairs"]:
        if t_w.lower() == target_norm:
            t_refs, t_live = _get_word_refs(t_w)
            d_refs, d_live = _get_word_refs(d_w)
            return t_w, d_w, ph, t_refs, d_refs, (t_live and d_live)

    # Определяем целевую фонему
    detected_ph = (phoneme_hint or "").strip().lower()
    if detected_ph not in PHONEME_CONTRAST:
        for ch in target_norm:
            if ch in PHONEME_CONTRAST:
                detected_ph = ch
                break
    if detected_ph not in PHONEME_CONTRAST:
        detected_ph = "қ"

    contrast_ph = PHONEME_CONTRAST[detected_ph]
    d_word = (
        distractor_hint.strip().lower()
        if distractor_hint and distractor_hint.strip()
        else target_norm.replace(detected_ph, contrast_ph)
    )
    if d_word == target_norm:
        d_word = f"{contrast_ph}"

    # Ищем прототипную пару для этой фонемы в reference_db
    proto_t, proto_d = reference_db["pairs"][0][0], reference_db["pairs"][0][1]
    for t_w, d_w, ph in reference_db["pairs"]:
        if ph.lower() == detected_ph:
            proto_t, proto_d = t_w, d_w
            break

    live_map = reference_db.get("live_embeddings", {})
    emb_map = reference_db.get("embeddings", {})

    if target_norm in live_map and len(live_map[target_norm]) > 0:
        t_refs, t_live = live_map[target_norm], True
    elif target_norm in emb_map:
        t_refs, t_live = emb_map[target_norm], False
    else:
        t_refs, t_live = _get_word_refs(proto_t)

    if d_word in live_map and len(live_map[d_word]) > 0:
        d_refs, d_live = live_map[d_word], True
    elif d_word in emb_map:
        d_refs, d_live = emb_map[d_word], False
    else:
        d_refs, d_live = _get_word_refs(proto_d)

    return target_word.strip(), d_word, detected_ph, t_refs, d_refs, (t_live and d_live)


@app.post("/evaluate")
async def evaluate_pronunciation(
    file: UploadFile = File(...),
    target_word: str = Form(...),
    student_name: str = Form(default="Алихан"),
    phoneme: Optional[str] = Form(default=None),
    distractor_word: Optional[str] = Form(default=None),
    level: int = Form(default=1),
):
    if reference_db is None:
        raise HTTPException(
            status_code=503,
            detail="Reference embeddings not loaded. Run build_references.py first.",
        )

    t_word, d_word, phoneme_resolved, target_refs, distractor_refs, used_live_refs = (
        _resolve_pair_and_refs(target_word, phoneme, distractor_word)
    )
    phoneme = phoneme_resolved
    level_clamped = max(1, min(3, int(level or 1)))
    suffix = Path(file.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        # 1. Получаем таймкоды слова через Whisper с контрастным промптом
        segments, _ = model.transcribe(
            tmp_path,
            language="kk",
            beam_size=5,
            vad_filter=True,
            word_timestamps=True,
            initial_prompt=f"{t_word}, {d_word}",
        )

        heard_parts = []
        word_span = None
        for seg in segments:
            heard_parts.append(seg.text.strip())
            if seg.words:
                for w in seg.words:
                    if word_span is None:
                        word_span = (w.start, w.end)
                    w_clean = re.sub(r"[^\w]", "", w.word.strip().lower())
                    if w_clean in (t_word.lower(), d_word.lower()):
                        word_span = (w.start, w.end)
                        break

        whisper_heard = " ".join(heard_parts).strip()
        distractor_phoneme = _get_contrast_phoneme(t_word, d_word, phoneme)

        # 2. Загружаем аудио, вырезаем сегмент слова и обрезаем тишину (Trim Silence)
        waveform = load_audio_16k(tmp_path)
        sr = 16000

        if word_span is not None and len(t_word.split()) <= 2:
            start_sample = max(0, int((word_span[0] - 0.1) * sr))
            end_sample = min(len(waveform), int((word_span[1] + 0.1) * sr))
            if end_sample > start_sample:
                waveform = waveform[start_sample:end_sample]

        if len(waveform) > 0:
            trimmed, _ = librosa.effects.trim(waveform, top_db=25)
            if len(trimmed) > 0:
                waveform = trimmed

        max_amp = float(np.max(np.abs(waveform))) if len(waveform) > 0 else 0.0
        duration_sec = len(waveform) / sr

        if duration_sec < 0.12 or max_amp < 0.015:
            return {
                "passed": False,
                "reason": "too_quiet",
                "target_word": t_word,
                "phoneme": phoneme,
                "distractor_phoneme": distractor_phoneme,
                "whisper_heard": whisper_heard,
                "target_score": 0.0,
                "distractor_word": d_word,
                "distractor_score": 0.0,
                "diff": 0.0,
                "target_ctc_prob": 0.0,
                "distractor_ctc_prob": 0.0,
                "ctc_margin": 0.0,
                "final_score": 0.0,
                "score": 0.0,
                "stars": 0,
                "level": level_clamped,
                "used_live_refs": False,
            }

        # 3. Вычисляем акустический эмбеддинг и CTC-логиты через MMS-1B
        emb, logits = _extract_features(waveform)

        target_score = float(torch.matmul(target_refs, emb).max().item())
        distractor_score = float(torch.matmul(distractor_refs, emb).max().item())
        diff = round(target_score - distractor_score, 4)

        target_ctc_prob, distractor_ctc_prob, ctc_margin = _compute_ctc_phoneme_scores(
            logits, phoneme, distractor_phoneme
        )

        final_score = round(0.6 * ctc_margin + 0.4 * diff, 4)

        # 4. Лексический гейт через Whisper
        whisper_norm = re.sub(r"[^\w\s]", "", whisper_heard.lower()).strip()
        whisper_tokens = [tok for tok in whisper_norm.split() if tok]

        t_lower = re.sub(r"[^\w\s]", "", t_word.lower()).strip()
        d_lower = re.sub(r"[^\w\s]", "", d_word.lower()).strip()

        def _best_sim(ref: str) -> float:
            candidates = [whisper_norm] + whisper_tokens if whisper_norm else []
            if not candidates:
                return 0.0
            return max(difflib.SequenceMatcher(None, c, ref).ratio() for c in candidates)

        sim_target = _best_sim(t_lower)
        sim_distractor = _best_sim(d_lower)

        heard_distractor = (
            d_lower in whisper_tokens or whisper_norm == d_lower
        ) and (t_lower not in whisper_tokens and whisper_norm != t_lower)
        min_sim_threshold = 0.35 if len(t_lower) <= 2 else 0.48
        heard_unrelated = max(sim_target, sim_distractor) < min_sim_threshold

        if heard_distractor or heard_unrelated:
            passed = False
            reason = "wrong_word"
        else:
            ctc_ok = (ctc_margin > 0.0008) or (target_ctc_prob > distractor_ctc_prob * 1.15)
            diff_ok = (diff > 0.01) if used_live_refs else (diff > -0.015)

            if ctc_ok and diff_ok:
                passed = True
                reason = "ok"
            else:
                passed = False
                reason = "weak_phoneme"

        # Нормированный балл 0..1 и расчёт звёзд (1..3)
        raw_norm_score = min(1.0, max(0.0, 0.55 * target_score + 0.45 * min(1.0, sim_target + max(0.0, ctc_margin))))
        if passed:
            norm_score = round(max(0.65, raw_norm_score), 3)
        elif reason == "weak_phoneme":
            norm_score = round(min(0.62, max(0.45, raw_norm_score * 0.75)), 3)
        else:
            norm_score = round(min(0.42, raw_norm_score * 0.5), 3)

        stars = _calculate_stars(norm_score)

        # Логируем попытку в обе базы (tandem_syr.db и tandem_progress.db)
        try:
            log_speech_attempt(
                student_name,
                {
                    "target_word": t_word,
                    "phoneme": phoneme,
                    "passed": passed,
                    "diff_score": diff,
                },
            )
            with _get_progress_conn() as conn:
                conn.execute(
                    """
                    INSERT INTO speech_progress (
                        student_name, target_word, phoneme, level, passed, final_score, stars, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        student_name,
                        t_word,
                        phoneme,
                        level_clamped,
                        1 if passed else 0,
                        norm_score,
                        stars,
                        datetime.now(timezone.utc).isoformat(),
                    ),
                )
                conn.commit()
        except Exception:
            pass

        return {
            "passed": passed,
            "reason": reason,
            "target_word": t_word,
            "phoneme": phoneme,
            "distractor_phoneme": distractor_phoneme,
            "whisper_heard": whisper_heard,
            "target_score": round(target_score, 4),
            "distractor_word": d_word,
            "distractor_score": round(distractor_score, 4),
            "diff": diff,
            "target_ctc_prob": target_ctc_prob,
            "distractor_ctc_prob": distractor_ctc_prob,
            "ctc_margin": ctc_margin,
            "final_score": final_score,
            "score": norm_score,
            "stars": stars,
            "level": level_clamped,
            "used_live_refs": used_live_refs,
        }
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@app.post("/calibrate")
async def calibrate_reference(
    file: UploadFile = File(...),
    word: str = Form(...),
):
    global reference_db
    word_norm = word.strip().lower()
    if not word_norm:
        raise HTTPException(status_code=400, detail="Word must not be empty.")

    suffix = Path(file.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        waveform = load_audio_16k(tmp_path)
        sr = 16000

        if len(waveform) > 0:
            _, idx = librosa.effects.trim(waveform, top_db=28)
            pad = int(0.08 * sr)
            start_i = max(0, int(idx[0]) - pad)
            end_i = min(len(waveform), int(idx[1]) + pad)
            clean_wav = waveform[start_i:end_i] if end_i > start_i else waveform
        else:
            clean_wav = waveform

        peak = float(np.max(np.abs(clean_wav))) if len(clean_wav) > 0 else 0.0
        if peak > 1e-6:
            clean_wav = (clean_wav / peak * 0.9).astype(np.float32)

        word_slug = _safe_word_slug(word_norm)
        ref_wav_path = REF_AUDIO_DIR / f"{word_slug}.wav"
        sf.write(str(ref_wav_path), clean_wav, sr)

        for old_cache in TTS_CACHE_DIR.glob(f"*_{word_slug}.*"):
            old_cache.unlink(missing_ok=True)

        emb, _ = _extract_features(clean_wav)

        if reference_db is None:
            reference_db = {"pairs": [], "embeddings": {}, "live_embeddings": {}}
        reference_db.setdefault("live_embeddings", {})

        existing = reference_db["live_embeddings"].get(word_norm)
        if existing is not None and len(existing) > 0:
            reference_db["live_embeddings"][word_norm] = torch.cat(
                [existing, emb.unsqueeze(0)], dim=0
            )
        else:
            reference_db["live_embeddings"][word_norm] = emb.unsqueeze(0)

        torch.save(reference_db, str(REF_PATH))
        live_count = int(reference_db["live_embeddings"][word_norm].shape[0])

        return {
            "status": "ok",
            "word": word_norm,
            "live_samples_count": live_count,
        }
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@app.get("/tts/status")
async def tts_status(word: str):
    word_slug = _safe_word_slug(word)
    if not word_slug:
        raise HTTPException(status_code=400, detail="Parameter 'word' must not be empty.")
    live_wav = REF_AUDIO_DIR / f"{word_slug}.wav"
    return {"has_live": live_wav.exists()}


@app.get("/tts")
async def synthesize_tts(word: str, voice: str = "auto"):
    clean_word = word.strip()
    if not clean_word:
        raise HTTPException(status_code=400, detail="Parameter 'word' must not be empty.")

    word_slug = _safe_word_slug(clean_word)[:64]
    voice_mode = voice.strip().lower() or "auto"
    live_wav = REF_AUDIO_DIR / f"{word_slug}.wav"

    if voice_mode == "live":
        if not live_wav.exists():
            raise HTTPException(status_code=404, detail="live_not_found")
        return FileResponse(
            str(live_wav),
            media_type="audio/wav",
            headers={"X-TTS-Source": "live-speaker"},
        )

    if voice_mode == "auto" and live_wav.exists():
        return FileResponse(
            str(live_wav),
            media_type="audio/wav",
            headers={"X-TTS-Source": "live-speaker"},
        )

    voice_key = "daulet" if voice_mode == "daulet" else "aigul"
    selected_voice = "kk-KZ-DauletNeural" if voice_key == "daulet" else "kk-KZ-AigulNeural"
    cache_hash = hashlib.md5(clean_word.encode("utf-8")).hexdigest()[:10]
    cache_wav = (
        TTS_CACHE_DIR / f"{voice_key}_{word_slug}.wav"
        if len(clean_word) <= 24
        else TTS_CACHE_DIR / f"{voice_key}_{cache_hash}.wav"
    )

    if not cache_wav.exists():
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
            tmp_mp3 = Path(tmp.name)

        try:
            tts_text = clean_word if clean_word.endswith((".", "!", "?")) else f"{clean_word}."
            communicate = edge_tts.Communicate(
                text=tts_text,
                voice=selected_voice,
                rate="-10%",
            )
            await communicate.save(str(tmp_mp3))

            wav = load_audio_16k(str(tmp_mp3))
            if len(wav) > 0:
                _, idx = librosa.effects.trim(wav, top_db=28)
                pad = int(0.06 * 16000)
                start_i = max(0, int(idx[0]) - pad)
                end_i = min(len(wav), int(idx[1]) + pad)
                wav = wav[start_i:end_i] if end_i > start_i else wav

            peak = float(np.max(np.abs(wav))) if len(wav) > 0 else 0.0
            if peak > 1e-6:
                wav = (wav / peak * 0.9).astype(np.float32)

            sf.write(str(cache_wav), wav, 16000)
        finally:
            tmp_mp3.unlink(missing_ok=True)

    return FileResponse(
        str(cache_wav),
        media_type="audio/wav",
        headers={"X-TTS-Source": "edge-tts"},
    )


# ---------------------------------------------------------------------------
# Модуль В: OCR (Фото учебников и PDF) + Подключение к KazLLM-8B (Ollama)
# ---------------------------------------------------------------------------

MAX_OCR_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 МБ
MAX_OCR_TEXT_CHARS = 1500  # Лимит символов с одной страницы для быстрой адаптации в KazLLM-8B
EASYOCR_MODELS_DIR = Path("D:/models/easyocr")

_easyocr_reader = None


def _get_easyocr_reader():
    """
    Ленивая инициализация EasyOCR(['ru', 'uk', 'mn', 'tjk']) строго на CPU (gpu=False) с хранением весов на диске D:.
    В EasyOCR все кириллические языки используют одну модель `cyrillic_g2.pth`, а комбинация
    ['ru', 'uk', 'mn', 'tjk'] разблокирует в её словаре специфические казахские буквы Іі, Ғғ, Ққ, Үү, Өө.
    """
    global _easyocr_reader
    if _easyocr_reader is None:
        try:
            import easyocr  # type: ignore
        except ImportError as exc:
            raise HTTPException(
                status_code=503,
                detail="Библиотека easyocr не установлена (pip install easyocr pymupdf).",
            ) from exc

        try:
            from PIL import Image  # type: ignore

            if not hasattr(Image, "ANTIALIAS") and hasattr(Image, "Resampling"):
                setattr(Image, "ANTIALIAS", Image.Resampling.LANCZOS)
        except Exception:
            pass

        EASYOCR_MODELS_DIR.mkdir(parents=True, exist_ok=True)
        print(f"Инициализация EasyOCR (cyrillic_g2 + KZ chars, gpu=False, dir={EASYOCR_MODELS_DIR})...")
        _easyocr_reader = easyocr.Reader(
            ["ru", "uk", "mn", "tjk"],
            gpu=False,
            model_storage_directory=str(EASYOCR_MODELS_DIR),
        )
    return _easyocr_reader


def _downscale_image_bytes(raw_bytes: bytes, max_side: int = 1280) -> bytes:
    """Уменьшает огромные фото с телефона до max_side px по длинной стороне для быстрого OCR на CPU."""
    try:
        import io
        from PIL import Image  # type: ignore

        with Image.open(io.BytesIO(raw_bytes)) as img:
            img_rgb = img.convert("RGB")
            w, h = img_rgb.size
            if max(w, h) > max_side:
                scale = max_side / float(max(w, h))
                new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
                img_rgb = img_rgb.resize(new_size)
            out = io.BytesIO()
            img_rgb.save(out, format="JPEG", quality=88)
            return out.getvalue()
    except Exception:
        return raw_bytes


# Только базовые частотные служебные слова и союзы казахского языка,
# в которых EasyOCR cyrillic_g2 теряет буквы ә/ө/ұ из-за отсутствия их в словаре модели:
KZ_COMMON_FUNCTION_WORDS: dict[str, str] = {
    "бүл": "бұл",
    "жэне": "және",
    "жоне": "және",
    "эрі": "әрі",
    "өрі": "әрі",
    "дэл": "дәл",
    "коп": "көп",
    "соз": "сөз",
}


def _postprocess_kazakh_ocr(raw_text: str) -> str:
    """
    Универсальный лингвистический пост-процессор для EasyOCR (cyrillic_g2) без хардкода под конкретный текст.
    Восстанавливает казахские буквы (ң, ә, ұ, ғ, қ, ө), которые cyrillic_g2 путает с русскими,
    опираясь исключительно на фонетические законы казахского языка и сингармонизм (Үндестік заңы):
    1. Склейка переносов строк (включая случаи, когда дефис на конце строки был пропущен OCR перед суффиксом).
    2. ц -> ң (в исконно казахских словах и окончаниях), э -> ә.
    3. Закон сингармонизма (Үндестік заңы):
       - в твёрдых словах (с гласными а, о, ұ, ы и согласными қ, ғ) буквы ү -> ұ, г -> ғ;
       - в мягких словах (с гласными е, і, ә, ү, ө) буква о в первом слоге -> ө (сойлеу -> сөйлеу, коркем -> көркем),
         а в сочетании с қ/ғ буква к -> қ (окулық -> оқулық, үлттык -> ұлттық).
    """
    t = re.sub(r"-\s*\r?\n\s*", "", raw_text)
    t = re.sub(r"\s+", " ", t).strip()

    # 1. Склейка переносов через дефис и пробел (кроме редупликаций вроде қа-қа, көп-көп)
    t = re.sub(
        r"([а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]{2,})-\s+([а-яәіңғүұқөһ]{2,})",
        lambda m: (
            m.group(1) + m.group(2)
            if m.group(1).lower() != m.group(2).lower()
            else m.group(0)
        ),
        t,
    )
    # Склейка оторванных при переносе строки суффиксов (-лығын/-лігін/-лық/-лік/-дағы/-дегі), если OCR потерял дефис
    t = re.sub(
        r"([а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]{2,})\s+(лы[ғгқк]ы?н|лі[гк]і?н|лы[қк]|лі[кг])\b",
        r"\1\2",
        t,
    )

    # 2. Восстановление кавычек «...» из < и >
    t = re.sub(r"<([а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ])", r"«\1", t)
    t = re.sub(r"([а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ])\s*>", r"\1»", t)

    # 3. Универсальная замена ц -> ң (кроме заимствований с ци/це)
    t = re.sub(r"ц(?![иеИЕ])", "ң", t)
    t = re.sub(r"Ц(?![иеИЕ])", "Ң", t)

    # 4. Универсальная замена э -> ә в казахских словах
    t = re.sub(r"\bэ(?=[а-яәіңғүұқөһ])", "ә", t)
    t = re.sub(r"\bЭ(?=[а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ])", "Ә", t)
    t = re.sub(r"(?<=[а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ])э", "ә", t)

    # 5. Закон сингармонизма (Үндестік заңы) для каждого слова
    def _fix_word(m: re.Match) -> str:
        w = m.group(0)
        wl = w.lower()
        if wl in KZ_COMMON_FUNCTION_WORDS:
            fixed = KZ_COMMON_FUNCTION_WORDS[wl]
            return fixed.capitalize() if w[0].isupper() else fixed

        # Рядом с увулярными қ/ғ буква ү всегда является твёрдой ұ (құрметтеуіміз, құрал)
        w = re.sub(r"([қғҚҒ])ү", r"\1ұ", w)
        w = re.sub(r"ү([қғҚҒ])", r"ұ\1", w)
        # Рядом с твёрдыми гласными а, о, ұ, ы буква г всегда является ғ (мағыналарымен, баға, болуға)
        w = re.sub(r"([аоұыАОҰЫ])г", r"\1ғ", w)
        w = re.sub(r"г([аоұыАОҰЫ])", r"ғ\1", w)

        has_back = bool(re.search(r"[аұықғАҰЫҚҒ]", w))
        has_front = bool(re.search(r"[әеіөүӘЕІӨҮ]", w))

        # Твёрдые слова (жуан сөздер): ү -> ұ, г -> ғ, к -> қ рядом с твёрдыми гласными
        if has_back and not has_front:
            w = w.replace("ү", "ұ").replace("Ү", "Ұ")
            w = w.replace("г", "ғ").replace("Г", "Ғ")
            w = re.sub(r"([аоұыАОҰЫ])к", r"\1қ", w)
            w = re.sub(r"к([аоұыАОҰЫ])", r"қ\1", w)
        # Мягкие слова (жіңішке сөздер): в исконно казахских мягких словах буква 'о' в первом слоге — это 'ө' (сөйлеу, көркем, сөздер, төселесің)
        elif has_front and not has_back:
            w = re.sub(r"^([бвгғджзйклмнңпрстфхцчшщ])о", r"\1ө", w)
            w = re.sub(r"^([БВГҒДЖЗЙКЛМНҢПРСТФХЦЧШЩ])о", r"\1ө", w)
            w = re.sub(r"^о(?=[йрлзсңтк])", "ө", w)
            w = re.sub(r"^О(?=[йрлзсңтк])", "Ө", w)

        return w

    t = re.sub(r"[а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]+", _fix_word, t)

    # 6. Двоеточие на конце предложения перед заглавной буквой или в конце текста -> точка
    t = re.sub(r":(?=\s+[А-ЯӘІҢҒҮҰҚӨҺ]|\s*$)", ".", t)
    t = re.sub(r"\s+([,.!?;:])", r"\1", t)
    return t


def _clean_and_limit_ocr_text(raw_text: str) -> tuple[str, bool]:
    """Применяет казахский фонетический пост-процессор и обрезает до MAX_OCR_TEXT_CHARS."""
    text = _postprocess_kazakh_ocr(raw_text)
    if len(text) <= MAX_OCR_TEXT_CHARS:
        return text, False

    clipped = text[:MAX_OCR_TEXT_CHARS]
    last_space = clipped.rfind(" ")
    if last_space > MAX_OCR_TEXT_CHARS // 2:
        clipped = clipped[:last_space]
    return clipped.strip(), True


def _extract_text_sync(
    raw_bytes: bytes,
    filename: str,
    content_type: str,
    requested_page: int = 1,
) -> tuple[str, str, int, int]:
    is_pdf = filename.lower().endswith(".pdf") or content_type == "application/pdf"

    if is_pdf:
        try:
            import pymupdf as fitz  # type: ignore
        except ImportError:
            try:
                import fitz  # type: ignore
            except ImportError as exc:
                raise HTTPException(
                    status_code=503,
                    detail="Библиотека PyMuPDF не установлена (pip install pymupdf).",
                ) from exc

        doc = fitz.open(stream=raw_bytes, filetype="pdf")
        total_pages = len(doc)
        if total_pages == 0:
            doc.close()
            return "", "pdf", 1, 0

        page_num = max(1, min(total_pages, int(requested_page or 1)))
        page_obj = doc[page_num - 1]
        page_txt = page_obj.get_text("text").strip()

        # Проверяем, что в текстовом слое реально есть кириллические/казахские буквы
        # (защита от сканов и PDF со сломанной кодировкой шрифтов вроде "·······")
        cyrillic_chars = re.findall(r"[а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]", page_txt)
        if len(cyrillic_chars) < 10:
            reader = _get_easyocr_reader()
            pix = page_obj.get_pixmap(dpi=160)
            png_bytes = _downscale_image_bytes(pix.tobytes("png"), max_side=1280)
            lines = reader.readtext(png_bytes, detail=0, paragraph=True)
            if lines:
                page_txt = " ".join(str(x).strip() for x in lines if str(x).strip())

        doc.close()
        return page_txt, "pdf", page_num, total_pages

    # Изображение (.jpg, .jpeg, .png, .webp)
    reader = _get_easyocr_reader()
    resized_bytes = _downscale_image_bytes(raw_bytes, max_side=1280)
    lines = reader.readtext(resized_bytes, detail=0, paragraph=True)
    extracted = " ".join(str(x).strip() for x in lines if str(x).strip())
    return extracted, "image", 1, 1


@app.post("/ocr/extract")
async def ocr_extract_endpoint(
    file: UploadFile = File(...),
    page: int = Form(default=1),
) -> dict[str, Any]:
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(
            status_code=400,
            detail="Бос файл жүктелді. / Загружен пустой файл.",
        )

    if len(raw_bytes) > MAX_OCR_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Файл тым үлкен (максимум 10 МБ). Кішірек PDF немесе сурет жүктеңіз. / "
                "Файл слишком большой (максимум 10 МБ). Загрузите файл меньшего размера."
            ),
        )

    filename = file.filename or "upload"
    content_type = file.content_type or ""

    extracted_text, source_type, page_num, total_pages = await asyncio.to_thread(
        _extract_text_sync, raw_bytes, filename, content_type, page
    )
    cleaned_text, was_truncated = _clean_and_limit_ocr_text(extracted_text)

    if not cleaned_text:
        raise HTTPException(
            status_code=400,
            detail=(
                "Бұл беттен мәтін танылмады. Басқа бетті таңдаңыз немесе анығырақ сурет жүктеңіз. / "
                "На этой странице текст не распознан. Выберите другую страницу или более чёткое фото."
            ),
        )

    return {
        "text": cleaned_text,
        "source_type": source_type,
        "page": page_num,
        "total_pages": total_pages,
        "truncated": was_truncated,
        "char_limit": MAX_OCR_TEXT_CHARS,
    }


class AdaptTextRequest(BaseModel):
    text: str = Field(..., min_length=3)
    mode: str = Field(default="adhd")
    title: Optional[str] = None


class ReadingProgressRequest(BaseModel):
    student_name: str = Field(default="Алихан")
    topic_title: str
    cards_count: int
    quiz_score: int
    quiz_total: int


EMOJI_HINTS = [
    (["өзен", "теңіз", "көл", "арал", "сырдария", "суды", "су "], "🌊"),
    (["ғарыш", "зымыран", "байқоңыр", "жұлдыз", "планета"], "🚀"),
    (["жануар", "аңдар", "құстар", "киік", "барыс", "табиғат", "қорық"], "🦌"),
    (["тау", "дала", "орман", "ағаш", "гүл"], "🏔️"),
    (["күріш", "егін", "шаруа", "нан"], "🌾"),
    (["ғалым", "кітап", "мектеп", "білім", "оқулық", "тіл", "сөйлем", "мәтін"], "📘"),
]

# Лексическое упрощение книжных и абстрактных оборотов для режима ПДТ / ЗПР (Easy-to-Read)
ZPR_EASY_READ_SUBS: list[tuple[str, str]] = [
    (r"тіршілік\s+етеді", "өмір сүреді"),
    (r"мекендейді", "тұрады"),
    (r"сирек\s+кездесетін", "ерекше"),
    (r"арнайы\s+қорықтар\s+құрылған", "жануарларды қорғайтын қорықтар ашылған"),
    (r"табиғаттың\s+асыл\s+байлығы", "табиғатқа өте керек, оларды қорғауымыз керек"),
    (r"су\s+ресурстарын\s+тиімді\s+пайдалану\s+жолдарын\s+зерттеуде", "суды босқа төкпей, үнемдеп қолдануды үйретеді"),
    (r"күріш\s+шаруашылығы\s+жақсы\s+дамыған", "диқандар көп күріш өсіреді"),
    (r"әрбір\s+баланың\s+парызы", "бәріміздің маңызды міндетіміз"),
    (r"аумағынан\s+ағып\s+өтіп", "жерімен ағып"),
    (r"самғап\s+ұшады", "биікке ұшады"),
    (r"ерлік\s+көрсетті", "үлкен еңбек сіңірді"),
    (r"адамзатқа\s+жаңа\s+білім\s+береді", "адамдарға көп жаңа нәрсе үйретеді"),
    (r"мәліметтермен\s+таныстыруды\s+одан\s+әрі\s+жалғастырады", "көп қызық ережелерді үйретеді"),
    (r"ұлттық\s+мұра\s*[—–-]?\s*ана\s+тілімізді\s+білуіміз\s+және\s+оны\s+құрметтеуіміз\s+қажет", "өз ана тілімізді жақсы біліп, құрметтеуіміз керек"),
    (r"тілдің\s+көркемдік\s+құралдарымен\s+танысасың", "әдемі сөйлеуді үйренесің"),
    (r"дұрыс\s+құрауға\s+төселесің", "дұрыс құрастыруды оңай үйренесің"),
    (r"бейнелейді", "көрсетеді"),
]


def _simplify_sentence_for_zpr(sent: str) -> str:
    res = sent
    for pat, repl in ZPR_EASY_READ_SUBS:
        res = re.sub(pat, repl, res, flags=re.IGNORECASE)
    return res


def _split_sentence_for_adhd(sent: str) -> list[str]:
    """Дробит длинное предложение на короткие динамичные микро-фразы (по 3–5 слов) для СДВГ."""
    clean = re.sub(r"\s+", " ", sent).strip().rstrip(".!?")
    if not clean:
        return []
    # Сначала делим по запятым, тире и союзам (және, бірақ, үшін)
    parts = [
        p.strip()
        for p in re.split(r"\s*(?:,|;|—|–|\bжәне\b|\bал\b|\bүшін\b)\s*", clean)
        if p.strip()
    ]
    micro_cards: list[str] = []
    for p in parts:
        words = p.split()
        if len(words) <= 5:
            micro_cards.append(f"{p[0].upper()}{p[1:]}." if len(p) > 1 else f"{p}.")
        else:
            for i in range(0, len(words), 5):
                chunk = " ".join(words[i : i + 5]).strip()
                if chunk:
                    micro_cards.append(f"{chunk[0].upper()}{chunk[1:]}.")
    return micro_cards

KEYWORD_GLOSSARY = {
    "сырдария": "Қазақстандағы үлкен әрі ұзын өзен.",
    "аумағынан": "Сол жердің ішінен, жерінен деген сөз.",
    "шаруашылығы": "Адамдардың егін егіп, еңбек ететін ісі.",
    "байқоңыр": "Зымырандар ғарышқа ұшатын атақты ғарыш айлағы.",
    "ғарышкер": "Зымыранмен аспан әлеміне ұшатын батыр адам.",
    "киік": "Қазақ даласында жүйрік жүгіретін сұлу жануар.",
    "қорық": "Табиғат пен жануарларды қорғайтын қауіпсіз жер.",
}


def _pick_card_icon(text: str, idx: int) -> str:
    lower = text.lower()
    for words, icon in EMOJI_HINTS:
        if any(w in lower for w in words):
            return icon
    fallback_icons = ["📖", "✨", "🌿", "🌟", "🧩", "🎯"]
    return fallback_icons[(idx - 1) % len(fallback_icons)]


def _extract_fallback_keywords(card_text: str, mode: str = "adhd") -> list[dict[str, str]]:
    words = re.findall(r"[а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]+", card_text)
    if not words:
        return []
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    max_kws = 3 if mode == "zpr" else (1 if mode == "adhd" else 2)

    for w in sorted(words, key=len, reverse=True):
        wl = w.lower()
        if wl in seen or len(wl) < 4:
            continue
        seen.add(wl)
        syl = format_for_dyslexia(w)["syllable_text"]
        syl_count = len(syl.split("-"))
        special_letters = sorted(set(ch for ch in wl if ch in "қғңөүұәіһ"))

        explanation = KEYWORD_GLOSSARY.get(wl)
        if not explanation:
            for k, val in KEYWORD_GLOSSARY.items():
                if k in wl:
                    explanation = val
                    break

        if mode == "dyslexia":
            phoneme_note = (
                f" Ерекше дыбыстар: {', '.join(special_letters)}."
                if special_letters
                else ""
            )
            explanation = f"Буынға бөліп оқы: {syl} ({syl_count} буын).{phoneme_note}"
        elif mode == "zpr":
            if explanation:
                explanation = f"{explanation} (Оқылуы: {syl})"
            else:
                explanation = f"Мағыналы сөз • Асықпай буынмен оқы: {syl} ({syl_count} буын)."
        else:
            if not explanation:
                explanation = f"Негізгі тірек сөз ({syl})."

        result.append({"word": w, "explanation": explanation})
        if len(result) >= max_kws:
            break
    return result


def _pick_focus_word(card_text: str) -> str:
    words = re.findall(r"[а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]+", card_text)
    if not words:
        return ""
    return max(words, key=len)


def _build_zpr_coach_tip(card_text: str, focus_word: str) -> str:
    if focus_word:
        fw_lower = focus_word.lower()
        for k, val in KEYWORD_GLOSSARY.items():
            if k in fw_lower:
                return f"Қарапайым тілмен: бұл сөйлемде «{focus_word}» туралы айтылған ({val})"
        return f"Негізгі ой: «{focus_word}» сөзіне мән беріп, сөйлемді асықпай елестетіп оқы."
    return "Негізгі ойды елестетіп, асықпай оқып шық."


def _local_adapt_fallback(raw_text: str, mode: str = "adhd") -> dict[str, Any]:
    """
    Профильдік локальный фолбэк для Модуля В:
    - adhd (СДВГ): дробит предложения по союзам и запятым на ультра-короткие тезисы (3–5 слов), слитное чтение, фокус на главном слове.
    - dyslexia (Дислексия): сохраняет плавный ритм предложения, строит слоговую лесенку трудных слов и звуковой разбор.
    - zpr (ПДТ / ЗПР): переписывает книжные и абстрактные обороты простыми бытовыми словами (Easy-to-Read) + добавляет смысловое пояснение.
    """
    cleaned = re.sub(r"\s+", " ", raw_text).strip()
    raw_sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]
    if not raw_sentences:
        raw_sentences = [cleaned]

    short_chunks: list[str] = []
    if mode == "adhd":
        for sent in raw_sentences:
            short_chunks.extend(_split_sentence_for_adhd(sent))
        short_chunks = short_chunks[:6]
    elif mode == "zpr":
        for sent in raw_sentences:
            simplified = _simplify_sentence_for_zpr(sent)
            short_chunks.append(simplified)
        short_chunks = short_chunks[:5]
    else:
        # dyslexia: 4–5 ритмичных карточек
        for sent in raw_sentences:
            words = sent.split()
            if len(words) <= 8:
                short_chunks.append(sent)
            else:
                sub_parts = [p.strip() for p in re.split(r"[,;—–]\s*", sent) if p.strip()]
                for part in sub_parts:
                    short_chunks.append(part if part.endswith((".", "!", "?")) else f"{part}.")
        short_chunks = short_chunks[:5]

    cards: list[dict[str, Any]] = []
    for idx, c_text in enumerate(short_chunks, start=1):
        dys = format_for_dyslexia(c_text)
        focus_w = _pick_focus_word(c_text)
        if mode == "adhd":
            coach_tip = f"⚡ Қысқа факт #{idx}: басты тірек сөз — «{focus_w}»"
        elif mode == "dyslexia":
            focus_syl = format_for_dyslexia(focus_w)["syllable_text"] if focus_w else ""
            coach_tip = f"🔤 Қиын сөзді буынмен қосып оқы: {focus_syl}"
        else:
            coach_tip = _build_zpr_coach_tip(c_text, focus_w)

        cards.append(
            {
                "id": idx,
                "text": c_text,
                "syllable_text": dys["syllable_text"],
                "tokens": dys["tokens"],
                "icon": _pick_card_icon(c_text, idx),
                "focus_word": focus_w,
                "coach_tip": coach_tip,
                "keywords": _extract_fallback_keywords(c_text, mode=mode),
            }
        )

    first_kw = cards[0]["keywords"][0]["word"] if cards and cards[0]["keywords"] else "Табиғат"
    last_kw = cards[-1]["keywords"][0]["word"] if cards and cards[-1]["keywords"] else "Білім"

    quiz = [
        {
            "question": "Мәтіндегі бірінші карточкада не туралы айтылды?",
            "options": [
                cards[0]["text"] if cards else first_kw,
                "Тек компьютерлік ойындар туралы",
                "Ештеңе айтылмаған",
            ],
            "answer_index": 0,
        },
        {
            "question": "Мәтінде кездескен маңызды тірек сөзді тап:",
            "options": [
                last_kw,
                "Теледидар",
                "Велосипед",
            ],
            "answer_index": 0,
        },
    ]

    return {
        "source": "local_fallback",
        "mode": mode,
        "cards": cards,
        "quiz": quiz,
    }


async def _http_get_json(url: str, timeout: float = 4.0) -> dict[str, Any]:
    if HAS_HTTPX:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()

    def _sync_get() -> dict[str, Any]:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))

    return await asyncio.to_thread(_sync_get)


async def _http_post_json(url: str, payload: dict[str, Any], timeout: float = 45.0) -> dict[str, Any]:
    if HAS_HTTPX:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            return resp.json()

    def _sync_post() -> dict[str, Any]:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))

    return await asyncio.to_thread(_sync_post)


@app.get("/llm/health")
async def llm_health() -> dict[str, Any]:
    base_url, model_name = get_kazllm_config()
    try:
        data = await _http_get_json(f"{base_url}/api/tags", timeout=4.0)
        models = [m.get("name", "") for m in data.get("models", []) if isinstance(m, dict)]
        return {
            "online": True,
            "model": model_name,
            "base_url": base_url,
            "available_models": models,
        }
    except Exception:
        return {
            "online": False,
            "model": model_name,
            "base_url": base_url,
            "available_models": [],
        }


def _build_kazllm_system_prompt(mode: str) -> str:
    if mode == "dyslexia":
        return (
            "Сен дислексиясы бар балаларға арналған қазақ тілі логопед-әдіскерісің. "
            "Мақсат: балаға оқуға қиын, тым ұзын сөздерді қысқа әрі оңай оқылатын синонимдермен алмастырып, "
            "мәтінді 4–5 ырғақты карточкаға (әрқайсысы 5–7 сөз) бөл. "
            "Әр карточка үшін: "
            "1) text — оқуға жеңіл сөйлем; "
            "2) icon — сәйкес эмодзи; "
            "3) focus_word — сөйлемдегі буынға бөліп жаттығатын басты сөз; "
            "4) coach_tip — сол сөзді қалай дұрыс әрі анық оқу керектігі туралы қысқа кеңес; "
            "5) keywords (2 сөз) — буынға бөлінген түрі мен мағынасы. "
            "Соңында 2 тест сұрағын (quiz) құрастыр. "
            "Жауапты тек JSON форматында қайтар:\n"
            '{"cards": [{"text": "...", "icon": "🔤", "focus_word": "...", "coach_tip": "...", '
            '"keywords": [{"word": "...", "explanation": "..."}]}], '
            '"quiz": [{"question": "...", "options": ["...", "...", "..."], "answer_index": 0}]}'
        )
    if mode == "zpr":
        return (
            "Сен ПДТ (ЗПР — психикалық даму тежелуі) бар балаларға арналған арнайы педагог-әдіскерсің. "
            "Мақсат: күрделі, абстрактілі ойларды 1–2 сынып баласы бірден түсінетін өте қарапайым, "
            "күнделікті тұрмыстық тілмен (Easy-to-Read) 3–5 карточкаға мазмұндап жаз. "
            "Әр карточка үшін: "
            "1) text — өте қарапайым, түсінікті сөйлем; "
            "2) icon — көрнекі эмодзи; "
            "3) focus_word — басты ұғым; "
            "4) coach_tip — «Қарапайым тілмен айтқанда: ...» деп осы карточканың негізгі мағынасын балаға өмірлік мысалмен түсіндір; "
            "5) keywords (2–3 сөз) — әр сөздің балаға өте түсінікті, қарапайым түсіндірмесі. "
            "Соңында мәтінді түсінгенін тексеретін 2 өте жеңіл сұрақ (quiz) құрастыр. "
            "Жауапты тек JSON форматында қайтар:\n"
            '{"cards": [{"text": "...", "icon": "💡", "focus_word": "...", "coach_tip": "Қарапайым тілмен: ...", '
            '"keywords": [{"word": "...", "explanation": "..."}]}], '
            '"quiz": [{"question": "...", "options": ["...", "...", "..."], "answer_index": 0}]}'
        )
    # Default: adhd (СДВГ / Зейін тапшылығы)
    return (
        "Сен СДВГ (зейін тапшылығы мен гиперактивтілік) бар балаларға арналған қазақ тілі әдіскерісің. "
        "Мақсат: баланың назарын жоғалтпау үшін мәтінді 4–6 өте қысқа, динамикалық микро-карточкаға бөл. "
        "Әр карточкада тек БІР нақты әрекет немесе факт және ең көбі 4–6 сөз ғана болсын (артық сөзсіз!). "
        "Әр карточка үшін: "
        "1) text — өте қысқа, серпінді сөйлем (4–6 сөз); "
        "2) icon — жарқын эмодзи; "
        "3) focus_word — сөйлемдегі ең басты тірек сөз (баланың көзі бірден түсетін сөз); "
        "4) coach_tip — баланың зейінін ұстайтын қысқа мотивациялық импульс (мысалы: «⚡ Есте сақта: ...»); "
        "5) keywords (1 басты сөз) — өте қысқа түсіндірме. "
        "Соңында зейінді тексеретін 2 қысқа блиц-сұрақ (quiz) құрастыр. "
        "Жауапты тек JSON форматында қайтар:\n"
        '{"cards": [{"text": "...", "icon": "⚡", "focus_word": "...", "coach_tip": "...", '
        '"keywords": [{"word": "...", "explanation": "..."}]}], '
        '"quiz": [{"question": "...", "options": ["...", "...", "..."], "answer_index": 0}]}'
    )


@app.post("/adapt-text")
async def adapt_text_endpoint(req: AdaptTextRequest) -> dict[str, Any]:
    clean_text = re.sub(r"\s+", " ", req.text).strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text must not be empty.")

    mode = req.mode if req.mode in ("adhd", "dyslexia", "zpr") else "adhd"
    text_hash = hashlib.sha256(f"v2:{mode}:{clean_text}".encode("utf-8")).hexdigest()

    # 1. Проверяем кэш в tandem_progress.db
    with _get_progress_conn() as conn:
        row = conn.execute(
            "SELECT response_json FROM adapted_texts_cache WHERE text_hash = ?",
            (text_hash,),
        ).fetchone()
        if row:
            cached_data = json.loads(row["response_json"])
            cached_data["cached"] = True
            return cached_data

    base_url, model_name = get_kazllm_config()
    system_prompt = _build_kazllm_system_prompt(mode)

    ollama_payload = {
        "model": model_name,
        "system": system_prompt,
        "prompt": f"Профиль: {mode.upper()}.\nМәтінді осы профиль бойынша бейімде:\n{clean_text}",
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.25},
    }

    result_data: Optional[dict[str, Any]] = None
    max_kws = 3 if mode == "zpr" else (1 if mode == "adhd" else 2)

    try:
        resp_body = await _http_post_json(f"{base_url}/api/generate", ollama_payload, timeout=45.0)
        raw_resp = resp_body.get("response", "")
        parsed = json.loads(raw_resp) if isinstance(raw_resp, str) else raw_resp

        if isinstance(parsed, dict) and isinstance(parsed.get("cards"), list) and parsed["cards"]:
            enriched_cards: list[dict[str, Any]] = []
            for idx, item in enumerate(parsed["cards"][:6], start=1):
                if not isinstance(item, dict) or not item.get("text"):
                    continue
                c_text = str(item["text"]).strip()
                dys = format_for_dyslexia(c_text)
                focus_w = str(item.get("focus_word") or _pick_focus_word(c_text)).strip()
                coach_tip = str(item.get("coach_tip") or "").strip()
                if not coach_tip:
                    if mode == "adhd":
                        coach_tip = f"⚡ Назар аудар: басты сөз — «{focus_w}»!"
                    elif mode == "dyslexia":
                        coach_tip = "🔤 Әр буынды түсі бойынша асықпай қосып оқы."
                    else:
                        coach_tip = _build_zpr_coach_tip(c_text, focus_w)

                kws = item.get("keywords")
                valid_kws: list[dict[str, str]] = []
                if isinstance(kws, list):
                    for kw in kws[:max_kws]:
                        if isinstance(kw, dict) and kw.get("word") and kw.get("explanation"):
                            valid_kws.append(
                                {
                                    "word": str(kw["word"]).strip(),
                                    "explanation": str(kw["explanation"]).strip(),
                                }
                            )
                if not valid_kws:
                    valid_kws = _extract_fallback_keywords(c_text, mode=mode)

                enriched_cards.append(
                    {
                        "id": idx,
                        "text": c_text,
                        "syllable_text": dys["syllable_text"],
                        "tokens": dys["tokens"],
                        "icon": str(item.get("icon") or _pick_card_icon(c_text, idx)),
                        "focus_word": focus_w,
                        "coach_tip": coach_tip,
                        "keywords": valid_kws,
                    }
                )

            raw_quiz = parsed.get("quiz")
            valid_quiz: list[dict[str, Any]] = []
            if isinstance(raw_quiz, list):
                for q in raw_quiz[:2]:
                    if (
                        isinstance(q, dict)
                        and q.get("question")
                        and isinstance(q.get("options"), list)
                        and len(q["options"]) >= 2
                    ):
                        ans_idx = int(q.get("answer_index", 0))
                        if ans_idx < 0 or ans_idx >= len(q["options"]):
                            ans_idx = 0
                        valid_quiz.append(
                            {
                                "question": str(q["question"]).strip(),
                                "options": [str(o) for o in q["options"][:3]],
                                "answer_index": ans_idx,
                            }
                        )

            if enriched_cards:
                if not valid_quiz:
                    valid_quiz = _local_adapt_fallback(clean_text, mode=mode)["quiz"]
                result_data = {
                    "source": "kazllm",
                    "model": model_name,
                    "mode": mode,
                    "cached": False,
                    "cards": enriched_cards,
                    "quiz": valid_quiz,
                }
    except Exception:
        result_data = None

    if result_data is None:
        fallback = _local_adapt_fallback(clean_text, mode=mode)
        result_data = {
            "source": "local_fallback",
            "model": "local_python_fallback",
            "mode": mode,
            "cached": False,
            "cards": fallback["cards"],
            "quiz": fallback["quiz"],
        }
    else:
        # Сохраняем успешный ответ KazLLM-8B в кэш SQLite
        with _get_progress_conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO adapted_texts_cache (text_hash, response_json, created_at)
                VALUES (?, ?, ?)
                """,
                (
                    text_hash,
                    json.dumps(result_data, ensure_ascii=False),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            conn.commit()

    return result_data


@app.post("/progress/reading")
async def record_reading_progress(payload: ReadingProgressRequest) -> dict[str, Any]:
    with _get_progress_conn() as conn:
        cursor = conn.execute(
            """
            INSERT INTO reading_progress (
                student_name, topic_title, cards_count, quiz_score, quiz_total, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                payload.student_name.strip() or "Алихан",
                payload.topic_title,
                payload.cards_count,
                payload.quiz_score,
                payload.quiz_total,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
        return {"status": "ok", "id": int(cursor.lastrowid)}


@app.get("/progress/summary")
async def get_progress_summary(student_name: Optional[str] = None) -> dict[str, Any]:
    with _get_progress_conn() as conn:
        if student_name:
            s_row = conn.execute(
                """
                SELECT
                    COUNT(*) AS total_attempts,
                    SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) AS passed_attempts
                FROM speech_progress
                WHERE student_name = ?
                """,
                (student_name,),
            ).fetchone()
            r_row = conn.execute(
                """
                SELECT
                    COUNT(*) AS completed_readings,
                    COALESCE(SUM(cards_count), 0) AS total_cards_read,
                    COALESCE(SUM(quiz_score), 0) AS quiz_correct,
                    COALESCE(SUM(quiz_total), 0) AS quiz_total
                FROM reading_progress
                WHERE student_name = ?
                """,
                (student_name,),
            ).fetchone()
        else:
            s_row = conn.execute(
                """
                SELECT
                    COUNT(*) AS total_attempts,
                    SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) AS passed_attempts
                FROM speech_progress
                """
            ).fetchone()
            r_row = conn.execute(
                """
                SELECT
                    COUNT(*) AS completed_readings,
                    COALESCE(SUM(cards_count), 0) AS total_cards_read,
                    COALESCE(SUM(quiz_score), 0) AS quiz_correct,
                    COALESCE(SUM(quiz_total), 0) AS quiz_total
                FROM reading_progress
                """
            ).fetchone()

        cache_row = conn.execute(
            "SELECT COUNT(*) AS cached_texts FROM adapted_texts_cache"
        ).fetchone()

    speech_total = int(s_row["total_attempts"] or 0)
    speech_passed = int(s_row["passed_attempts"] or 0)
    readings_done = int(r_row["completed_readings"] or 0)
    cards_read = int(r_row["total_cards_read"] or 0)
    quiz_correct = int(r_row["quiz_correct"] or 0)
    quiz_total = int(r_row["quiz_total"] or 0)
    cached_texts = int(cache_row["cached_texts"] or 0)

    return {
        "student_name": student_name or "all",
        "speech_total_attempts": speech_total,
        "speech_passed_attempts": speech_passed,
        "speech_accuracy": round(speech_passed / speech_total, 3) if speech_total > 0 else 0.0,
        "completed_readings": readings_done,
        "total_cards_read": cards_read,
        "quiz_correct": quiz_correct,
        "quiz_total": quiz_total,
        "cached_texts_count": cached_texts,
    }


# ---------------------------------------------------------------------------
# Этап 2 и 3: Уровни сложности, расчёт звёзд и автоподбор минимальных пар
# ---------------------------------------------------------------------------

EXPANDED_MINIMAL_PAIRS: dict[str, list[dict[str, str]]] = {
    "қ": [
        {"target_word": "қал", "distractor_word": "кал", "phoneme": "қ", "distractor_phoneme": "к", "meaning_kk": "қал (осында қал)", "meaning_ru": "останься"},
        {"target_word": "қар", "distractor_word": "кар", "phoneme": "қ", "distractor_phoneme": "к", "meaning_kk": "қар (ақ қар)", "meaning_ru": "снег"},
        {"target_word": "қас", "distractor_word": "кас", "phoneme": "қ", "distractor_phoneme": "к", "meaning_kk": "қас (қас-кірпік)", "meaning_ru": "бровь"},
        {"target_word": "ақ", "distractor_word": "ак", "phoneme": "қ", "distractor_phoneme": "к", "meaning_kk": "ақ (ақ түс)", "meaning_ru": "белый"},
    ],
    "ғ": [
        {"target_word": "аға", "distractor_word": "ага", "phoneme": "ғ", "distractor_phoneme": "г", "meaning_kk": "аға (үлкен аға)", "meaning_ru": "старший брат"},
        {"target_word": "баға", "distractor_word": "бага", "phoneme": "ғ", "distractor_phoneme": "г", "meaning_kk": "баға (бестік баға)", "meaning_ru": "оценка"},
        {"target_word": "сағат", "distractor_word": "сагат", "phoneme": "ғ", "distractor_phoneme": "г", "meaning_kk": "сағат (уақыт)", "meaning_ru": "часы"},
    ],
    "ң": [
        {"target_word": "аң", "distractor_word": "ан", "phoneme": "ң", "distractor_phoneme": "н", "meaning_kk": "аң (жануар)", "meaning_ru": "зверь"},
        {"target_word": "таң", "distractor_word": "тан", "phoneme": "ң", "distractor_phoneme": "н", "meaning_kk": "таң (таңертең)", "meaning_ru": "рассвет"},
        {"target_word": "мың", "distractor_word": "мын", "phoneme": "ң", "distractor_phoneme": "н", "meaning_kk": "мың (1000 саны)", "meaning_ru": "тысяча"},
        {"target_word": "оң", "distractor_word": "он", "phoneme": "ң", "distractor_phoneme": "н", "meaning_kk": "оң (оң жақ)", "meaning_ru": "правый"},
    ],
    "ө": [
        {"target_word": "көл", "distractor_word": "кол", "phoneme": "ө", "distractor_phoneme": "о", "meaning_kk": "көл (су айдыны)", "meaning_ru": "озеро"},
        {"target_word": "төл", "distractor_word": "тол", "phoneme": "ө", "distractor_phoneme": "о", "meaning_kk": "төл (қозы-лақ)", "meaning_ru": "приплод"},
        {"target_word": "өр", "distractor_word": "ор", "phoneme": "ө", "distractor_phoneme": "о", "meaning_kk": "өр (биік жер)", "meaning_ru": "возвышенность"},
    ],
    "ү": [
        {"target_word": "түн", "distractor_word": "тун", "phoneme": "ү", "distractor_phoneme": "у", "meaning_kk": "түн (қараңғы мезгіл)", "meaning_ru": "ночь"},
        {"target_word": "күн", "distractor_word": "кун", "phoneme": "ү", "distractor_phoneme": "у", "meaning_kk": "күн (жарық күн)", "meaning_ru": "солнце"},
        {"target_word": "үш", "distractor_word": "уш", "phoneme": "ү", "distractor_phoneme": "у", "meaning_kk": "үш (3 саны)", "meaning_ru": "три"},
    ],
    "р": [
        {"target_word": "ара", "distractor_word": "ала", "phoneme": "р", "distractor_phoneme": "л", "meaning_kk": "ара (бал арасы)", "meaning_ru": "пчела"},
        {"target_word": "қар", "distractor_word": "қал", "phoneme": "р", "distractor_phoneme": "л", "meaning_kk": "қар (аппақ қар)", "meaning_ru": "снег"},
        {"target_word": "бар", "distractor_word": "бал", "phoneme": "р", "distractor_phoneme": "л", "meaning_kk": "бар (бар болу)", "meaning_ru": "есть"},
        {"target_word": "тар", "distractor_word": "тал", "phoneme": "р", "distractor_phoneme": "л", "meaning_kk": "тар (тар жол)", "meaning_ru": "узкий"},
    ],
}


class SpeechProgressRequest(BaseModel):
    student_name: str = Field(default="Алихан")
    target_word: str
    phoneme: str
    level: int = Field(default=1, ge=1, le=3)
    score: float = Field(..., ge=0.0, le=1.0)
    passed: Optional[bool] = None


@app.post("/progress/speech")
async def record_speech_progress_endpoint(payload: SpeechProgressRequest) -> dict[str, Any]:
    stars = _calculate_stars(payload.score)
    passed_flag = (
        1
        if (payload.passed if payload.passed is not None else payload.score >= 0.65)
        else 0
    )
    student = payload.student_name.strip() or "Алихан"
    ph = payload.phoneme.strip().lower() or "қ"

    with _get_progress_conn() as conn:
        cursor = conn.execute(
            """
            INSERT INTO speech_progress (
                student_name, target_word, phoneme, level, passed, final_score, stars, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                student,
                payload.target_word.strip(),
                ph,
                payload.level,
                passed_flag,
                round(payload.score, 4),
                stars,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
        row_id = int(cursor.lastrowid)

    return {
        "status": "ok",
        "id": row_id,
        "level": payload.level,
        "score": round(payload.score, 4),
        "stars": stars,
    }


@app.get("/progress/weak-phonemes")
async def get_progress_weak_phonemes(student_name: Optional[str] = None) -> dict[str, Any]:
    student = (student_name or "").strip()
    with _get_progress_conn() as conn:
        if student:
            rows = conn.execute(
                """
                SELECT
                    phoneme,
                    COUNT(*) AS total_attempts,
                    SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) AS failed_attempts,
                    AVG(final_score) AS avg_score,
                    AVG(stars) AS avg_stars
                FROM speech_progress
                WHERE student_name = ?
                GROUP BY phoneme
                """,
                (student,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT
                    phoneme,
                    COUNT(*) AS total_attempts,
                    SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) AS failed_attempts,
                    AVG(final_score) AS avg_score,
                    AVG(stars) AS avg_stars
                FROM speech_progress
                GROUP BY phoneme
                """
            ).fetchall()

    stats_by_ph: dict[str, dict[str, Any]] = {}
    for row in rows:
        ph = str(row["phoneme"]).strip().lower()
        if ph not in EXPANDED_MINIMAL_PAIRS:
            continue
        total = int(row["total_attempts"] or 0)
        failed = int(row["failed_attempts"] or 0)
        avg_score = round(float(row["avg_score"] or 0.0), 3)
        avg_stars = round(float(row["avg_stars"] or 0.0), 2)
        error_rate = round(failed / total, 3) if total > 0 else 0.0
        stats_by_ph[ph] = {
            "phoneme": ph,
            "distractor_phoneme": "у" if ph == "ү" else PHONEME_CONTRAST.get(ph, "к"),
            "total_attempts": total,
            "failed_attempts": failed,
            "error_rate": error_rate,
            "avg_score": avg_score,
            "avg_stars": avg_stars,
            "recommended_pairs": EXPANDED_MINIMAL_PAIRS[ph],
        }

    # Если история есть — сортируем по убыванию error_rate и возрастанию avg_score
    weak_list = sorted(
        stats_by_ph.values(),
        key=lambda item: (-item["error_rate"], item["avg_score"], -item["total_attempts"]),
    )

    # Если у ученика ещё мало попыток, дополняем приоритетными фонемами (қ, р, ң)
    if len(weak_list) < 3:
        for default_ph in ("қ", "р", "ң", "ғ", "ө", "ү"):
            if default_ph not in stats_by_ph:
                weak_list.append(
                    {
                        "phoneme": default_ph,
                        "distractor_phoneme": "у" if default_ph == "ү" else PHONEME_CONTRAST.get(default_ph, "к"),
                        "total_attempts": 0,
                        "failed_attempts": 0,
                        "error_rate": 0.0,
                        "avg_score": 0.0,
                        "avg_stars": 0.0,
                        "recommended_pairs": EXPANDED_MINIMAL_PAIRS[default_ph],
                    }
                )
            if len(weak_list) >= 3:
                break

    return {
        "student_name": student or "all",
        "weak_phonemes": weak_list,
    }


# ---------------------------------------------------------------------------
# Пользователи и 3 роли (Учитель/Админ, Ученик, Родитель) + Домашние задания
# ---------------------------------------------------------------------------
class AuthLoginRequest(BaseModel):
    username: Optional[str] = None
    pin_code: Optional[str] = None
    role: Optional[str] = None


class UpdateStudentProfileRequest(BaseModel):
    adaptive_profile: str = Field(..., pattern="^(adhd|dyslexia|zpr)$")


class CreateHomeworkRequest(BaseModel):
    target_phoneme: str = Field(default="қ")
    target_level: int = Field(default=2, ge=1, le=3)
    adaptive_profile: str = Field(default="dyslexia")
    reading_topic: str = Field(default="Қазақстан табиғаты")
    teacher_note: str = Field(..., min_length=3)


def _row_to_user_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "username": str(row["username"]),
        "full_name": str(row["full_name"]),
        "role": str(row["role"]),
        "adaptive_profile": str(row["adaptive_profile"]),
        "grade": int(row["grade"]),
        "linked_student_name": str(row["linked_student_name"]),
    }


def _row_to_hw_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "student_name": str(row["student_name"]),
        "teacher_name": str(row["teacher_name"]),
        "target_phoneme": str(row["target_phoneme"]),
        "target_level": int(row["target_level"]),
        "adaptive_profile": str(row["adaptive_profile"]),
        "reading_topic": str(row["reading_topic"]),
        "teacher_note": str(row["teacher_note"]),
        "status": str(row["status"]),
        "created_at": str(row["created_at"]),
    }


@app.get("/auth/users")
async def list_auth_users() -> dict[str, Any]:
    with _get_progress_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM users ORDER BY CASE role WHEN 'teacher' THEN 1 WHEN 'student' THEN 2 ELSE 3 END"
        ).fetchall()
        hw_rows = conn.execute(
            "SELECT * FROM homework_assignments ORDER BY id DESC LIMIT 5"
        ).fetchall()
    return {
        "users": [_row_to_user_dict(r) for r in rows],
        "homework": [_row_to_hw_dict(r) for r in hw_rows],
    }


@app.post("/auth/login")
async def auth_login(payload: AuthLoginRequest) -> dict[str, Any]:
    with _get_progress_conn() as conn:
        row = None
        if payload.username and payload.pin_code:
            row = conn.execute(
                "SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND pin_code = ?",
                (payload.username.strip(), payload.pin_code.strip()),
            ).fetchone()
            if not row:
                raise HTTPException(
                    status_code=401,
                    detail="Логин немесе PIN-код қате / Неверный логин или PIN-код",
                )
        elif payload.role in ("teacher", "student", "parent"):
            row = conn.execute(
                "SELECT * FROM users WHERE role = ? LIMIT 1",
                (payload.role,),
            ).fetchone()
        else:
            raise HTTPException(status_code=400, detail="Укажите логин и PIN-код или роль.")

        if not row:
            raise HTTPException(status_code=404, detail="Пользователь не найден.")

        hw_rows = conn.execute(
            "SELECT * FROM homework_assignments ORDER BY id DESC LIMIT 5"
        ).fetchall()

    return {
        "user": _row_to_user_dict(row),
        "homework": [_row_to_hw_dict(r) for r in hw_rows],
    }


@app.post("/auth/student-profile")
async def update_student_adaptive_profile(payload: UpdateStudentProfileRequest) -> dict[str, Any]:
    profile = payload.adaptive_profile
    with _get_progress_conn() as conn:
        conn.execute(
            "UPDATE users SET adaptive_profile = ?",
            (profile,),
        )
        conn.commit()
    return {"status": "ok", "adaptive_profile": profile}


@app.get("/homework")
async def get_homework_list() -> dict[str, Any]:
    with _get_progress_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM homework_assignments ORDER BY id DESC LIMIT 10"
        ).fetchall()
    return {"homework": [_row_to_hw_dict(r) for r in rows]}


@app.post("/homework")
async def create_homework(payload: CreateHomeworkRequest) -> dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    profile = payload.adaptive_profile if payload.adaptive_profile in ("adhd", "dyslexia", "zpr") else "dyslexia"
    ph = payload.target_phoneme if payload.target_phoneme in ("қ", "ғ", "ң", "ө", "ү", "р") else "қ"
    with _get_progress_conn() as conn:
        t_row = conn.execute("SELECT full_name FROM users WHERE role = 'teacher' LIMIT 1").fetchone()
        teacher_name = str(t_row["full_name"]) if t_row else "Айжан Мұратқызы"
        conn.execute(
            "UPDATE users SET adaptive_profile = ?",
            (profile,),
        )
        cursor = conn.execute(
            """
            INSERT INTO homework_assignments (
                student_name, teacher_name, target_phoneme, target_level,
                adaptive_profile, reading_topic, teacher_note, status, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
            """,
            (
                "Алихан",
                teacher_name,
                ph,
                payload.target_level,
                profile,
                payload.reading_topic.strip() or "Қазақстан табиғаты",
                payload.teacher_note.strip(),
                now_iso,
            ),
        )
        new_id = cursor.lastrowid
        row = conn.execute("SELECT * FROM homework_assignments WHERE id = ?", (new_id,)).fetchone()
        conn.commit()
    return {"status": "ok", "homework": _row_to_hw_dict(row)}


@app.post("/homework/{homework_id}/complete")
async def complete_homework(homework_id: int) -> dict[str, Any]:
    with _get_progress_conn() as conn:
        conn.execute(
            "UPDATE homework_assignments SET status = 'completed' WHERE id = ?",
            (homework_id,),
        )
        row = conn.execute(
            "SELECT * FROM homework_assignments WHERE id = ?",
            (homework_id,),
        ).fetchone()
        conn.commit()
    if not row:
        raise HTTPException(status_code=404, detail="Homework not found")
    return {"status": "ok", "homework": _row_to_hw_dict(row)}


# ---------------------------------------------------------------------------
# Раздача собранного фронтенда (D:\tandem-syr\frontend\dist) для единого деплоя
# ---------------------------------------------------------------------------
FRONTEND_DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if (FRONTEND_DIST_DIR / "assets").exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_DIST_DIR / "assets")),
        name="frontend-assets",
    )


@app.get("/logo.png", include_in_schema=False)
async def serve_logo_png():
    for candidate in (
        FRONTEND_DIST_DIR / "logo.png",
        FRONTEND_DIST_DIR.parent / "public" / "logo.png",
    ):
        if candidate.exists():
            return FileResponse(str(candidate), media_type="image/png")
    raise HTTPException(status_code=404, detail="logo.png not found")


@app.get("/", include_in_schema=False)
async def serve_spa_index():
    index_file = FRONTEND_DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file), media_type="text/html")
    return {
        "service": "Tandem-Syr API",
        "status": "running",
        "docs": "/docs",
    }
