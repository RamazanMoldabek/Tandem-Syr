import json
import re
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from syllable_parser import CONFUSING_CHARS, format_for_dyslexia

DB_PATH = Path(r"D:\tandem-syr\tandem_syr.db")


def _get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path = DB_PATH) -> None:
    """Инициализирует локальную SQLite-базу с таблицами lessons и speech_attempts."""
    with _get_connection(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS lessons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                grade INTEGER NOT NULL,
                subject TEXT NOT NULL,
                title TEXT NOT NULL,
                raw_text TEXT NOT NULL,
                adapted_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS speech_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_name TEXT NOT NULL,
                target_word TEXT NOT NULL,
                phoneme TEXT NOT NULL,
                passed INTEGER NOT NULL,
                diff_score REAL NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def save_lesson(
    grade: int,
    subject: str,
    title: str,
    raw_text: str,
    adapted_data: dict[str, Any],
    db_path: Path = DB_PATH,
) -> int:
    """Сохраняет адаптированный урок в SQLite и возвращает его ID."""
    init_db(db_path)
    created_at = datetime.now(timezone.utc).isoformat()
    with _get_connection(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT INTO lessons (grade, subject, title, raw_text, adapted_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                grade,
                subject,
                title,
                raw_text,
                json.dumps(adapted_data, ensure_ascii=False),
                created_at,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid)


def get_lessons(db_path: Path = DB_PATH) -> list[dict[str, Any]]:
    """Возвращает список всех сохранённых уроков из SQLite."""
    init_db(db_path)
    with _get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT id, grade, subject, title, raw_text, adapted_json, created_at
            FROM lessons
            ORDER BY id DESC
            """
        ).fetchall()

    lessons = []
    for row in rows:
        lessons.append(
            {
                "id": row["id"],
                "grade": row["grade"],
                "subject": row["subject"],
                "title": row["title"],
                "raw_text": row["raw_text"],
                "adapted": json.loads(row["adapted_json"]),
                "created_at": row["created_at"],
            }
        )
    return lessons


def log_speech_attempt(
    student_name: str,
    eval_result: dict[str, Any],
    db_path: Path = DB_PATH,
) -> int:
    """Фиксирует попытку произношения ученика в таблице speech_attempts."""
    init_db(db_path)
    created_at = datetime.now(timezone.utc).isoformat()
    target_word = str(eval_result.get("target_word", ""))
    phoneme = str(eval_result.get("phoneme", ""))
    passed = 1 if eval_result.get("passed", False) else 0
    diff_score = float(eval_result.get("diff_score", 0.0))

    with _get_connection(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT INTO speech_attempts (
                student_name, target_word, phoneme, passed, diff_score, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (student_name, target_word, phoneme, passed, diff_score, created_at),
        )
        conn.commit()
        return int(cursor.lastrowid)


def get_weak_phonemes(
    student_name: str,
    db_path: Path = DB_PATH,
) -> list[dict[str, Any]]:
    """Возвращает статистику ошибок по фонемам для указанного ученика."""
    init_db(db_path)
    with _get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT
                phoneme,
                COUNT(*) AS total_attempts,
                SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) AS failed_attempts,
                ROUND(AVG(diff_score), 4) AS avg_diff_score
            FROM speech_attempts
            WHERE student_name = ?
            GROUP BY phoneme
            ORDER BY failed_attempts DESC, avg_diff_score DESC
            """,
            (student_name,),
        ).fetchall()

    stats = []
    for row in rows:
        total = int(row["total_attempts"])
        failed = int(row["failed_attempts"])
        stats.append(
            {
                "phoneme": row["phoneme"],
                "total_attempts": total,
                "failed_attempts": failed,
                "error_rate": round(failed / total, 3) if total > 0 else 0.0,
                "avg_diff_score": float(row["avg_diff_score"]),
            }
        )
    return stats


def _pick_practice_word(text: str) -> str:
    """Выбирает целевое слово для тренировки произношения (предпочтительно со специфическими казахскими фонемами)."""
    words = re.findall(r"[а-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ]+", text)
    if not words:
        return ""

    specific_chars = set(CONFUSING_CHARS.keys())
    scored = sorted(
        words,
        key=lambda w: (
            sum(1 for ch in w if ch in specific_chars),
            len(w),
        ),
        reverse=True,
    )
    return scored[0]


def _offline_fallback_cards(raw_text: str) -> list[dict[str, Any]]:
    """Локальный фолбэк: разбивает текст по предложениям на 2–3 микро-карточки без вызова LLM."""
    cleaned = re.sub(r"\s+", " ", raw_text).strip()
    if not cleaned:
        return []

    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]
    if not sentences:
        sentences = [cleaned]

    # Группируем предложения в 2–3 микро-карточки (по 1–2 предложения)
    cards_texts: list[str] = []
    if len(sentences) <= 3:
        cards_texts = sentences
    else:
        chunk_size = max(1, (len(sentences) + 2) // 3)
        for i in range(0, len(sentences), chunk_size):
            cards_texts.append(" ".join(sentences[i : i + chunk_size]))

    cards: list[dict[str, Any]] = []
    for idx, card_text in enumerate(cards_texts, start=1):
        practice_word = _pick_practice_word(card_text)
        cards.append(
            {
                "card_number": idx,
                "text": card_text,
                "practice_word": practice_word,
                "question": f"Осы үзіндіде «{practice_word}» сөзі қандай мағынада айтылған?"
                if practice_word
                else "Осы үзіндінің негізгі ойы қандай?",
            }
        )
    return cards


def adapt_text_with_kazllm(
    raw_text: str,
    ollama_url: str = "http://127.0.0.1:11434/api/generate",
    model_name: str = "kazllm",
    timeout: int = 15,
) -> dict[str, Any]:
    """
    Адаптирует казахский текст в 2–3 микро-карточки через Ollama (kazllm).
    При недоступности Ollama автоматически переключается на локальный офлайн-фолбэк.
    Каждая карточка обогащается полем `dyslexia_markup` из `format_for_dyslexia()`.
    """
    prompt = (
        "Сен дислексиясы және СДВГ (зейін тапшылығы) бар балаларға арналған қазақ тілі мұғалімісің. "
        "Төмендегі күрделі мәтінді 2–3 қысқа микро-карточкаға бөл. "
        "Әр карточкада 1–2 қарапайым, түсінікті сөйлем болсын. "
        "Әр карточка үшін айтылуын жаттықтыруға арналған бір мақсатты сөзді (practice_word) "
        "және мәтінді түсінгенін тексеретін бір қысқа сұрақты (question) таңда. "
        'Жауапты тек JSON форматында қайтар: {"cards": [{"text": "...", "practice_word": "...", "question": "..."}]}.\n\n'
        f"Мәтін:\n{raw_text}"
    )

    payload = {
        "model": model_name,
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.2},
    }

    source = "kazllm"
    cards: list[dict[str, Any]] = []

    try:
        req = urllib.request.Request(
            ollama_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            raw_response = body.get("response", "")
            parsed = json.loads(raw_response) if isinstance(raw_response, str) else raw_response
            llm_cards = parsed.get("cards", []) if isinstance(parsed, dict) else []

            if isinstance(llm_cards, list) and llm_cards:
                for idx, item in enumerate(llm_cards, start=1):
                    if not isinstance(item, dict) or not item.get("text"):
                        continue
                    card_text = str(item["text"]).strip()
                    practice_word = str(item.get("practice_word") or _pick_practice_word(card_text)).strip()
                    question = str(item.get("question") or "Осы үзіндінің негізгі ойы қандай?").strip()
                    cards.append(
                        {
                            "card_number": idx,
                            "text": card_text,
                            "practice_word": practice_word,
                            "question": question,
                        }
                    )
            if not cards:
                raise ValueError("Empty cards returned by Ollama")
    except (
        urllib.error.URLError,
        ConnectionError,
        TimeoutError,
        OSError,
        json.JSONDecodeError,
        ValueError,
    ):
        source = "offline_fallback"
        cards = _offline_fallback_cards(raw_text)

    for card in cards:
        card["dyslexia_markup"] = format_for_dyslexia(card["text"])

    return {
        "source": source,
        "model": model_name if source == "kazllm" else "offline_fallback",
        "cards": cards,
    }


if __name__ == "__main__":
    init_db()
    print(f"SQLite DB initialized at: {DB_PATH}")

    sample_text = (
        "Сырдария өзені Қызылорда облысының аумағынан ағып өтіп, "
        "Кіші Арал теңізіне құяды. Бұл өңірде күріш шаруашылығы жақсы дамыған. "
        "Ғалымдар су ресурстарын тиімді пайдалану жолдарын зерттеуде."
    )

    adapted = adapt_text_with_kazllm(sample_text, timeout=2)
    print(f"Adaptation source: {adapted['source']} (cards: {len(adapted['cards'])})")
    for card in adapted["cards"]:
        print(f"\n--- Карточка #{card['card_number']} ---")
        print("Слоги:", card["dyslexia_markup"]["syllable_text"])
        print("Целевое слово:", card["practice_word"])
        print("Вопрос:", card["question"])

    lesson_id = save_lesson(
        grade=4,
        subject="Дүниетану",
        title="Сырдария өзені",
        raw_text=sample_text,
        adapted_data=adapted,
    )
    print(f"\nSaved sample lesson with id={lesson_id}")

    log_speech_attempt(
        "Айгерім",
        {"target_word": "Қызылорда", "phoneme": "қ", "passed": False, "diff_score": 0.42},
    )
    log_speech_attempt(
        "Айгерім",
        {"target_word": "аумағынан", "phoneme": "ғ", "passed": True, "diff_score": 0.12},
    )
    print("Weak phonemes for Айгерім:", json.dumps(get_weak_phonemes("Айгерім"), ensure_ascii=False))
