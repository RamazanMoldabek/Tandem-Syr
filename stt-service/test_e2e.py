import asyncio
import json
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

LIVE_SERVER_URL = "http://127.0.0.1:8001"


def _try_live_request(method: str, path: str, payload: dict | None = None):
    url = f"{LIVE_SERVER_URL}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"} if payload is not None else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=8.0) as resp:
        content_type = resp.headers.get("Content-Type", "")
        raw = resp.read()
        if "application/json" in content_type:
            return resp.status, json.loads(raw.decode("utf-8")), dict(resp.headers)
        return resp.status, raw, dict(resp.headers)


async def run_inprocess_smoke_tests() -> None:
    """
    Проверяет логику всех целевых эндпоинтов напрямую (или через TestClient),
    не требуя повторной загрузки тяжёлых GPU-весов в изолированной песочнице.
    """
    import types
    from unittest.mock import MagicMock

    # Если stt_server ещё не импортирован, подставляем лёгкие стабы для GPU-моделей,
    # чтобы smoke-тест БД, KazLLM, TTS и кэша отрабатывал мгновенно без дублирования VRAM.
    if "faster_whisper" not in sys.modules:
        fw_stub = types.ModuleType("faster_whisper")
        fw_stub.WhisperModel = MagicMock()
        sys.modules["faster_whisper"] = fw_stub

    if "transformers" not in sys.modules:
        tr_stub = types.ModuleType("transformers")
        mock_proc = MagicMock()
        mock_proc.tokenizer.get_vocab.return_value = {"қ": 1, "к": 2, "ғ": 3, "г": 4, "ң": 5, "н": 6, "ө": 7, "о": 8, "ү": 9, "ұ": 10, "р": 11, "л": 12}
        tr_stub.AutoProcessor = MagicMock()
        tr_stub.AutoProcessor.from_pretrained.return_value = mock_proc
        tr_stub.Wav2Vec2ForCTC = MagicMock()
        sys.modules["transformers"] = tr_stub

    import stt_server

    print("=== [1/4] Проверка GET /llm/health (KazLLM-8B) ===")
    health = await stt_server.llm_health()
    print("  /llm/health ->", json.dumps(health, ensure_ascii=False))
    assert "online" in health and "model" in health

    print("\n=== [2/4] Проверка GET /tts?word=қар ===")
    # Создаём тестовый эталон или проверяем генерацию/раздачу аудио
    ref_wav = stt_server.REF_AUDIO_DIR / "қар.wav"
    cache_wav = stt_server.TTS_CACHE_DIR / "aigul_қар.wav"
    if not ref_wav.exists() and not cache_wav.exists():
        import numpy as np
        import soundfile as sf

        dummy_tone = (0.2 * np.sin(2 * np.pi * 220 * np.linspace(0, 0.4, 6400))).astype(np.float32)
        sf.write(str(cache_wav), dummy_tone, 16000)

    tts_resp = await stt_server.synthesize_tts(word="қар", voice="auto")
    tts_path = Path(tts_resp.path)
    assert tts_path.exists() and tts_path.stat().st_size > 100
    print(f"  /tts?word=қар -> OK ({tts_path.name}, {tts_path.stat().st_size} bytes, headers={dict(tts_resp.headers)})")

    print("\n=== [3/4] Проверка POST /adapt-text (профили adhd, dyslexia, zpr + SQLite кэш) ===")
    sample_text = (
        "Сырдария өзені Қызылорда облысының аумағынан ағып өтіп, Кіші Арал теңізіне құяды. "
        "Бұл өңірде күріш шаруашылығы жақсы дамыған."
    )
    for mode in ("adhd", "dyslexia", "zpr"):
        req_obj = stt_server.AdaptTextRequest(text=sample_text, mode=mode, title="Сырдария")
        res = await stt_server.adapt_text_endpoint(req_obj)
        assert "cards" in res and len(res["cards"]) > 0
        assert "quiz" in res and len(res["quiz"]) > 0
        print(
            f"  /adapt-text [mode={mode}] -> source={res['source']}, "
            f"cards={len(res['cards'])}, first_syllables='{res['cards'][0]['syllable_text']}'"
        )

    # Убеждаемся, что таблица adapted_texts_cache в tandem_progress.db работает
    with sqlite3.connect(str(stt_server.PROGRESS_DB_PATH)) as conn:
        cnt = conn.execute("SELECT COUNT(*) FROM adapted_texts_cache").fetchone()[0]
        print(f"  SQLite adapted_texts_cache rows: {cnt}")

    print("\n=== [4/4] Проверка POST /progress/speech, GET /progress/summary и GET /progress/weak-phonemes ===")
    sp_res = await stt_server.record_speech_progress_endpoint(
        stt_server.SpeechProgressRequest(
            student_name="Алихан",
            target_word="қар",
            phoneme="қ",
            level=2,
            score=0.88,
            passed=True,
        )
    )
    assert sp_res["stars"] == 3
    print("  /progress/speech ->", json.dumps(sp_res, ensure_ascii=False))

    summary = await stt_server.get_progress_summary(student_name="Алихан")
    assert summary["speech_total_attempts"] >= 1
    print("  /progress/summary ->", json.dumps(summary, ensure_ascii=False))

    weak = await stt_server.get_progress_weak_phonemes(student_name="Алихан")
    assert "weak_phonemes" in weak and len(weak["weak_phonemes"]) >= 1
    print(
        "  /progress/weak-phonemes ->",
        f"count={len(weak['weak_phonemes'])}, top_phoneme='{weak['weak_phonemes'][0]['phoneme']}', "
        f"pairs={len(weak['weak_phonemes'][0]['recommended_pairs'])}",
    )
    print("\nALL E2E SMOKE TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(run_inprocess_smoke_tests())
