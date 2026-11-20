from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from lesson_engine import (
    adapt_text_with_kazllm,
    get_lessons,
    get_weak_phonemes,
    save_lesson,
)

router = APIRouter(tags=["lessons"])


class AdaptLessonRequest(BaseModel):
    grade: int = Field(..., ge=1, le=12)
    subject: str
    title: str
    raw_text: str
    ollama_url: Optional[str] = None


@router.post("/lessons/adapt")
def adapt_lesson(payload: AdaptLessonRequest) -> dict[str, Any]:
    ollama_url = payload.ollama_url or "http://127.0.0.1:11434/api/generate"
    adapted = adapt_text_with_kazllm(
        raw_text=payload.raw_text,
        ollama_url=ollama_url,
    )
    lesson_id = save_lesson(
        grade=payload.grade,
        subject=payload.subject,
        title=payload.title,
        raw_text=payload.raw_text,
        adapted_data=adapted,
    )
    return {
        "id": lesson_id,
        "grade": payload.grade,
        "subject": payload.subject,
        "title": payload.title,
        "source": adapted["source"],
        "cards": adapted["cards"],
    }


@router.get("/lessons")
def list_lessons() -> dict[str, Any]:
    lessons = get_lessons()
    return {"lessons": lessons, "count": len(lessons)}


@router.get("/students/{student_name}/weak-phonemes")
def student_weak_phonemes(student_name: str) -> dict[str, Any]:
    stats = get_weak_phonemes(student_name)
    return {
        "student_name": student_name,
        "weak_phonemes": stats,
    }
