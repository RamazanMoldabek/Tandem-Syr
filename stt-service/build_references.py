import asyncio
import os
import tempfile
from pathlib import Path

os.environ["HF_HOME"] = "D:/models/huggingface"

import edge_tts
import librosa
import torch
import torch.nn.functional as F
from transformers import AutoProcessor, Wav2Vec2ForCTC

MODEL_ID = "facebook/mms-1b-all"
OUTPUT_PATH = Path(r"D:\tandem-syr\stt-service\reference_embeddings.pt")

MINIMAL_PAIRS = [
    ("қар", "кар", "қ"),
    ("аң", "ан", "ң"),
    ("ғалым", "галым", "ғ"),
    ("көл", "кол", "ө"),
    ("түн", "тұн", "ү"),
    ("ара", "ала", "р"),
]

VOICES = ["kk-KZ-AigulNeural", "kk-KZ-DauletNeural"]
RATES = ["+0%", "-15%"]


async def synthesize_word(text: str, voice: str, rate: str, out_path: Path) -> None:
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
    await communicate.save(str(out_path))


def extract_3seg_embedding(
    audio_path: Path,
    processor: AutoProcessor,
    model: Wav2Vec2ForCTC,
    device: str = "cuda",
) -> torch.Tensor:
    waveform, _ = librosa.load(str(audio_path), sr=16000, mono=True)
    trimmed, _ = librosa.effects.trim(waveform, top_db=25)
    if len(trimmed) >= 1600:
        waveform = trimmed

    inputs = processor(waveform, sampling_rate=16000, return_tensors="pt")
    input_values = inputs.input_values.to(device=device, dtype=torch.float16)

    with torch.no_grad():
        outputs = model(input_values=input_values, output_hidden_states=True)
        hidden = outputs.hidden_states[-2].squeeze(0).float()

    segments = torch.tensor_split(hidden, 3, dim=0)
    pooled = torch.cat([seg.mean(dim=0) for seg in segments], dim=0)
    emb = F.normalize(pooled, p=2, dim=0).cpu()
    return emb


async def build_all_references() -> None:
    print(f"Загрузка {MODEL_ID} (адаптер 'kaz') на CUDA в float16...")
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    processor.tokenizer.set_target_lang("kaz")

    model = Wav2Vec2ForCTC.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float16,
    )
    model.load_adapter("kaz")
    model.to("cuda")
    model.eval()
    print("Модель MMS-1B-all загружена!")

    unique_words = []
    for target, distractor, _ in MINIMAL_PAIRS:
        for w in (target, distractor):
            if w not in unique_words:
                unique_words.append(w)

    embeddings_db: dict[str, torch.Tensor] = {}

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_root = Path(tmp_dir)
        for word in unique_words:
            word_embs = []
            for voice in VOICES:
                for rate in RATES:
                    safe_rate = rate.replace("+", "p").replace("-", "m").replace("%", "")
                    mp3_path = tmp_root / f"{word}_{voice}_{safe_rate}.mp3"
                    await synthesize_word(word, voice, rate, mp3_path)
                    emb = extract_3seg_embedding(mp3_path, processor, model)
                    word_embs.append(emb)
            embeddings_db[word] = torch.stack(word_embs, dim=0)
            print(f"  [OK] '{word}': {embeddings_db[word].shape}")

    payload = {
        "pairs": MINIMAL_PAIRS,
        "embeddings": embeddings_db,
    }
    torch.save(payload, str(OUTPUT_PATH))
    print(f"\nСохранено в {OUTPUT_PATH} ({len(embeddings_db)} слов).")


if __name__ == "__main__":
    asyncio.run(build_all_references())
